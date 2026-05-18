PROVIDER = "0x" + "11" * 20
BUYER = "0x" + "22" * 20
AGENT_PUBKEY = "33" * 32


def _register(client):
    client.post("/providers/register", json={
        "address": PROVIDER,
        "name": "Alpha",
        "description": "desc",
        "frequency": "Swing",
        "agent_public_key": "aa" * 32,
    })


def test_subscribe_happy_path(client):
    _register(client)
    r = client.post("/buyer/subscribe", json={
        "provider_address": PROVIDER,
        "buyer_address": BUYER,
        "buyer_agent_pubkey": AGENT_PUBKEY,
    })
    assert r.status_code == 200, r.text


def test_subscribe_rejects_unknown_provider(client):
    r = client.post("/buyer/subscribe", json={
        "provider_address": PROVIDER,
        "buyer_address": BUYER,
        "buyer_agent_pubkey": AGENT_PUBKEY,
    })
    assert r.status_code == 404


def test_subscribe_rejects_invalid_bounds(client):
    _register(client)
    r = client.post("/buyer/subscribe", json={
        "provider_address": PROVIDER,
        "buyer_address": BUYER,
        "buyer_agent_pubkey": AGENT_PUBKEY,
        "max_position_bps": 6000,  # > 5000
    })
    assert r.status_code == 422


def test_position_requires_subscription(client):
    r = client.post("/buyer/positions", json={
        "buyer": BUYER, "signal_id": "sig1", "provider": PROVIDER,
        "asset": "ETH", "direction": 1, "size_pct": 3, "entry_price": 3000,
        "open_time": 1715000000,
    })
    assert r.status_code == 403


def test_position_duplicate_signal_rejected(client):
    _register(client)
    client.post("/buyer/subscribe", json={
        "provider_address": PROVIDER, "buyer_address": BUYER, "buyer_agent_pubkey": AGENT_PUBKEY,
    })
    body = {
        "buyer": BUYER, "signal_id": "sig-dup", "provider": PROVIDER,
        "asset": "ETH", "direction": 1, "size_pct": 3, "entry_price": 3000,
        "open_time": 1715000000,
    }
    r1 = client.post("/buyer/positions", json=body)
    assert r1.status_code == 200
    r2 = client.post("/buyer/positions", json=body)
    assert r2.status_code == 400


def test_dashboard_aggregates_pnl(client):
    _register(client)
    client.post("/buyer/subscribe", json={
        "provider_address": PROVIDER, "buyer_address": BUYER, "buyer_agent_pubkey": AGENT_PUBKEY,
    })
    for i in range(3):
        client.post("/buyer/positions", json={
            "buyer": BUYER, "signal_id": f"sig{i}", "provider": PROVIDER,
            "asset": "ETH", "direction": 1, "size_pct": 3, "entry_price": 3000,
            "open_time": 1715000000 + i,
        })
        client.patch(f"/buyer/positions/sig{i}", json={"current_price": 3060, "pnl_bps": 200})

    d = client.get(f"/buyer/dashboard/{BUYER}").json()
    assert d["total_positions"] == 3
    assert d["total_pnl_bps"] == 600
