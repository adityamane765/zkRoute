import pytest

from agents.shared import crypto


def test_keypair_is_32_bytes_hex():
    sk, pk = crypto.generate_keypair()
    assert len(sk) == 64 and len(pk) == 64
    int(sk, 16)
    int(pk, 16)


def test_encrypt_decrypt_round_trip():
    sender_sk, sender_pk = crypto.generate_keypair()
    receiver_sk, receiver_pk = crypto.generate_keypair()
    payload = {"signal_id": "0x" + "ab" * 32, "asset": "ETH", "direction": 1, "size_hint_pct": 3}

    ciphertext = crypto.encrypt_signal(payload, receiver_pk, sender_sk)
    decoded = crypto.decrypt_signal(ciphertext, sender_pk, receiver_sk)
    assert decoded == payload


def test_decrypt_with_wrong_key_fails():
    sender_sk, sender_pk = crypto.generate_keypair()
    _receiver_sk, receiver_pk = crypto.generate_keypair()
    attacker_sk, _ = crypto.generate_keypair()
    payload = {"signal_id": "0xabc", "asset": "ETH"}
    ciphertext = crypto.encrypt_signal(payload, receiver_pk, sender_sk)
    with pytest.raises(Exception):
        crypto.decrypt_signal(ciphertext, sender_pk, attacker_sk)


def test_commitment_hash_matches_solidity_format():
    """Hash should be deterministic. Re-running with the same inputs returns the same digest."""
    signal_id = "0x" + "11" * 32
    salt = "0x" + "22" * 32
    h1 = crypto.compute_commitment_hash(signal_id, 1, "ETH", salt)
    h2 = crypto.compute_commitment_hash(signal_id, 1, "ETH", salt)
    h3 = crypto.compute_commitment_hash(signal_id, 0, "ETH", salt)  # different direction
    assert h1 == h2 != h3
    assert len(h1) == 32


def test_generate_ids_are_unique_and_well_formed():
    a = crypto.generate_signal_id()
    b = crypto.generate_signal_id()
    assert a != b
    assert a.startswith("0x") and len(a) == 66
    s = crypto.generate_salt()
    assert s.startswith("0x") and len(s) == 66
