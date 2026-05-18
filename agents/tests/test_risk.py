from agents.shared.risk import RiskBounds, RiskState, evaluate_signal, cap_size


BOUNDS = RiskBounds(
    max_position_pct=5.0,
    max_leverage=1.0,
    allowed_assets=frozenset({"ETH", "BTC"}),
    daily_var_pct=3.0,
)


def test_accepts_within_bounds():
    state = RiskState(day_start=1_000_000.0)
    assert evaluate_signal(BOUNDS, state, 1_000_010.0, "ETH", 3.0) is None


def test_rejects_disallowed_asset():
    state = RiskState(day_start=1_000_000.0)
    assert evaluate_signal(BOUNDS, state, 1_000_010.0, "DOGE", 3.0) == "asset_not_allowed:DOGE"


def test_case_insensitive_asset_match():
    state = RiskState(day_start=1_000_000.0)
    assert evaluate_signal(BOUNDS, state, 1_000_010.0, "eth", 3.0) is None


def test_rejects_zero_or_negative_size():
    state = RiskState(day_start=1_000_000.0)
    assert evaluate_signal(BOUNDS, state, 1_000_010.0, "ETH", 0.0) == "invalid_size"
    assert evaluate_signal(BOUNDS, state, 1_000_010.0, "ETH", -1.0) == "invalid_size"


def test_kill_switch_rejects_all():
    bounds = RiskBounds(
        max_position_pct=5.0,
        max_leverage=1.0,
        allowed_assets=frozenset({"ETH"}),
        daily_var_pct=3.0,
        kill_switch=True,
    )
    state = RiskState(day_start=1_000_000.0)
    assert evaluate_signal(bounds, state, 1_000_010.0, "ETH", 3.0) == "kill_switch"


def test_daily_var_exhausted_blocks_signal():
    state = RiskState(day_start=1_000_000.0, daily_var_used=3.0)
    assert evaluate_signal(BOUNDS, state, 1_000_500.0, "ETH", 3.0) == "daily_var_limit_reached"


def test_daily_var_resets_after_24h():
    state = RiskState(day_start=1_000_000.0, daily_var_used=3.0)
    # Advance > 86400s. The function should reset the budget and accept.
    assert evaluate_signal(BOUNDS, state, 1_000_000.0 + 86400.0 + 1, "ETH", 3.0) is None
    assert state.daily_var_used == 0.0


def test_cap_size_clamps_to_max_position():
    assert cap_size(BOUNDS, 10.0) == 5.0
    assert cap_size(BOUNDS, 2.0) == 2.0
    assert cap_size(BOUNDS, -1.0) == 0.0
