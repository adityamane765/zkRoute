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
from google import genai
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

# How long to wait before revealing (must be > 1 block on Arc).
# Both knobs are env-overridable so demos can move faster than the 4h/5m defaults.
REVEAL_DELAY_SECONDS = int(os.environ.get("REVEAL_DELAY_SECONDS", "300"))     # 5m default
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
        # Gemini reads GEMINI_API_KEY (or GOOGLE_API_KEY) from env. If neither
        # is set, the client init below raises and the agent refuses to start
        # — better than failing inside the signal loop.
        self.gemini = genai.Client()
        self.gemini_model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
        self.pending: dict[str, PendingSignal] = {}
        self.signal_history: list[dict] = self._load_signal_history()

    def _load_signal_history(self) -> list[dict]:
        """Reloads signal_history from the append-only .jsonl file written by
        _reveal_signal so in-memory state survives agent restarts."""
        import json as _json
        history_path = os.environ.get("SIGNAL_HISTORY_PATH", "signal_history.jsonl")
        entries: list[dict] = []
        try:
            with open(history_path) as f:
                for line in f:
                    line = line.strip()
                    if line:
                        entries.append(_json.loads(line))
            if entries:
                log.info(f"Loaded {len(entries)} signal(s) from {history_path}")
        except FileNotFoundError:
            pass  # fresh start — file will be created on first reveal
        except Exception as e:
            log.warning(f"Could not load signal history from {history_path}: {e}")
        return entries

    # ── Strategy: Gemini generates directional signal ───────────────────────

    async def generate_signal(self, asset: str) -> tuple[Literal[0, 1], str]:
        """
        Calls Gemini to analyze market context and return direction.
        In production: replace with actual quant model / strategy.
        Returns (direction, rationale_private).
        """
        import json as _json
        price = await oracle.get_price(asset)
        prompt = (
            "You are a quant trading signal generator. "
            "Return ONLY a JSON object with exactly: "
            '{"direction": 1 or 0, "confidence": 0.0-1.0, "rationale": "..."} '
            "Direction 1=long, 0=short. No prose, no markdown fences.\n\n"
            f"Asset: {asset}\nCurrent price: ${price:.2f}\nGenerate signal."
        )
        # The SDK call is sync; run in a thread to avoid blocking the loop.
        response = await asyncio.to_thread(
            self.gemini.models.generate_content,
            model=self.gemini_model,
            contents=prompt,
        )
        text = (response.text or "").strip()
        # Strip ``` fences if Gemini wrapped JSON in a code block.
        if text.startswith("```"):
            text = text.strip("`")
            if text.lower().startswith("json"):
                text = text[4:].lstrip()
        try:
            data = _json.loads(text)
        except _json.JSONDecodeError:
            log.warning(f"Gemini returned non-JSON ({text[:80]!r}); defaulting to LONG")
            data = {"direction": 1, "rationale": "fallback"}
        direction = int(data.get("direction", 1))
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
        ZK_PROOF_EVERY_N = int(os.environ.get("ZK_PROOF_EVERY_N_SIGNALS", "10"))
        while True:
            now = time.time()
            to_reveal = [
                sig for sig in self.pending.values()
                if now - sig.commit_time >= REVEAL_DELAY_SECONDS
            ]
            for sig in to_reveal:
                await self._reveal_signal(sig)
                del self.pending[sig.signal_id]

            # Auto-submit ZK proof every N reveals
            if (
                len(self.signal_history) > 0
                and len(self.signal_history) % ZK_PROOF_EVERY_N == 0
            ):
                log.info(f"Triggering ZK proof at {len(self.signal_history)} signals")
                await self.submit_zk_proof()

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

        entry = {
            "signalId": sig.signal_id,
            "asset": sig.asset,
            "direction": sig.direction,
            "salt": sig.salt,
            "outcome": 1 if outcome else 0,
            "returnBps": 5000 + return_bps,  # offset encoding for ZK circuit
        }
        self.signal_history.append(entry)
        # Crash-safe persistence: append a JSON line per reveal. The prover
        # consumes this file. Without it, an agent restart between reveal and
        # save_signal_history() would lose proof-input forever.
        history_path = os.environ.get("SIGNAL_HISTORY_PATH", "signal_history.jsonl")
        try:
            import json as _json
            with open(history_path, "a") as f:
                f.write(_json.dumps(entry) + "\n")
        except Exception as e:
            log.warning(f"Failed to persist signal history to {history_path}: {e}")

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

    async def submit_zk_proof(self):
        """
        Generates a Groth16 proof of track record and submits it on-chain.
        Requires at least 1 revealed signal and the circuit build artifacts.
        Called automatically after every 10 reveals (or on demand).
        """
        import json
        import subprocess
        import tempfile
        import os as _os

        if len(self.signal_history) < 1:
            log.info("Not enough signals for ZK proof yet")
            return

        # Write current signal history to a temp file
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(self.signal_history, f)
            signals_path = f.name

        proof_path = signals_path.replace(".json", "_proof.json")

        try:
            circuits_dir = _os.path.join(
                _os.path.dirname(__file__), "..", "..", "circuits"
            )
            result = subprocess.run(
                ["node", "scripts/prove.js", "--signals", signals_path, "--out", proof_path],
                cwd=circuits_dir,
                capture_output=True,
                text=True,
                timeout=300,
            )
            if result.returncode != 0:
                log.error(f"Proof generation failed: {result.stderr}")
                return

            log.info(f"Proof generated:\n{result.stdout}")

            with open(proof_path) as f:
                proof_data = json.load(f)

            # snarkjs proof values are decimal strings (not hex)
            proof = proof_data["proof"]
            pub = proof_data["publicSignals"]

            pA = [int(proof["pi_a"][0]), int(proof["pi_a"][1])]
            pB = [
                [int(proof["pi_b"][0][1]), int(proof["pi_b"][0][0])],
                [int(proof["pi_b"][1][1]), int(proof["pi_b"][1][0])],
            ]
            pC = [int(proof["pi_c"][0]), int(proof["pi_c"][1])]
            pub_signals = [int(x) for x in pub]

            # Build signal IDs and hashes for on-chain batch verification
            from web3 import Web3
            on_chain_signal_ids = proof_data["onChainSignalIds"]
            on_chain_hashes = proof_data["onChainHashes"]

            signal_id_bytes = [
                bytes.fromhex(s.lstrip("0x").zfill(64)) for s in on_chain_signal_ids
            ]
            hash_bytes = [
                bytes.fromhex(h.lstrip("0x").zfill(64)) for h in on_chain_hashes
            ]

            tx = self.signal_market.submit_stats_proof(
                self.account, pA, pB, pC, pub_signals, signal_id_bytes, hash_bytes
            )
            log.info(f"ZK proof submitted on-chain: tx={tx[:10]}")

        except Exception as e:
            log.error(f"ZK proof submission failed: {e}")
        finally:
            for p in [signals_path, proof_path]:
                try:
                    _os.unlink(p)
                except FileNotFoundError:
                    pass


async def main():
    agent = ProviderAgent()
    await agent.run()


if __name__ == "__main__":
    asyncio.run(main())
