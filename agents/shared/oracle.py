"""
Price oracle integration via Pyth Hermes REST API.
Used by both agents for price-at-commit and outcome determination.
"""

import httpx
import asyncio
from .config import PYTH_ENDPOINT, PYTH_FEED_IDS


async def get_price(asset: str) -> float:
    """Returns latest price of asset in USD."""
    feed_id = PYTH_FEED_IDS.get(asset.upper())
    if not feed_id:
        raise ValueError(f"Unknown asset: {asset}")
    url = f"{PYTH_ENDPOINT}/v2/updates/price/latest"
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url, params={"ids[]": feed_id, "encoding": "hex"})
        resp.raise_for_status()
        data = resp.json()
    parsed = data["parsed"][0]["price"]
    price = float(parsed["price"]) * (10 ** int(parsed["expo"]))
    return price


async def get_price_at_timestamp(asset: str, timestamp: int) -> float:
    """Returns price closest to given Unix timestamp. Used for outcome verification."""
    feed_id = PYTH_FEED_IDS.get(asset.upper())
    if not feed_id:
        raise ValueError(f"Unknown asset: {asset}")
    url = f"{PYTH_ENDPOINT}/v2/updates/price/{timestamp}"
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url, params={"ids[]": feed_id, "encoding": "hex"})
        resp.raise_for_status()
        data = resp.json()
    parsed = data["parsed"][0]["price"]
    return float(parsed["price"]) * (10 ** int(parsed["expo"]))
