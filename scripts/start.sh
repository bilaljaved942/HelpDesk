#!/usr/bin/env bash
# Start the whole app:
#   PostgreSQL + pgvector (Docker, :5434) -> migrations -> Ollama check -> API (:8100) -> website (:3100)
# Open http://localhost:3100 . Ctrl+C stops the API and website (the database container keeps running).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p outputs/logs
trap 'kill 0' EXIT

docker compose up -d --wait db
.venv/bin/alembic upgrade head

MODEL="${HELPDESK_LLM_MODEL:-qwen3:8b}"
if ! curl -s 127.0.0.1:11434/api/tags | grep -q "\"$MODEL\""; then
  echo "Ollama is not running or $MODEL is missing. Run: brew services start ollama && ollama pull $MODEL"
  exit 1
fi

.venv/bin/uvicorn helpdesk.api.main:app --host 127.0.0.1 --port 8100 > outputs/logs/api.log 2>&1 &
(cd web && npm run dev -- --port 3100) > outputs/logs/web.log 2>&1 &

echo "Starting... open http://localhost:3100"
echo "  shopper: sara@example.com / sara-demo-1    staff (/staff/login): admin@northwind.example / northwind-demo"
wait
