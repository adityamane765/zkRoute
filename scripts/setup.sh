#!/bin/bash
# zkRoute — full setup script
# Run once after cloning. Sets up all dependencies.

set -e
echo "=== zkRoute Setup ==="

# 1. Arc CLI
echo "--- Installing Arc CLI ---"
uv tool install git+https://github.com/the-canteen-dev/ARC-cli 2>/dev/null || \
  pip install git+https://github.com/the-canteen-dev/ARC-cli

# 2. Python agents
echo "--- Installing Python agent dependencies ---"
cd agents && pip install -e ".[dev]" && cd ..

# 3. Backend
echo "--- Installing backend dependencies ---"
cd backend && pip install -r requirements.txt && cd ..

# 4. Contracts
echo "--- Installing contract dependencies ---"
cd contracts && npm install && cd ..

# 5. Circuits
echo "--- Installing circuit dependencies ---"
cd circuits && npm install && cd ..

# 6. Frontend
echo "--- Installing frontend dependencies ---"
cd frontend && npm install && cd ..

# 7. Copy env
if [ ! -f .env ]; then
  cp .env.example .env
  echo "--- Created .env from .env.example — fill in your keys! ---"
fi

echo ""
echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo "  1. Fill in .env with your Arc RPC, Circle API keys, and private keys"
echo "  2. Deploy contracts:  cd contracts && npm run deploy:arc"
echo "  3. Build ZK circuit:  cd circuits && npm run setup  (takes ~10 min)"
echo "  4. Start backend:     uvicorn backend.main:app --reload"
echo "  5. Start provider:    python -m agents.provider.agent"
echo "  6. Start buyer:       python -m agents.buyer.agent"
echo "  7. Start frontend:    cd frontend && npm run dev"
