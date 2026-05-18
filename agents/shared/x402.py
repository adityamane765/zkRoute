"""
x402 Nanopayment integration for Arc/Circle Gateway.

x402 is HTTP-native micropayments: the server returns HTTP 402 Payment Required
with a payment header, the client pays, then retries with proof.

In zkRoute:
  - Provider's signal relay endpoint requires payment via x402
  - Buyer agent handles the 402 → pays → retries automatically
  - Payments settle in USDC on Arc with sub-second finality

Reference: https://x402.org / Circle Gateway docs
"""

import httpx
import json
import os
from eth_account import Account
from eth_account.messages import encode_defunct
from web3 import Web3

X402_FACILITATOR_URL = os.environ.get("X402_FACILITATOR_URL", "https://x402.org/facilitator")
SIGNAL_PRICE_USDC = float(os.environ.get("SIGNAL_PRICE_USDC", "0.01"))


class X402Client:
    """
    HTTP client that automatically handles x402 Payment Required responses.
    On 402: reads payment requirements → signs USDC micropayment → retries.
    """

    def __init__(self, account: Account, w3: Web3):
        self.account = account
        self.w3 = w3

    async def get_with_payment(self, url: str, **kwargs) -> httpx.Response:
        """Makes a GET request, handling x402 payment automatically."""
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url, **kwargs)
            if resp.status_code != 402:
                return resp
            return await self._pay_and_retry(client, "GET", url, resp, **kwargs)

    async def post_with_payment(self, url: str, **kwargs) -> httpx.Response:
        """Makes a POST request, handling x402 payment automatically."""
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, **kwargs)
            if resp.status_code != 402:
                return resp
            return await self._pay_and_retry(client, "POST", url, resp, **kwargs)

    async def _pay_and_retry(
        self,
        client: httpx.AsyncClient,
        method: str,
        url: str,
        payment_required_response: httpx.Response,
        **kwargs,
    ) -> httpx.Response:
        payment_header = payment_required_response.headers.get("X-Payment-Required")
        if not payment_header:
            return payment_required_response

        requirements = json.loads(payment_header)
        payment_token = await self._create_payment_token(requirements)

        headers = kwargs.pop("headers", {})
        headers["X-Payment"] = payment_token

        if method == "GET":
            return await client.get(url, headers=headers, **kwargs)
        return await client.post(url, headers=headers, **kwargs)

    async def _create_payment_token(self, requirements: dict) -> str:
        """
        Creates an EIP-712 signed payment authorization.
        The facilitator verifies this and triggers the USDC transfer on Arc.
        """
        amount = requirements.get("maxAmountRequired", str(int(SIGNAL_PRICE_USDC * 1e6)))
        asset = requirements.get("asset", "USDC")
        recipient = requirements.get("recipient", "")
        nonce = requirements.get("nonce", self.w3.eth.get_transaction_count(self.account.address))

        # EIP-712 typed data for x402 payment authorization
        typed_data = {
            "types": {
                "EIP712Domain": [
                    {"name": "name", "type": "string"},
                    {"name": "version", "type": "string"},
                    {"name": "chainId", "type": "uint256"},
                ],
                "PaymentAuthorization": [
                    {"name": "from", "type": "address"},
                    {"name": "to", "type": "address"},
                    {"name": "value", "type": "uint256"},
                    {"name": "validAfter", "type": "uint256"},
                    {"name": "validBefore", "type": "uint256"},
                    {"name": "nonce", "type": "bytes32"},
                ],
            },
            "primaryType": "PaymentAuthorization",
            "domain": {
                "name": "USD Coin",
                "version": "2",
                "chainId": int(os.environ.get("ARC_CHAIN_ID", "1234")),
            },
            "message": {
                "from": self.account.address,
                "to": recipient,
                "value": int(amount),
                "validAfter": 0,
                "validBefore": 2**256 - 1,
                "nonce": Web3.to_bytes(nonce).rjust(32, b"\x00").hex(),
            },
        }

        encoded = Web3.to_hex(
            self.account.sign_typed_data(typed_data, full_format=True).signature
        )

        payment_token = json.dumps({
            "scheme": "exact",
            "network": f"arc-{os.environ.get('ARC_CHAIN_ID', '1234')}",
            "payload": {
                "signature": encoded,
                "authorization": typed_data["message"],
            },
        })
        return payment_token


class X402Server:
    """
    Middleware helper for FastAPI endpoints that require x402 payment.
    Returns 402 with payment requirements if no valid X-Payment header.
    """

    def __init__(self, price_usdc: float, recipient_address: str):
        self.price_usdc = price_usdc
        self.recipient = recipient_address

    def payment_required_response(self) -> dict:
        """Returns the dict to serialize into X-Payment-Required header."""
        return {
            "maxAmountRequired": str(int(self.price_usdc * 1e6)),
            "asset": "USDC",
            "recipient": self.recipient,
            "scheme": "exact",
            "network": f"arc-{os.environ.get('ARC_CHAIN_ID', '1234')}",
        }

    async def verify_payment(self, payment_token_str: str) -> bool:
        """Verifies payment token with the x402 facilitator."""
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{X402_FACILITATOR_URL}/verify",
                json={
                    "payment": json.loads(payment_token_str),
                    "requirements": self.payment_required_response(),
                },
            )
        return resp.status_code == 200 and resp.json().get("isValid", False)
