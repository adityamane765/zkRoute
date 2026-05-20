"""
RPC proxy — forwards JSON-RPC calls from the frontend to the Canteen-issued
Arc RPC, injecting the bearer-token-bearing URL server-side. Prevents the
swrm_… token from being baked into the public JS bundle (BLOCKERS.md #8).

Method whitelist: only read methods + the standard tx broadcast path are
forwarded. Methods that would require server-side secret handling (e.g.
eth_sign, eth_sendTransaction) are rejected at this layer.
"""

from __future__ import annotations

import os
import httpx
from fastapi import APIRouter, HTTPException, Request

router = APIRouter()

# The full Canteen RPC URL with the user's swrm_… token. Loaded server-side
# only — never exposed to the frontend.
ARC_RPC_URL = os.environ.get("ARC_RPC_URL", "")

# Methods the frontend is allowed to invoke through the proxy.
ALLOWED_METHODS = {
    # Chain reads
    "eth_chainId",
    "eth_blockNumber",
    "eth_getBlockByNumber",
    "eth_getBlockByHash",
    "eth_getBalance",
    "eth_getCode",
    "eth_getStorageAt",
    "eth_getTransactionCount",
    "eth_call",
    "eth_estimateGas",
    "eth_gasPrice",
    "eth_maxPriorityFeePerGas",
    "eth_feeHistory",
    "eth_getLogs",
    # Transaction lifecycle (frontend signs locally with a wallet; we only
    # forward the *raw* signed transaction. We do NOT allow eth_sign or
    # eth_sendTransaction, which would require server-side keys.)
    "eth_sendRawTransaction",
    "eth_getTransactionByHash",
    "eth_getTransactionReceipt",
    # Net / web3 introspection
    "net_version",
    "web3_clientVersion",
}

# Single timeout; per-method limits can be added if any prove pathological.
_TIMEOUT = 15.0


@router.post("/rpc")
async def rpc_proxy(request: Request):
    if not ARC_RPC_URL:
        raise HTTPException(500, "ARC_RPC_URL not configured on the backend")
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(400, "body must be JSON")

    # Accept either a single JSON-RPC object or a batch array.
    items = body if isinstance(body, list) else [body]
    for item in items:
        if not isinstance(item, dict) or "method" not in item:
            raise HTTPException(400, "invalid JSON-RPC request")
        m = item["method"]
        if m not in ALLOWED_METHODS:
            raise HTTPException(403, f"method '{m}' is not allowed via the proxy")

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        try:
            resp = await client.post(ARC_RPC_URL, json=body)
        except httpx.HTTPError as e:
            raise HTTPException(502, f"upstream RPC error: {e}")

    # Pass through status + body. Don't leak upstream headers.
    return resp.json()
