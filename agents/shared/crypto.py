"""
Signal encryption using NaCl asymmetric box.
Provider encrypts signals to buyer agent's public key.
Only buyer agent (holding private key) can decrypt.
"""

import secrets
import hashlib
import json
from typing import Any

import nacl.public
import nacl.encoding


def generate_keypair() -> tuple[bytes, bytes]:
    """Returns (private_key_hex, public_key_hex)."""
    sk = nacl.public.PrivateKey.generate()
    return (
        bytes(sk).hex(),
        bytes(sk.public_key).hex(),
    )


def encrypt_signal(
    signal_data: dict[str, Any],
    buyer_agent_pubkey_hex: str,
    provider_privkey_hex: str,
) -> str:
    """
    Encrypt signal_data (dict) to buyer agent's pubkey.
    Returns hex-encoded encrypted payload.
    """
    buyer_pk = nacl.public.PublicKey(bytes.fromhex(buyer_agent_pubkey_hex))
    provider_sk = nacl.public.PrivateKey(bytes.fromhex(provider_privkey_hex))
    box = nacl.public.Box(provider_sk, buyer_pk)
    plaintext = json.dumps(signal_data).encode()
    encrypted = box.encrypt(plaintext, encoder=nacl.encoding.HexEncoder)
    return encrypted.decode()


def decrypt_signal(
    encrypted_hex: str,
    provider_pubkey_hex: str,
    buyer_agent_privkey_hex: str,
) -> dict[str, Any]:
    """
    Decrypt an encrypted signal payload.
    Returns the original signal_data dict.
    """
    provider_pk = nacl.public.PublicKey(bytes.fromhex(provider_pubkey_hex))
    buyer_sk = nacl.public.PrivateKey(bytes.fromhex(buyer_agent_privkey_hex))
    box = nacl.public.Box(buyer_sk, provider_pk)
    plaintext = box.decrypt(encrypted_hex.encode(), encoder=nacl.encoding.HexEncoder)
    return json.loads(plaintext)


def compute_commitment_hash(
    signal_id: str,
    direction: int,   # 1=long, 0=short
    asset_id: str,    # e.g. "ETH"
    salt: str,        # hex string
) -> bytes:
    """
    keccak256(abi.encodePacked(signalId, direction, assetId, salt))
    Matches CommitReveal.sol's reveal() verification.
    """
    from web3 import Web3
    signal_id_bytes = bytes.fromhex(signal_id.lstrip("0x").zfill(64))
    asset_id_bytes = Web3.keccak(text=asset_id)
    salt_bytes = bytes.fromhex(salt.lstrip("0x").zfill(64))
    packed = (
        signal_id_bytes
        + direction.to_bytes(1, "big")
        + asset_id_bytes
        + salt_bytes
    )
    return Web3.keccak(packed)


def generate_signal_id() -> str:
    """Random 32-byte signal ID as hex."""
    return "0x" + secrets.token_hex(32)


def generate_salt() -> str:
    """Random 32-byte salt as hex."""
    return "0x" + secrets.token_hex(32)
