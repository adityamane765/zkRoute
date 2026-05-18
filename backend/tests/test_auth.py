import secrets
from eth_account import Account
from eth_account.messages import encode_defunct


def test_verify_round_trip(client):
    pk = "0x" + secrets.token_hex(32)
    acct = Account.from_key(pk)
    nonce = "abc-123"
    message = f"zkRoute authentication nonce: {nonce}"
    sig = Account.sign_message(encode_defunct(text=message), private_key=pk).signature.hex()
    r = client.post("/auth/verify", json={"address": acct.address, "nonce": nonce, "signature": "0x" + sig})
    assert r.status_code == 200, r.text
    assert r.json()["address"].lower() == acct.address.lower()


def test_verify_rejects_other_signer(client):
    pk1 = "0x" + secrets.token_hex(32)
    pk2 = "0x" + secrets.token_hex(32)
    acct1 = Account.from_key(pk1)
    nonce = "abc-123"
    message = f"zkRoute authentication nonce: {nonce}"
    sig = Account.sign_message(encode_defunct(text=message), private_key=pk2).signature.hex()
    r = client.post("/auth/verify", json={"address": acct1.address, "nonce": nonce, "signature": "0x" + sig})
    assert r.status_code == 401
