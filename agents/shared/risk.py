"""
Pure functions for buyer-agent risk validation.
Extracted from BuyerAgent so they can be unit-tested without Web3 / Circle.

A signal is accepted if and only if `evaluate_signal` returns None.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class RiskBounds:
    max_position_pct: float
    max_leverage: float
    allowed_assets: frozenset[str]
    daily_var_pct: float
    kill_switch: bool = False


@dataclass
class RiskState:
    daily_var_used: float = 0.0
    day_start: float = 0.0


def evaluate_signal(
    bounds: RiskBounds,
    state: RiskState,
    now: float,
    asset: str,
    size_hint_pct: float,
) -> str | None:
    """Returns rejection reason, or None to accept the signal."""
    if bounds.kill_switch:
        return "kill_switch"
    if asset.upper() not in bounds.allowed_assets:
        return f"asset_not_allowed:{asset}"
    if size_hint_pct <= 0:
        return "invalid_size"
    # Reset daily VaR window if a full day has elapsed.
    if state.day_start == 0.0 or now - state.day_start >= 86400:
        state.daily_var_used = 0.0
        state.day_start = now
    if state.daily_var_used >= bounds.daily_var_pct:
        return "daily_var_limit_reached"
    return None


def cap_size(bounds: RiskBounds, size_hint_pct: float) -> float:
    """Clamp the requested size to the buyer's configured maximum position."""
    return max(0.0, min(size_hint_pct, bounds.max_position_pct))


def estimate_var_increment(actual_size_pct: float) -> float:
    """Rough VaR estimate used for daily budget accounting. Same heuristic as the agent."""
    return actual_size_pct * 0.3
