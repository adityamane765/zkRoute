"""
Thin Web3 wrapper for Arc interactions.
Loads ABIs from the compiled contracts directory.
"""

import json
import os
from pathlib import Path
from web3 import Web3
from web3.middleware import ExtraDataToPOAMiddleware
from eth_account import Account

from .config import ARC_RPC_URL, ARC_CHAIN_ID

_ABI_DIR = Path(__file__).parent.parent.parent / "contracts" / "artifacts" / "contracts"


def _load_abi(contract_name: str) -> list:
    abi_path = _ABI_DIR / f"{contract_name}.sol" / f"{contract_name}.json"
    with open(abi_path) as f:
        return json.load(f)["abi"]


def get_web3() -> Web3:
    w3 = Web3(Web3.HTTPProvider(ARC_RPC_URL))
    w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
    return w3


def get_account(private_key: str) -> Account:
    return Account.from_key(private_key)


def send_tx(w3: Web3, account: Account, tx: dict) -> str:
    """Sign and send a transaction. Returns tx hash."""
    tx.setdefault("chainId", ARC_CHAIN_ID)
    tx.setdefault("nonce", w3.eth.get_transaction_count(account.address))
    tx.setdefault("gas", 500_000)
    tx.setdefault("gasPrice", w3.eth.gas_price)
    signed = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
    if receipt["status"] != 1:
        raise RuntimeError(f"Transaction reverted: {tx_hash.hex()}")
    return tx_hash.hex()


class CommitRevealContract:
    def __init__(self, w3: Web3, address: str):
        self.contract = w3.eth.contract(
            address=Web3.to_checksum_address(address),
            abi=_load_abi("CommitReveal"),
        )
        self.w3 = w3

    def commit(self, account: Account, signal_id_bytes: bytes, hash_bytes: bytes) -> str:
        tx = self.contract.functions.commit(signal_id_bytes, hash_bytes).build_transaction(
            {"from": account.address}
        )
        return send_tx(self.w3, account, tx)

    def reveal(
        self,
        account: Account,
        signal_id_bytes: bytes,
        direction: int,
        asset_id_bytes: bytes,
        salt_bytes: bytes,
        outcome: bool,
    ) -> str:
        tx = self.contract.functions.reveal(
            signal_id_bytes, direction, asset_id_bytes, salt_bytes, outcome
        ).build_transaction({"from": account.address})
        return send_tx(self.w3, account, tx)

    def get_signal_count(self, provider_address: str) -> int:
        return self.contract.functions.getSignalCount(
            Web3.to_checksum_address(provider_address)
        ).call()


class SignalMarketContract:
    def __init__(self, w3: Web3, address: str):
        self.contract = w3.eth.contract(
            address=Web3.to_checksum_address(address),
            abi=_load_abi("SignalMarket"),
        )
        self.w3 = w3

    def get_subscription(self, provider: str, buyer: str) -> dict:
        sub = self.contract.functions.getSubscription(
            Web3.to_checksum_address(provider),
            Web3.to_checksum_address(buyer),
        ).call()
        return {
            "active": sub[0],
            "float": sub[1],
            "buyerAgentPubKey": sub[2].hex(),
            "maxPositionBps": sub[3],
            "maxLeverageBps": sub[4],
            "dailyVarBps": sub[5],
            "signalCount": sub[6],
        }

    def process_signal_payment(self, account: Account, provider: str) -> str:
        tx = self.contract.functions.processSignalPayment(
            Web3.to_checksum_address(provider),
            account.address,
        ).build_transaction({"from": account.address})
        return send_tx(self.w3, account, tx)

    def get_provider_stats(self, provider: str) -> dict:
        stats = self.contract.functions.getProviderStats(
            Web3.to_checksum_address(provider)
        ).call()
        return {
            "winRateBps": stats[0],
            "totalReturnBps": stats[1],
            "totalSignals": stats[2],
            "lastProofBlock": stats[3],
        }
