"""
Buyer Agent — decrypts incoming signals, enforces risk bounds, executes trades.

The human buyer configures risk limits and starts the agent.
After that, the agent runs autonomously:
  1. Polls backend for new encrypted signals from subscribed providers
  2. Decrypts each signal using buyer agent's private key
  3. Validates signal against buyer's risk bounds (rejects if violated)
  4. Executes trade via Circle Programmable Wallet
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

from ..shared import crypto, oracle, circle_wallets
from ..shared.trade import TradeRequest, execute_trade
from ..shared.chain import get_web3, get_account, SignalMarketContract
from ..shared.config import BACKEND_URL, SIGNAL_MARKET_ADDRESS
from ..shared.risk import (
    RiskBounds,
    RiskState,
    cap_size,
    estimate_var_increment,
    evaluate_signal,
)

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s [BUYER] %(message)s")
log = logging.getLogger(__name__)

BUYER_AGENT_PRIVATE_KEY = os.environ["BUYER_AGENT_PRIVATE_KEY"]
BUYER_AGENT_NACL_PRIVKEY = os.environ["BUYER_AGENT_NACL_PRIVKEY"]
BUYER_ADDRESS = os.environ["BUYER_ADDRESS"]
CIRCLE_API_KEY = os.environ["CIRCLE_API_KEY"]
CIRCLE_WALLET_ID = os.environ["CIRCLE_WALLET_ID"]

POLL_INTERVAL_SECONDS = 30
POSITION_MONITOR_INTERVAL = 300  # 5 min

# Arc token addresses — set in .env, fallback to well-known Arc testnet values
ARC_TOKEN_ADDRESSES: dict[str, str] = {
    k: v for k, v in [
        ("ETH",  os.environ.get("ARC_ETH_ADDRESS",  "")),
        ("BTC",  os.environ.get("ARC_BTC_ADDRESS",  "")),
        ("USDC", os.environ.get("USDC_ADDRESS",     "")),
    ] if v
}


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
        self.risk_state = RiskState(day_start=time.time())
        self.open_positions: dict[str, Position] = {}
        self.processed_signal_ids: set[str] = set()

    async def run(self):
        log.info(f"Buyer agent started. Agent={self.account.address}  Buyer={BUYER_ADDRESS}")
        log.info(f"Circle wallet: {CIRCLE_WALLET_ID}")
        balance = await circle_wallets.get_usdc_balance(CIRCLE_WALLET_ID)
        log.info(f"USDC balance: ${balance:.2f}")
        await asyncio.gather(
            self._signal_poll_loop(),
            self._position_monitor_loop(),
        )

    # ── Signal loop ──────────────────────────────────────────────────────────

    async def _signal_poll_loop(self):
        while True:
            try:
                await self._process_pending_signals()
            except Exception as e:
                log.error(f"Signal poll error: {e}")
            await asyncio.sleep(POLL_INTERVAL_SECONDS)

    async def _process_pending_signals(self):
        if self.risk_bounds.kill_switch:
            log.info("Kill switch active — skipping signal processing")
            return

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{BACKEND_URL}/signals/pending/{BUYER_ADDRESS}")
            if resp.status_code != 200:
                return
            signals = resp.json()

        # Track which signals processed successfully so we can /ack them.
        # Re-deliveries (due to the LEASE_SECONDS retry window in the relay)
        # are deduped by processed_signal_ids — safe to /ack either way.
        to_ack: list[str] = []
        for item in signals:
            signal_id = item["signal_id"]
            if signal_id in self.processed_signal_ids:
                to_ack.append(signal_id)
                continue
            self.processed_signal_ids.add(signal_id)
            try:
                await self._handle_signal(item)
                to_ack.append(signal_id)
            except Exception as e:
                # Don't ack on failure — relay will redeliver after the lease.
                log.error(f"handle_signal failed for {signal_id[:10]}: {e}")

        if to_ack:
            try:
                async with httpx.AsyncClient(timeout=5) as client:
                    await client.post(f"{BACKEND_URL}/signals/ack", json={
                        "buyer": BUYER_ADDRESS,
                        "signal_ids": to_ack,
                    })
            except Exception as e:
                log.warning(f"ack failed (will redeliver after lease): {e}")

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

        log.info(f"Decrypted signal: {asset} {'LONG' if direction else 'SHORT'} from {provider[:10]}")

        # 2. Risk validation
        rejection = evaluate_signal(self.risk_bounds, self.risk_state, time.time(), asset, size_hint_pct)
        if rejection:
            log.info(f"Signal rejected ({rejection}): {signal_id[:10]}")
            await self._report_rejection(signal_id, provider, rejection)
            return

        # 3. Get entry price and cap size
        entry_price = await oracle.get_price(asset)
        actual_size_pct = cap_size(self.risk_bounds, size_hint_pct)

        # 4. Execute trade via Circle Wallet
        circle_tx_id = await self._execute_trade(asset, direction, actual_size_pct, signal_id)
        if not circle_tx_id:
            log.error(f"Trade execution failed for signal {signal_id[:10]} — skipping payment")
            return

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
        self.risk_state.daily_var_used += estimate_var_increment(actual_size_pct)

        # 5. Nanopayment on-chain
        try:
            tx = self.signal_market.process_signal_payment(self.account, provider, BUYER_ADDRESS)
            log.info(f"Nanopayment sent: tx={tx[:10]}")
        except Exception as e:
            log.warning(f"Nanopayment failed (trade already executed): {e}")

        # 6. Report position opened (not the signal content)
        await self._report_position_opened(position)

    # ── Trade execution via Circle Programmable Wallet ───────────────────────

    async def _execute_trade(
        self, asset: str, direction: int, size_pct: float, signal_id: str
    ) -> str:
        """Delegates to the trade dispatcher in shared/trade.py."""
        usdc_balance = await circle_wallets.get_usdc_balance(CIRCLE_WALLET_ID)
        trade_amount_usdc = usdc_balance * (size_pct / 100.0)

        if trade_amount_usdc < 0.01:
            log.warning(f"Insufficient balance for trade: ${usdc_balance:.2f} USDC")
            return ""

        token_address = ARC_TOKEN_ADDRESSES.get(asset.upper())
        if not token_address:
            log.warning(f"No Arc address configured for {asset} — check ARC_{asset}_ADDRESS in .env")
            return ""

        if direction == 0:  # SHORT — use dedicated vault if configured
            token_address = os.environ.get("ARC_SHORT_VAULT_ADDRESS", token_address)

        req = TradeRequest(
            asset=asset,
            direction=direction,
            size_usdc=trade_amount_usdc,
            signal_id=signal_id,
            token_address=token_address,
            wallet_id=CIRCLE_WALLET_ID,
            idempotency_key=f"zkroute_{signal_id}_{asset}_{direction}",
        )
        return await execute_trade(req)

    # ── Position monitoring ───────────────────────────────────────────────────

    async def _position_monitor_loop(self):
        while True:
            await asyncio.sleep(POSITION_MONITOR_INTERVAL)
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

    # ── Reporting ────────────────────────────────────────────────────────────

    async def _report_position_opened(self, pos: Position):
        async with httpx.AsyncClient(timeout=5) as client:
            await client.post(f"{BACKEND_URL}/buyer/positions", json={
                "buyer": BUYER_ADDRESS,
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
            f"{pos.size_pct:.1f}% @ ${pos.entry_price:.2f} | circle_tx={pos.circle_tx_id}"
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
                "buyer": BUYER_ADDRESS,
                "signal_id": signal_id,
                "provider": provider,
                "reason": reason,
            })


async def main():
    bounds = RiskBounds(
        max_position_pct=float(os.environ.get("MAX_POSITION_PCT", "5.0")),
        max_leverage=float(os.environ.get("MAX_LEVERAGE", "1.0")),
        allowed_assets=frozenset(os.environ.get("ALLOWED_ASSETS", "ETH,BTC").split(",")),
        daily_var_pct=float(os.environ.get("DAILY_VAR_PCT", "3.0")),
    )
    agent = BuyerAgent(risk_bounds=bounds)
    await agent.run()


if __name__ == "__main__":
    asyncio.run(main())
