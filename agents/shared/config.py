import os
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "../../.env"))

# Arc / Chain
ARC_RPC_URL = os.environ["ARC_RPC_URL"]
ARC_CHAIN_ID = int(os.environ["ARC_CHAIN_ID"])

# Contracts
PROVIDER_REGISTRY_ADDRESS = os.environ["PROVIDER_REGISTRY_ADDRESS"]
COMMIT_REVEAL_ADDRESS = os.environ["COMMIT_REVEAL_ADDRESS"]
SIGNAL_MARKET_ADDRESS = os.environ["SIGNAL_MARKET_ADDRESS"]

# Backend API
BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8000")

# Payments
SIGNAL_PRICE_USDC = float(os.environ.get("SIGNAL_PRICE_USDC", "0.01"))

# Oracle
PYTH_ENDPOINT = os.environ.get("PYTH_ENDPOINT", "https://hermes.pyth.network")

# Pyth price feed IDs
PYTH_FEED_IDS = {
    "ETH": "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
    "BTC": "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
}
