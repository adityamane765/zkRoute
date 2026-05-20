"""
EIP-191 signature auth for relay writes.

The buyer/provider posts a short-lived nonce (issued by /auth/nonce), signs
`zkRoute relay nonce: {nonce}` with their wallet, and includes the result as
an `Authorization: Bearer <signature>` header. The endpoint that consumed
the nonce gets to declare which address is expected (e.g. for /signals/relay
the signer must equal request.provider).

Usage in routes:

    from ..auth_dep import require_signer

    @router.post("/relay")
    def relay_signal(
        req: RelayRequest,
        signer: str = Depends(require_signer(nonce_provider=lambda r: r.provider)),
        session: Session = Depends(get_session),
    ):
        if signer != req.provider.lower():
            raise HTTPException(403, "signer must equal request.provider")
        ...

Auth is fail-OPEN if `ZKROUTE_REQUIRE_AUTH` is unset (default for dev), and
fail-CLOSED when set to "true" (production). This keeps the existing demo
flow working until you flip the env var.
"""

from __future__ import annotations

import os
import secrets
import time
from typing import Optional

from fastapi import Header, HTTPException, Request
from eth_account import Account
from eth_account.messages import encode_defunct

NONCE_TTL_SECONDS = int(os.environ.get("ZKROUTE_NONCE_TTL", "300"))   # 5 min
NONCE_MESSAGE = "zkRoute relay nonce: {nonce}"
REQUIRE_AUTH = os.environ.get("ZKROUTE_REQUIRE_AUTH", "false").lower() == "true"

# In-memory nonce store: nonce -> issued_at_unix.
# Single-process only — for production move to Redis. Acceptable for the
# current single-instance backend.
_nonces: dict[str, float] = {}


def issue_nonce() -> str:
    """Mint a fresh nonce and return it. Caller signs the encoded message."""
    nonce = secrets.token_hex(16)
    _nonces[nonce] = time.time()
    _prune_expired()
    return nonce


def _prune_expired() -> None:
    cutoff = time.time() - NONCE_TTL_SECONDS
    expired = [n for n, t in _nonces.items() if t < cutoff]
    for n in expired:
        _nonces.pop(n, None)


def _consume(nonce: str) -> bool:
    """Returns True iff nonce was valid and unused. Always pops the nonce."""
    issued = _nonces.pop(nonce, None)
    if issued is None:
        return False
    return (time.time() - issued) <= NONCE_TTL_SECONDS


def verify_signed_nonce(nonce: str, signature: str) -> str:
    """Recover the signer address from an EIP-191 signed nonce. Raises 401 on
    bad/expired/replayed nonce or invalid signature."""
    if not _consume(nonce):
        raise HTTPException(401, "nonce invalid, expired, or already used")
    msg = NONCE_MESSAGE.format(nonce=nonce)
    try:
        signer = Account.recover_message(encode_defunct(text=msg), signature=signature)
    except Exception:
        raise HTTPException(401, "invalid signature")
    return signer.lower()


def require_signer():
    """FastAPI dependency that returns the recovered signer address or None
    if auth is disabled (dev mode). Endpoints check the returned address
    against their own expected-signer rule."""

    def _dep(
        x_zkroute_nonce: Optional[str] = Header(default=None, alias="X-Zkroute-Nonce"),
        authorization: Optional[str] = Header(default=None),
    ) -> Optional[str]:
        if not REQUIRE_AUTH:
            return None  # fail-open in dev
        if not x_zkroute_nonce or not authorization:
            raise HTTPException(401, "missing X-Zkroute-Nonce or Authorization")
        if not authorization.lower().startswith("bearer "):
            raise HTTPException(401, "Authorization must be 'Bearer <signature>'")
        signature = authorization.split(" ", 1)[1].strip()
        return verify_signed_nonce(x_zkroute_nonce, signature)

    return _dep
