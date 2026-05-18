"""
Circle Programmable Wallets integration.
Used by buyer agent to execute trades and manage USDC float.
Providers can park idle revenue in USYC via Circle.
"""

import os
import httpx
import uuid
from typing import Optional

CIRCLE_API_BASE = "https://api.circle.com/v1/w3s"
CIRCLE_API_KEY = os.environ.get("CIRCLE_API_KEY", "")
CIRCLE_ENTITY_SECRET = os.environ.get("CIRCLE_ENTITY_SECRET", "")


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


async def transfer_usdc(
    wallet_id: str,
    destination_address: str,
    amount_usdc: float,
    idempotency_key: Optional[str] = None,
) -> dict:
    """Transfers USDC from a Circle wallet to an address."""
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
                "tokenId": _usdc_token_id(),
                "fee": {"type": "level", "config": {"feeLevel": "MEDIUM"}},
            },
        )
        resp.raise_for_status()
        return resp.json()["data"]["id"]


async def get_transaction_status(tx_id: str) -> str:
    """Returns transaction state: INITIATED | PENDING | COMPLETE | FAILED."""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{CIRCLE_API_BASE}/transactions/{tx_id}",
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()["data"]["state"]


async def stake_in_usyc(wallet_id: str, amount_usdc: float) -> dict:
    """
    Parks idle USDC in USYC (Circle's tokenized money market fund).
    Provider revenue accrues yield between signal payouts.
    """
    # USYC integration: swap USDC → USYC via Circle's yield product API
    # Full integration requires Circle's USYC endpoint (coming to Circle Wallets)
    # For MVP: placeholder that logs the intent
    return {
        "status": "queued",
        "amount_usdc": amount_usdc,
        "wallet_id": wallet_id,
        "note": "USYC staking — full integration requires Circle USYC API access",
    }


def _usdc_token_id() -> str:
    # Circle's USDC token ID on Arc testnet — replace with production ID
    return os.environ.get("CIRCLE_USDC_TOKEN_ID", "5797fbd6-3795-519d-84ca-ec4c5f80c3b1")
