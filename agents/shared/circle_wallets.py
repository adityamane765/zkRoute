"""
Circle Programmable Wallets integration.
Used by buyer agent to execute trades and manage USDC float.
Providers can park idle revenue in USYC via Circle.
"""

import os
import httpx
import uuid
import logging
from typing import Optional

log = logging.getLogger(__name__)

CIRCLE_API_BASE = "https://api.circle.com/v1/w3s"
CIRCLE_API_KEY = os.environ.get("CIRCLE_API_KEY", "")
CIRCLE_ENTITY_SECRET = os.environ.get("CIRCLE_ENTITY_SECRET", "")

# Arc testnet token IDs — override via env if Circle publishes updated IDs
CIRCLE_USDC_TOKEN_ID = os.environ.get("CIRCLE_USDC_TOKEN_ID", "")
CIRCLE_USYC_TOKEN_ID = os.environ.get("CIRCLE_USYC_TOKEN_ID", "")


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {CIRCLE_API_KEY}",
        "Content-Type": "application/json",
    }


async def create_wallet(user_id: str, blockchain: str = "ARC") -> dict:
    """Creates a Circle Programmable Wallet for a buyer's agent."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{CIRCLE_API_BASE}/wallets",
            headers=_headers(),
            json={
                "idempotencyKey": str(uuid.uuid4()),
                "entitySecretCiphertext": CIRCLE_ENTITY_SECRET,
                "blockchains": [blockchain],
                "userId": user_id,
            },
        )
        resp.raise_for_status()
        return resp.json()["data"]["wallets"][0]


async def get_wallet_balance(wallet_id: str) -> list[dict]:
    """Returns token balances for a wallet."""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{CIRCLE_API_BASE}/wallets/{wallet_id}/balances",
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()["data"]["tokenBalances"]


async def get_usdc_balance(wallet_id: str) -> float:
    """Returns USDC balance for a wallet as a float."""
    balances = await get_wallet_balance(wallet_id)
    for b in balances:
        if b.get("token", {}).get("symbol") == "USDC":
            return float(b.get("amount", "0"))
    return 0.0


async def transfer_usdc(
    wallet_id: str,
    destination_address: str,
    amount_usdc: float,
    idempotency_key: Optional[str] = None,
) -> str:
    """Transfers USDC from a Circle wallet to an address. Returns transaction ID."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{CIRCLE_API_BASE}/transactions/transfer",
            headers=_headers(),
            json={
                "idempotencyKey": idempotency_key or str(uuid.uuid4()),
                "entitySecretCiphertext": CIRCLE_ENTITY_SECRET,
                "walletId": wallet_id,
                "destinationAddress": destination_address,
                "amounts": [str(amount_usdc)],
                "tokenId": CIRCLE_USDC_TOKEN_ID,
                "fee": {"type": "level", "config": {"feeLevel": "MEDIUM"}},
            },
        )
        resp.raise_for_status()
        data = resp.json()["data"]
        # Circle returns the transaction under different keys depending on state
        return data.get("id") or data.get("transactionId") or data.get("transaction", {}).get("id", "")


async def get_transaction_status(tx_id: str) -> str:
    """Returns transaction state: INITIATED | PENDING | COMPLETE | FAILED."""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{CIRCLE_API_BASE}/transactions/{tx_id}",
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()["data"]["state"]


async def wait_for_transaction(tx_id: str, timeout_seconds: int = 60) -> str:
    """Polls until transaction reaches a terminal state. Returns final state."""
    import asyncio
    for _ in range(timeout_seconds // 3):
        state = await get_transaction_status(tx_id)
        if state in ("COMPLETE", "FAILED", "CANCELLED"):
            return state
        await asyncio.sleep(3)
    return "TIMEOUT"


async def stake_in_usyc(wallet_id: str, amount_usdc: float) -> dict:
    """
    Parks idle USDC into USYC (Circle's tokenized T-bill fund) via a
    Circle Wallets transfer to the USYC contract address on Arc.
    USYC_CONTRACT_ADDRESS must be set in env once Circle publishes it.
    """
    usyc_address = os.environ.get("USYC_CONTRACT_ADDRESS", "")
    if not usyc_address:
        log.warning("USYC_CONTRACT_ADDRESS not set — skipping USYC stake")
        return {"status": "skipped", "reason": "USYC_CONTRACT_ADDRESS not configured"}

    if not CIRCLE_USYC_TOKEN_ID:
        # Fall back to transferring USDC directly to the USYC mint address
        tx_id = await transfer_usdc(
            wallet_id,
            usyc_address,
            amount_usdc,
            idempotency_key=f"usyc_stake_{wallet_id}_{int(amount_usdc * 1e6)}",
        )
        log.info(f"USYC stake submitted via USDC transfer: tx={tx_id}")
        return {"status": "submitted", "tx_id": tx_id, "amount_usdc": amount_usdc}

    # If Circle publishes a direct USYC token swap endpoint, use it here
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{CIRCLE_API_BASE}/transactions/transfer",
            headers=_headers(),
            json={
                "idempotencyKey": f"usyc_{wallet_id}_{str(uuid.uuid4())}",
                "entitySecretCiphertext": CIRCLE_ENTITY_SECRET,
                "walletId": wallet_id,
                "destinationAddress": usyc_address,
                "amounts": [str(amount_usdc)],
                "tokenId": CIRCLE_USDC_TOKEN_ID,
                "fee": {"type": "level", "config": {"feeLevel": "MEDIUM"}},
            },
        )
        resp.raise_for_status()
        tx_id = resp.json()["data"].get("id", "")
        log.info(f"USYC stake submitted: tx={tx_id} amount={amount_usdc} USDC")
        return {"status": "submitted", "tx_id": tx_id, "amount_usdc": amount_usdc}
