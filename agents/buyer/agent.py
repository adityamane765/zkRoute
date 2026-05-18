"""
Buyer Agent — decrypts incoming signals, enforces risk bounds, executes trades.

The human buyer configures risk limits and starts the agent.
After that, the agent runs autonomously:
  1. Polls backend for new encrypted signals from subscribed providers
  2. Decrypts each signal using buyer agent's private key
  3. Validates signal against buyer's risk bounds (rejects if violated)
  4. Executes trade via Circle Wallet (programmatic key management)
  5. Triggers nanopayment on-chain (SignalMarket.processSignalPayment)
  6. Reports position and PnL to buyer dashboard — never the raw signal
"""

import asyncio
import os
import time
import logging
from dataclasses import dataclass

import httpx
from dotenv import load_dotenv

from ..shared import crypto, oracle
from ..shared.chain import get_web3, get_account, SignalMarketContract
from ..shared.config import BACKEND_URL, SIGNAL_MARKET_ADDRESS

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s [BUYER] %(message)s")
log = logging.getLogger(__name__)

BUYER_AGENT_PRIVATE_KEY = os.environ["BUYER_AGENT_PRIVATE_KEY"]    # NaCl + ETH key
BUYER_AGENT_NACL_PRIVKEY = os.environ["BUYER_AGENT_NACL_PRIVKEY"]  # NaCl box privkey hex
CIRCLE_API_KEY = os.environ["CIRCLE_API_KEY"]
CIRCLE_WALLET_ID = os.environ.get("CIRCLE_WALLET_ID", "")

POLL_INTERVAL_SECONDS = 30


@dataclass
class RiskBounds:
    max_position_pct: float    # max % of portfolio per trade (e.g. 5.0)
    max_leverage: float        # e.g. 1.0 = no leverage, 2.0 = 2x
    allowed_assets: set[str]   # e.g. {"ETH", "BTC"}
    daily_var_pct: float       # max % portfolio loss in a day (e.g. 3.0)
    kill_switch: bool = False  # if True, agent rejects all signals


@dataclass
class Position:
    signal_id: str
    provider: str
    asset: str
    direction: int
    size_pct: float
    entry_price: float
    open_time: float
    circle_tx_id: str = ""


class BuyerAgent:
    def __init__(self, risk_bounds: RiskBounds):
        self.w3 = get_web3()
        self.account = get_account(BUYER_AGENT_PRIVATE_KEY)
        self.signal_market = SignalMarketContract(self.w3, SIGNAL_MARKET_ADDRESS)
        self.risk_bounds = risk_bounds
        self.open_positions: dict[str, Position] = {}
        self.daily_var_used: float = 0.0
        self.day_start: float = time.time()
        self.processed_signal_ids: set[str] = set()

    # ── Main loop ────────────────────────────────────────────────────────────

    async def run(self):
        log.info(f"Buyer agent started. Address: {self.account.address}")
        await asyncio.gather(
            self._signal_poll_loop(),
            self._position_monitor_loop(),
        )

    async def _signal_poll_loop(self):
        while True:
            try:
                await self._process_pending_signals()
            except Exception as e:
                log.error(f"Signal poll error: {e}")
            await asyncio.sleep(POLL_INTERVAL_SECONDS)

    async def _process_pending_signals(self):
        """Fetches unread encrypted signals from backend and processes each."""
        if self.risk_bounds.kill_switch:
            log.info("Kill switch active — skipping signal processing")
            return

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{BACKEND_URL}/signals/pending/{self.account.address}"
            )
            if resp.status_code != 200:
                return
            signals = resp.json()

        for item in signals:
            signal_id = item["signal_id"]
            if signal_id in self.processed_signal_ids:
                continue
            self.processed_signal_ids.add(signal_id)
            await self._handle_signal(item)

    async def _handle_signal(self, item: dict):
        provider = item["provider"]
        provider_pubkey = item["provider_pubkey"]
        encrypted = item["encrypted_signal"]

        # 1. Decrypt
        try:
            signal = crypto.decrypt_signal(encrypted, provider_pubkey, BUYER_AGENT_NACL_PRIVKEY)
        except Exception as e:
            log.warning(f"Failed to decrypt signal from {provider[:10]}: {e}")
            return

        asset = signal["asset"]
        direction = signal["direction"]
        size_hint_pct = signal.get("size_hint_pct", 3.0)
        signal_id = signal["signal_id"]

        log.info(
            f"Decrypted signal: provider={provider[:10]} asset={asset} "
            f"dir={'LONG' if direction else 'SHORT'}"
        )

        # 2. Risk validation
        rejection = self._validate_risk(asset, size_hint_pct)
        if rejection:
            log.info(f"Signal rejected ({rejection}): {signal_id[:10]}")
            await self._report_rejection(signal_id, provider, rejection)
            return

        # 3. Execute trade
        entry_price = await oracle.get_price(asset)
        actual_size_pct = min(size_hint_pct, self.risk_bounds.max_position_pct)
        circle_tx_id = await self._execute_trade(asset, direction, actual_size_pct)

        position = Position(
            signal_id=signal_id,
            provider=provider,
            asset=asset,
            direction=direction,
            size_pct=actual_size_pct,
            entry_price=entry_price,
            open_time=time.time(),
            circle_tx_id=circle_tx_id,
        )
        self.open_positions[signal_id] = position
        self.daily_var_used += actual_size_pct * 0.3  # rough VaR estimate

        # 4. Nanopayment on-chain
        try:
            self.signal_market.process_signal_payment(self.account, provider)
        except Exception as e:
            log.warning(f"Nanopayment failed: {e}")

        # 5. Report to buyer dashboard (position opened — NOT the signal content)
        await self._report_position_opened(position)

    def _validate_risk(self, asset: str, size_hint_pct: float) -> str | None:
        """Returns rejection reason string, or None if signal is accepted."""
        rb = self.risk_bounds
        if rb.kill_switch:
            return "kill_switch"
        if asset.upper() not in rb.allowed_assets:
            return f"asset_not_allowed:{asset}"
        if size_hint_pct > rb.max_position_pct:
            # We'll cap it, not reject — only reject if 0 would be allocated
            pass
        self._reset_daily_var_if_new_day()
        if self.daily_var_used >= rb.daily_var_pct:
            return "daily_var_limit_reached"
        return None

    def _reset_daily_var_if_new_day(self):
        if time.time() - self.day_start >= 86400:
            self.daily_var_used = 0.0
            self.day_start = time.time()

    # ── Trade execution (Circle Wallets) ─────────────────────────────────────

    async def _execute_trade(self, asset: str, direction: int, size_pct: float) -> str:
        """
        Executes a trade via Circle Programmable Wallets API.
        Returns Circle transaction ID.
        For MVP: simulates execution if CIRCLE_WALLET_ID not set.
        """
        if not CIRCLE_WALLET_ID:
            # Simulation mode for local dev
            log.info(f"[SIM] Would trade {asset} {'LONG' if direction else 'SHORT'} {size_pct}%")
            return f"sim_tx_{int(time.time())}"

        headers = {
            "Authorization": f"Bearer {CIRCLE_API_KEY}",
            "Content-Type": "application/json",
        }
        # Circle Wallet transfer (swap to/from asset)
        # In production: use Circle's swap or DeFi integration
        payload = {
            "walletId": CIRCLE_WALLET_ID,
            "tokenAddress": _asset_to_token_address(asset),
            "amount": str(size_pct),  # simplified; real impl computes from portfolio value
            "destinationAddress": self.account.address,
            "idempotencyKey": f"zkroute_{asset}_{int(time.time())}",
        }
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                "https://api.circle.com/v1/w3s/wallets/transfers",
                headers=headers,
                json=payload,
            )
        if resp.status_code in (200, 201):
            return resp.json().get("data", {}).get("id", "unknown")
        log.warning(f"Circle trade failed: {resp.text}")
        return "failed"

    # ── Position monitoring ───────────────────────────────────────────────────

    async def _position_monitor_loop(self):
        """Periodically checks open positions and reports PnL."""
        while True:
            await asyncio.sleep(300)
            for sig_id, pos in list(self.open_positions.items()):
                try:
                    current_price = await oracle.get_price(pos.asset)
                    pnl_bps = int(
                        (current_price - pos.entry_price) / pos.entry_price * 10000
                        * (1 if pos.direction == 1 else -1)
                    )
                    await self._report_pnl_update(pos, current_price, pnl_bps)
                except Exception as e:
                    log.warning(f"Position monitor error for {sig_id[:10]}: {e}")

    # ── Reporting (human buyer sees these — never raw signal content) ────────

    async def _report_position_opened(self, pos: Position):
        async with httpx.AsyncClient(timeout=5) as client:
            await client.post(f"{BACKEND_URL}/buyer/positions", json={
                "buyer": self.account.address,
                "signal_id": pos.signal_id,
                "provider": pos.provider,
                "asset": pos.asset,
                "direction": pos.direction,
                "size_pct": pos.size_pct,
                "entry_price": pos.entry_price,
                "circle_tx_id": pos.circle_tx_id,
                "open_time": pos.open_time,
            })
        log.info(
            f"Position opened: {pos.asset} {'LONG' if pos.direction else 'SHORT'} "
            f"{pos.size_pct:.1f}% @ ${pos.entry_price:.2f}"
        )

    async def _report_pnl_update(self, pos: Position, current_price: float, pnl_bps: int):
        async with httpx.AsyncClient(timeout=5) as client:
            await client.patch(f"{BACKEND_URL}/buyer/positions/{pos.signal_id}", json={
                "current_price": current_price,
                "pnl_bps": pnl_bps,
            })

    async def _report_rejection(self, signal_id: str, provider: str, reason: str):
        async with httpx.AsyncClient(timeout=5) as client:
            await client.post(f"{BACKEND_URL}/buyer/rejections", json={
                "buyer": self.account.address,
                "signal_id": signal_id,
                "provider": provider,
                "reason": reason,
            })


def _asset_to_token_address(asset: str) -> str:
    addresses = {
        "ETH": "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
        "BTC": "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    }
    return addresses.get(asset.upper(), "")


async def main():
    bounds = RiskBounds(
        max_position_pct=float(os.environ.get("MAX_POSITION_PCT", "5.0")),
        max_leverage=float(os.environ.get("MAX_LEVERAGE", "1.0")),
        allowed_assets=set(os.environ.get("ALLOWED_ASSETS", "ETH,BTC").split(",")),
        daily_var_pct=float(os.environ.get("DAILY_VAR_PCT", "3.0")),
    )
    agent = BuyerAgent(risk_bounds=bounds)
    await agent.run()


if __name__ == "__main__":
    asyncio.run(main())
