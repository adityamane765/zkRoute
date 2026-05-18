"""
Seeds the database with demo providers and simulated signals for the demo video.
Run: python scripts/demo_seed.py
"""

import httpx
import asyncio
import random

BACKEND = "http://localhost:8000"

DEMO_PROVIDERS = [
    {
        "address": "0x1111111111111111111111111111111111111111",
        "name": "ETH Momentum Alpha",
        "description": "Medium-frequency ETH strategy targeting momentum regime shifts. Verified track record.",
        "frequency": "MediumFrequency",
        "agent_public_key": "a" * 64,
        "win_rate_bps": 6800,
        "total_return_bps": 2340,
        "total_signals": 47,
        "last_proof_block": 100000,
    },
    {
        "address": "0x2222222222222222222222222222222222222222",
        "name": "BTC Swing Desk",
        "description": "Multi-day BTC swing trades based on on-chain analytics and macro indicators.",
        "frequency": "Swing",
        "agent_public_key": "b" * 64,
        "win_rate_bps": 5900,
        "total_return_bps": 1820,
        "total_signals": 23,
        "last_proof_block": 99800,
    },
    {
        "address": "0x3333333333333333333333333333333333333333",
        "name": "Multi-Asset Intraday",
        "description": "Intraday signals across ETH and BTC. High signal frequency, tight risk management.",
        "frequency": "Intraday",
        "agent_public_key": "c" * 64,
        "win_rate_bps": 6200,
        "total_return_bps": 890,
        "total_signals": 134,
        "last_proof_block": 100100,
    },
]


async def seed():
    async with httpx.AsyncClient(base_url=BACKEND, timeout=10) as client:
        for p in DEMO_PROVIDERS:
            # Register provider
            await client.post("/providers/register", json={
                "address": p["address"],
                "name": p["name"],
                "description": p["description"],
                "frequency": p["frequency"],
                "agent_public_key": p["agent_public_key"],
            })
            # Update with ZK-verified stats
            await client.patch(f"/providers/{p['address']}/stats", json={
                "win_rate_bps": p["win_rate_bps"],
                "total_return_bps": p["total_return_bps"],
                "total_signals": p["total_signals"],
                "last_proof_block": p["last_proof_block"],
            })
            print(f"Seeded: {p['name']}")

    print(f"\nSeeded {len(DEMO_PROVIDERS)} providers.")


if __name__ == "__main__":
    asyncio.run(seed())
