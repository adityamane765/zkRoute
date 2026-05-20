"""
Trade execution dispatcher (BLOCKERS.md #10).

Three modes, selected by TRADE_EXECUTION_MODE in .env:
  - "transfer"      — DEMO ONLY. USDC transfer to the asset's token address.
                      Logs a loud warning that no real position is being opened.
                      This is what zkRoute ships with today.
  - "swap_circle"   — Calls Circle's swap endpoint. NotImplementedError until
                      Circle exposes a swap surface for Arc.
  - "swap_dex"      — Calls a Uniswap-style router on Arc directly via the
                      buyer's Circle Programmable Wallet. Requires
                      ARC_DEX_ROUTER address + token approvals; not implemented
                      in this commit.

Defaults to "transfer" so existing demos keep working. Producers should set
TRADE_EXECUTION_MODE=swap_circle (or swap_dex) when wiring a real environment.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass

log = logging.getLogger(__name__)

EXECUTION_MODE = os.environ.get("TRADE_EXECUTION_MODE", "transfer").lower()


@dataclass
class TradeRequest:
    asset: str
    direction: int          # 1 = long, 0 = short
    size_usdc: float        # absolute USDC amount the buyer wants exposed
    signal_id: str
    token_address: str      # destination token (for transfer mode) or quote/base for swap
    wallet_id: str          # Circle wallet id
    idempotency_key: str


async def execute_trade(req: TradeRequest) -> str:
    """Returns the resulting tx id, or "" on failure / unsupported mode."""
    if EXECUTION_MODE == "transfer":
        return await _transfer_stand_in(req)
    if EXECUTION_MODE == "swap_circle":
        return await _swap_via_circle(req)
    if EXECUTION_MODE == "swap_dex":
        return await _swap_via_dex(req)
    log.error(f"Unknown TRADE_EXECUTION_MODE={EXECUTION_MODE!r}; refusing to trade")
    return ""


# ───────────────────────────────────────────────────────────────────────────


async def _transfer_stand_in(req: TradeRequest) -> str:
    """Demo-mode: USDC transfer to the asset's token address. NOT a real swap.

    Loud warning so it's impossible to forget this isn't production behavior.
    """
    from . import circle_wallets   # local import: avoids circular at module load
    log.warning(
        "TRADE_EXECUTION_MODE=transfer — NOT A REAL SWAP. "
        f"Forwarding ${req.size_usdc:.2f} USDC from wallet {req.wallet_id} to "
        f"{req.token_address} as a demo stand-in. Set TRADE_EXECUTION_MODE to "
        "swap_circle (or swap_dex once it lands) for production."
    )
    tx_id = await circle_wallets.transfer_usdc(
        req.wallet_id,
        req.token_address,
        req.size_usdc,
        idempotency_key=req.idempotency_key,
    )
    state = await circle_wallets.wait_for_transaction(tx_id, timeout_seconds=60)
    if state != "COMPLETE":
        log.error(f"Circle transfer did not complete: {state} | tx={tx_id}")
        return ""
    return tx_id


async def _swap_via_circle(req: TradeRequest) -> str:
    """Real swap via Circle's wallet-side swap endpoint. Not yet available for
    Arc — calling code should keep TRADE_EXECUTION_MODE=transfer until Circle
    ships this surface.
    """
    raise NotImplementedError(
        "Circle swap endpoint is not yet integrated for Arc. "
        "Track Circle Programmable Wallets release notes or fall back to "
        "TRADE_EXECUTION_MODE=swap_dex once an Arc-side router is configured."
    )


async def _swap_via_dex(req: TradeRequest) -> str:
    """Direct Uniswap-style router call on Arc via the buyer's Circle wallet.

    Requires:
      - ARC_DEX_ROUTER set to the on-chain router address.
      - USDC pre-approved on the router for the buyer's wallet.
      - A working path (e.g. USDC → WETH for ETH long).

    Implementation deferred until an Arc-side router is published.
    """
    raise NotImplementedError(
        "DEX router integration is not implemented yet. See "
        "docs (future) for the on-chain swap flow."
    )
