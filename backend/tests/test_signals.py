PROVIDER = "0x" + "11" * 20
BUYER = "0x" + "22" * 20
PROV_PUBKEY = "44" * 32
BUYER_AGENT_PUBKEY = "33" * 32


def _subscribe(client):
    client.post("/providers/register", json={
        "address": PROVIDER, "name": "Alpha", "description": "desc",
        "frequency": "Swing", "agent_public_key": "aa" * 32,
    })
    client.post("/buyer/subscribe", json={
        "provider_address": PROVIDER, "buyer_address": BUYER,
        "buyer_agent_pubkey": BUYER_AGENT_PUBKEY,
    })


def test_relay_then_pending_then_delivered(client):
    _subscribe(client)
    r = client.post("/signals/relay", json={
        "provider": PROVIDER, "buyer": BUYER,
        "provider_pubkey": PROV_PUBKEY, "signal_id": "sig1",
        "encrypted_signal": "deadbeef" * 16,
    })
    assert r.status_code == 200, r.text

    pending = client.get(f"/signals/pending/{BUYER}").json()
    assert len(pending) == 1
    assert pending[0]["signal_id"] == "sig1"

    # second poll: already delivered
    pending2 = client.get(f"/signals/pending/{BUYER}").json()
    assert pending2 == []


def test_relay_requires_subscription(client):
    r = client.post("/signals/relay", json={
        "provider": PROVIDER, "buyer": BUYER,
        "provider_pubkey": PROV_PUBKEY, "signal_id": "x",
        "encrypted_signal": "abcd" * 16,
    })
    assert r.status_code == 403


def test_relay_dedupes(client):
    _subscribe(client)
    body = {
        "provider": PROVIDER, "buyer": BUYER,
        "provider_pubkey": PROV_PUBKEY, "signal_id": "sig-dup",
        "encrypted_signal": "abcd" * 16,
    }
    r1 = client.post("/signals/relay", json=body)
    assert r1.status_code == 200
    r2 = client.post("/signals/relay", json=body)
    assert r2.status_code == 409


def test_relay_rejects_non_hex_encrypted_payload(client):
    _subscribe(client)
    r = client.post("/signals/relay", json={
        "provider": PROVIDER, "buyer": BUYER,
        "provider_pubkey": PROV_PUBKEY, "signal_id": "sig2",
        "encrypted_signal": "ZZZZ not hex",
    })
    assert r.status_code == 400


def test_outcome_recorded_once(client):
    _subscribe(client)
    body = {"signal_id": "s1", "provider": PROVIDER, "outcome": True, "return_bps": 300, "exit_price": 3100.0}
    r1 = client.post("/signals/outcome", json=body)
    assert r1.status_code == 200
    r2 = client.post("/signals/outcome", json=body)
    assert r2.status_code == 400
