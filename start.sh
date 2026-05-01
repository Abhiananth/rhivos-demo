#!/bin/bash
# start.sh — boots the full automotive demo
# Usage: ./start.sh

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "  Automotive Linux Demo"
echo "  ─────────────────────────────────────────────────"

# ── 1. Podman machine ─────────────────────────────────────────────────────────
echo "  [1/4] Checking Podman machine..."
if ! /opt/podman/bin/podman machine inspect podman-machine-default &>/dev/null; then
  echo "        Machine not found — run: podman machine init && podman machine start"
  exit 1
fi
STATE=$(/opt/podman/bin/podman machine inspect podman-machine-default \
        --format '{{.State}}' 2>/dev/null || echo "unknown")
if [ "$STATE" != "running" ]; then
  echo "        Starting Podman machine..."
  /opt/podman/bin/podman machine start
fi
echo "        Podman machine: running"

# ── 2. Python backend ─────────────────────────────────────────────────────────
echo "  [2/4] Starting FastAPI backend..."
cd "$ROOT/backend"
if [ ! -d .venv ]; then
  python3 -m venv .venv
  .venv/bin/pip install -q -r requirements.txt
fi
.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
echo "        Backend PID: $BACKEND_PID  →  http://localhost:8000"

# wait for backend to be ready
for i in $(seq 1 10); do
  sleep 0.5
  if curl -sf http://localhost:8000/health &>/dev/null; then
    break
  fi
done

# ── 3. Frontend ───────────────────────────────────────────────────────────────
echo "  [3/4] Starting React frontend..."
cd "$ROOT/frontend"
# ensure fnm / npm is available
export PATH="/usr/local/bin:$PATH"
eval "$(fnm env)" 2>/dev/null || true
if [ ! -d node_modules ]; then
  echo "        Installing npm packages (first run)..."
  npm install
fi
npm run dev &
FRONTEND_PID=$!
echo "        Frontend PID: $FRONTEND_PID  →  http://localhost:5173"

# ── 4. Done ───────────────────────────────────────────────────────────────────
echo ""
echo "  [4/4] Ready."
echo "  ─────────────────────────────────────────────────"
echo "  Open:  http://localhost:5173"
echo "  API:   http://localhost:8000/docs"
echo ""
echo "  First time? Click 'Build container images' in the UI."
echo "  Press Ctrl+C to stop everything."
echo ""

# Cleanup on exit
trap "echo ''; echo '  Stopping...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; /opt/podman/bin/podman rm -f demo-asil-b demo-qm demo-adas demo-ivi demo-gateway demo-ota-active 2>/dev/null; exit 0" INT TERM

wait
