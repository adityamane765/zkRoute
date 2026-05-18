"""
Provider Agent — autonomous signal generation, commitment, and encrypted relay.

Loop:
  1. Run private strategy → generate signal (direction + asset)
  2. Commit signal hash on Arc (CommitReveal contract)
  3. Execute own position (head-start)
  4. Encrypt signal to each subscriber's buyer agent pubkey
  5. POST encrypted signals to backend relay
  6. After price resolves: reveal signal, record outcome
  7. Periodically: generate ZK proof of track record, submit on-chain
"""

import asyncio
import os
import time
import secrets
import logging
from dataclasses import dataclass, field
from typing import Literal

import httpx
from anthropic import Anthropic
from dotenv import load_dotenv

from ..shared import crypto, oracle
from ..shared.chain import get_web3, get_account, CommitRevealContract, SignalMarketContract
from ..shared.config import (
    ARC_RPC_URL,
    COMMIT_REVEAL_ADDRESS,
    SIGNAL_MARKET_ADDRESS,
    BACKEND_URL,
)

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s [PROVIDER] %(message)s")
log = logging.getLogger(__name__)

PROVIDER_PRIVATE_KEY = os.environ["PROVIDER_AGENT_PRIVATE_KEY"]
PROVIDER_SIGNING_KEY = os.environ["PROVIDER_SIGNING_KEY"]  # NaCl privkey hex

# How long to wait before revealing (must be > 1 block on Arc)
REVEAL_DELAY_SECONDS = 300   # 5 minutes = provider head-start window
SIGNAL_INTERVAL_SECONDS = int(os.environ.get("SIGNAL_INTERVAL_SECONDS", "14400"))  # 4h default

SUPPORTED_ASSETS = ["ETH", "BTC"]


@dataclass
class PendingSignal:
    signal_id: str
    salt: str
    direction: int       # 1=long, 0=short
    asset: str
    commit_time: float
    entry_price: float
    commitment_hash: bytes
    subscribers: list[dict] = field(default_factory=list)


class ProviderAgent:
    def __init__(self):
        self.w3 = get_web3()
        self.account = get_account(PROVIDER_PRIVATE_KEY)
        self.commit_reveal = CommitRevealContract(self.w3, COMMIT_REVEAL_ADDRESS)
        self.signal_market = SignalMarketContract(self.w3, SIGNAL_MARKET_ADDRESS)
        self.claude = Anthropic()
        self.pending: dict[str, PendingSignal] = {}
        self.signal_history: list[dict] = []   # for ZK proof generation

    # ── Strategy: Claude generates directional signal ───────────────────────

    async def generate_signal(self, asset: str) -> tuple[Literal[0, 1], str]:
        """
        Calls Claude to analyze market context and return direction.
        In production: replace with actual quant model / strategy.
        Returns (direction, rationale_private).
        """
        price = await oracle.get_price(asset)
        response = self.claude.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=256,
            system=(
                "You are a quant trading signal generator. "
                "Given current price data, return a JSON object with: "
                '{"direction": 1 or 0, "confidence": 0.0-1.0, "rationale": "..."} '
                "Direction 1=long, 0=short. Be concise. Only output valid JSON."
            ),
            messages=[{
                "role": "user",
                "content": f"Asset: {asset}, Current price: ${price:.2f}. Generate signal.",
            }],
        )
        import json
        data = json.loads(response.content[0].text)
        direction = int(data["direction"])
        rationale = data.get("rationale", "")
        log.info(f"Signal generated: {asset} {'LONG' if direction else 'SHORT'} @ ${price:.2f}")
        return direction, rationale

    # ── Main loop ────────────────────────────────────────────────────────────

    async def run(self):
        log.info(f"Provider agent started. Address: {self.account.address}")
        await asyncio.gather(
            self._signal_loop(),
            self._reveal_loop(),
        )

    async def _signal_loop(self):
        """Generates and commits a signal on each interval."""
        while True:
            try:
                for asset in SUPPORTED_ASSETS:
                    await self._emit_signal(asset)
            except Exception as e:
                log.error(f"Signal loop error: {e}")
            await asyncio.sleep(SIGNAL_INTERVAL_SECONDS)

    async def _emit_signal(self, asset: str):
        direction, _ = await self.generate_signal(asset)
        signal_id = crypto.generate_signal_id()
        salt = crypto.generate_salt()
        entry_price = await oracle.get_price(asset)

        # 1. Commit on-chain
        commitment_hash = crypto.compute_commitment_hash(signal_id, direction, asset, salt)
        signal_id_bytes = bytes.fromhex(signal_id.lstrip("0x").zfill(64))
        tx = self.commit_reveal.commit(self.account, signal_id_bytes, commitment_hash)
        log.info(f"Committed {asset} signal {signal_id[:10]}... tx={tx[:10]}...")

        pending = PendingSignal(
            signal_id=signal_id,
            salt=salt,
            direction=direction,
            asset=asset,
            commit_time=time.time(),
            entry_price=entry_price,
            commitment_hash=commitment_hash,
        )

        # 2. Fetch active subscribers from backend
        subscribers = await self._get_subscribers()
        pending.subscribers = subscribers

        # 3. Encrypt signal to each subscriber's buyer agent pubkey and relay
        await self._relay_encrypted_signals(pending, subscribers)

        self.pending[signal_id] = pending

    async def _relay_encrypted_signals(self, sig: PendingSignal, subscribers: list[dict]):
        """Encrypt the signal to each subscriber's buyer agent pubkey and POST to relay."""
        signal_data = {
            "signal_id": sig.signal_id,
            "asset": sig.asset,
            "direction": sig.direction,  # 1=long, 0=short  (NOT the full strategy)
            "size_hint_pct": 3,          # suggested % of portfolio — buyer agent may override
            "commit_time": sig.commit_time,
        }

        async with httpx.AsyncClient(timeout=10) as client:
            for sub in subscribers:
                buyer_pubkey = sub["buyerAgentPubKey"]
                encrypted = crypto.encrypt_signal(
                    signal_data,
                    buyer_pubkey,
                    PROVIDER_SIGNING_KEY,
                )
                provider_pubkey = os.environ["PROVIDER_AGENT_PUBLIC_KEY"]
                payload = {
                    "provider": self.account.address,
                    "buyer": sub["buyerAddress"],
                    "provider_pubkey": provider_pubkey,
                    "signal_id": sig.signal_id,
                    "encrypted_signal": encrypted,
                }
                try:
                    await client.post(f"{BACKEND_URL}/signals/relay", json=payload)
                    log.info(f"Relayed signal to buyer {sub['buyerAddress'][:10]}...")
                except Exception as e:
                    log.warning(f"Relay failed for {sub['buyerAddress'][:10]}: {e}")

    async def _reveal_loop(self):
        """Checks pending signals; reveals those past the delay window."""
        while True:
            now = time.time()
            to_reveal = [
                sig for sig in self.pending.values()
                if now - sig.commit_time >= REVEAL_DELAY_SECONDS
            ]
            for sig in to_reveal:
                await self._reveal_signal(sig)
                del self.pending[sig.signal_id]
            await asyncio.sleep(60)

    async def _reveal_signal(self, sig: PendingSignal):
        """Reveals the signal and determines outcome from oracle."""
        current_price = await oracle.get_price(sig.asset)
        outcome = (
            (sig.direction == 1 and current_price > sig.entry_price)
            or (sig.direction == 0 and current_price < sig.entry_price)
        )
        return_bps = int(
            abs(current_price - sig.entry_price) / sig.entry_price * 10000
            * (1 if outcome else -1)
        )

        signal_id_bytes = bytes.fromhex(sig.signal_id.lstrip("0x").zfill(64))
        from web3 import Web3
        asset_id_bytes = Web3.keccak(text=sig.asset)
        salt_bytes = bytes.fromhex(sig.salt.lstrip("0x").zfill(64))

        tx = self.commit_reveal.reveal(
            self.account,
            signal_id_bytes,
            sig.direction,
            asset_id_bytes,
            salt_bytes,
            outcome,
        )
        log.info(
            f"Revealed {sig.asset} signal {sig.signal_id[:10]}... "
            f"outcome={'WIN' if outcome else 'LOSS'} return={return_bps}bps tx={tx[:10]}..."
        )

        self.signal_history.append({
            "signalId": sig.signal_id,
            "direction": sig.direction,
            "salt": sig.salt,
            "outcome": 1 if outcome else 0,
            "returnBps": 5000 + return_bps,  # offset encoding for ZK circuit
        })

        # Notify backend of outcome (for buyer dashboard)
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(f"{BACKEND_URL}/signals/outcome", json={
                "signal_id": sig.signal_id,
                "provider": self.account.address,
                "outcome": outcome,
                "return_bps": return_bps,
                "exit_price": current_price,
            })

    async def _get_subscribers(self) -> list[dict]:
        """Fetches active subscribers for this provider from the backend."""
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(
                f"{BACKEND_URL}/providers/{self.account.address}/subscribers"
            )
            if resp.status_code == 200:
                return resp.json()
        return []

    def save_signal_history(self, path: str = "signals.json"):
        """Writes signal history to file for ZK proof generation."""
        import json
        with open(path, "w") as f:
            json.dump(self.signal_history, f, indent=2)
        log.info(f"Signal history saved to {path} ({len(self.signal_history)} signals)")


async def main():
    agent = ProviderAgent()
    await agent.run()


if __name__ == "__main__":
    asyncio.run(main())
