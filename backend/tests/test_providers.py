from eth_account import Account
from eth_account.messages import encode_defunct


PUBKEY_HEX = "11" * 32
PROVIDER_PK = "0x" + "01" * 32
PROVIDER_ADDR = Account.from_key(PROVIDER_PK).address


def _register_payload(address=PROVIDER_ADDR):
    return {
        "address": address,
        "name": "Alpha",
        "description": "swing strategy",
        "frequency": "Swing",
        "agent_public_key": PUBKEY_HEX,
    }


def test_register_provider_happy_path(client):
    r = client.post("/providers/register", json=_register_payload())
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "registered"

    listing = client.get("/providers/").json()
    assert len(listing) == 1
    assert listing[0]["address"].lower() == PROVIDER_ADDR.lower()


def test_register_rejects_invalid_address(client):
    payload = _register_payload(address="not-an-address")
    r = client.post("/providers/register", json=payload)
    assert r.status_code == 400


def test_register_rejects_bad_frequency(client):
    payload = _register_payload()
    payload["frequency"] = "Sometimes"
    r = client.post("/providers/register", json=payload)
    assert r.status_code == 400


def test_register_rejects_bad_pubkey(client):
    payload = _register_payload()
    payload["agent_public_key"] = "abcd"
    r = client.post("/providers/register", json=payload)
    assert r.status_code == 400


def test_register_then_duplicate_fails(client):
    client.post("/providers/register", json=_register_payload())
    r = client.post("/providers/register", json=_register_payload())
    assert r.status_code == 400


def test_stats_update_requires_valid_signature(client):
    client.post("/providers/register", json=_register_payload())

    stats = {"win_rate_bps": 6800, "total_return_bps": 2340, "total_signals": 47, "last_proof_block": 100}
    message = f"zkRoute stats: {stats['win_rate_bps']}|{stats['total_return_bps']}|{stats['total_signals']}|{stats['last_proof_block']}"
    sig = Account.sign_message(encode_defunct(text=message), private_key=PROVIDER_PK).signature.hex()
    payload = {**stats, "signature": "0x" + sig}

    r = client.patch(f"/providers/{PROVIDER_ADDR}/stats", json=payload)
    assert r.status_code == 200, r.text

    p = client.get(f"/providers/{PROVIDER_ADDR}").json()
    assert p["win_rate_bps"] == 6800


def test_stats_update_rejects_unsigned(client):
    client.post("/providers/register", json=_register_payload())
    r = client.patch(f"/providers/{PROVIDER_ADDR}/stats", json={
        "win_rate_bps": 6800, "total_return_bps": 100, "total_signals": 1,
        "last_proof_block": 1, "signature": "0x" + "00" * 65,
    })
    assert r.status_code == 401


def test_stats_update_rejects_other_signer(client):
    client.post("/providers/register", json=_register_payload())
    other_pk = "0x" + "02" * 32
    stats = {"win_rate_bps": 6800, "total_return_bps": 2340, "total_signals": 47, "last_proof_block": 100}
    message = f"zkRoute stats: {stats['win_rate_bps']}|{stats['total_return_bps']}|{stats['total_signals']}|{stats['last_proof_block']}"
    sig = Account.sign_message(encode_defunct(text=message), private_key=other_pk).signature.hex()
    payload = {**stats, "signature": "0x" + sig}
    r = client.patch(f"/providers/{PROVIDER_ADDR}/stats", json=payload)
    assert r.status_code == 401


def test_stats_rejects_stale_block(client):
    client.post("/providers/register", json=_register_payload())

    def sign(stats):
        message = f"zkRoute stats: {stats['win_rate_bps']}|{stats['total_return_bps']}|{stats['total_signals']}|{stats['last_proof_block']}"
        sig = Account.sign_message(encode_defunct(text=message), private_key=PROVIDER_PK).signature.hex()
        return {**stats, "signature": "0x" + sig}

    fresh = {"win_rate_bps": 6800, "total_return_bps": 2340, "total_signals": 47, "last_proof_block": 200}
    client.patch(f"/providers/{PROVIDER_ADDR}/stats", json=sign(fresh))
    stale = {"win_rate_bps": 5000, "total_return_bps": 0, "total_signals": 1, "last_proof_block": 100}
    r = client.patch(f"/providers/{PROVIDER_ADDR}/stats", json=sign(stale))
    assert r.status_code == 400
