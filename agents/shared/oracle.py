"""
Price oracle integration via Pyth Hermes REST API.
Used by both agents for price-at-commit and outcome determination.

Hardening (#9 from BLOCKERS.md):
  - Reject prices older than MAX_STALENESS_SECONDS (default 30s) — protects
    against a Pyth endpoint that has fallen behind.
  - Reject prices whose confidence interval / price exceeds MAX_CONF_RATIO
    (default 0.005 = 50 bps) — protects against degenerate market conditions
    where Pyth itself is signalling low confidence.
"""

import httpx
import os
import time
from .config import PYTH_ENDPOINT, PYTH_FEED_IDS


MAX_STALENESS_SECONDS = float(os.environ.get("PYTH_MAX_STALENESS_SEC", "30"))
MAX_CONF_RATIO        = float(os.environ.get("PYTH_MAX_CONF_RATIO",   "0.005"))


class StalePriceError(Exception):
    """Raised when Pyth returns a price older than MAX_STALENESS_SECONDS."""


class LowConfidencePriceError(Exception):
    """Raised when Pyth's confidence interval is too wide vs the price."""


def _parse_price(parsed: dict, *, validate_freshness: bool) -> float:
    """Common parse + validation. Returns price in USD; raises if untrusted."""
    expo = int(parsed["expo"])
    price = float(parsed["price"]) * (10 ** expo)
    conf  = float(parsed.get("conf",  "0")) * (10 ** expo)
    publish_time = int(parsed.get("publish_time", 0))

    if validate_freshness and publish_time > 0:
        age = time.time() - publish_time
        if age > MAX_STALENESS_SECONDS:
            raise StalePriceError(
                f"Pyth price is {age:.1f}s old (max {MAX_STALENESS_SECONDS}s)"
            )

    if price > 0 and conf > 0:
        ratio = conf / price
        if ratio > MAX_CONF_RATIO:
            raise LowConfidencePriceError(
                f"Pyth confidence/price = {ratio:.4f} > {MAX_CONF_RATIO} "
                f"(price={price:.2f}, conf=±{conf:.2f})"
            )

    return price


async def get_price(asset: str) -> float:
    """Returns latest validated price of asset in USD.

    Raises StalePriceError or LowConfidencePriceError if Pyth's response
    fails the freshness / confidence guards. Callers should catch these and
    decide whether to skip the signal vs. fall back to a cached price.
    """
    feed_id = PYTH_FEED_IDS.get(asset.upper())
    if not feed_id:
        raise ValueError(f"Unknown asset: {asset}")
    url = f"{PYTH_ENDPOINT}/v2/updates/price/latest"
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url, params={"ids[]": feed_id, "encoding": "hex"})
        resp.raise_for_status()
        data = resp.json()
    return _parse_price(data["parsed"][0]["price"], validate_freshness=True)


async def get_price_at_timestamp(asset: str, timestamp: int) -> float:
    """Returns price closest to given Unix timestamp. Used for outcome verification.

    Freshness is NOT validated here — by definition we're asking for a
    historical price. Confidence IS still validated.
    """
    feed_id = PYTH_FEED_IDS.get(asset.upper())
    if not feed_id:
        raise ValueError(f"Unknown asset: {asset}")
    url = f"{PYTH_ENDPOINT}/v2/updates/price/{timestamp}"
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url, params={"ids[]": feed_id, "encoding": "hex"})
        resp.raise_for_status()
        data = resp.json()
    return _parse_price(data["parsed"][0]["price"], validate_freshness=False)
