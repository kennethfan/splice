#!/bin/bash
# Splice dev launcher — finds a free port and starts Tauri dev with it.
# Usage: bash scripts/tauri-dev.sh
# (or npm run tauri:dev)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

# Find a free port starting from 1420
find_free_port() {
  local port=1420
  while true; do
    if ! lsof -i :$port >/dev/null 2>&1; then
      echo "$port"
      return 0
    fi
    port=$((port + 1))
    if [ $port -gt 1520 ]; then
      echo "Error: no free port found in 1420-1520 range" >&2
      exit 1
    fi
  done
}

PORT=$(find_free_port)

echo "🔌 Splice dev: using port $PORT"

export TAURI_DEV_URL="http://localhost:$PORT"
export VITE_PORT="$PORT"

npx tauri dev
