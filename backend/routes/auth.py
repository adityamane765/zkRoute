"""Minimal wallet-signature auth for provider/buyer identity verification."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from eth_account import Account
from eth_account.messages import encode_defunct

from ..auth_dep import issue_nonce, NONCE_MESSAGE as RELAY_NONCE_MESSAGE

router = APIRouter()
NONCE_MESSAGE = "zkRoute authentication nonce: {nonce}"


class VerifyRequest(BaseModel):
    address: str
    nonce: str
    signature: str


@router.post("/verify")
def verify_signature(req: VerifyRequest):
    """Verify an EIP-191 personal_sign signature to authenticate wallet ownership."""
    message = NONCE_MESSAGE.format(nonce=req.nonce)
    signable = encode_defunct(text=message)
    recovered = Account.recover_message(signable, signature=req.signature)
    if recovered.lower() != req.address.lower():
        raise HTTPException(401, "Signature verification failed")
    return {"authenticated": True, "address": recovered}


@router.post("/nonce")
def get_relay_nonce():
    """Mint a short-lived nonce for relay/positions/rejections writes.

    Caller signs `zkRoute relay nonce: <nonce>` with their wallet and posts
    the signature as `Authorization: Bearer <sig>` with the nonce in the
    `X-Zkroute-Nonce` header. See backend/auth_dep.py for details.
    """
    return {"nonce": issue_nonce(), "message_template": RELAY_NONCE_MESSAGE}
