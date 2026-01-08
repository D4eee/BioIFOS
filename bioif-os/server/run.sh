#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$ROOT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi

source .venv/bin/activate

python - <<'PY'
try:
    import fastapi  # noqa: F401
    import uvicorn  # noqa: F401
except Exception:
    raise SystemExit(1)
raise SystemExit(0)
PY
if [ $? -ne 0 ]; then
  pip install -r requirements.txt
fi

python -m uvicorn server.main:app --reload --host 0.0.0.0 --port 8000
