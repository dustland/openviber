#!/bin/sh
# Start both the gateway and web server in a single container.
# Gateway runs in the background; web runs in the foreground.
# If either exits, the container stops.

set -e

GATEWAY_PORT="${GATEWAY_PORT:-6009}"
WEB_PORT="${PORT:-3000}"

echo "[entrypoint] Starting gateway on port $GATEWAY_PORT ..."
node /app/dist/cli/index.js gateway -p "$GATEWAY_PORT" &
GATEWAY_PID=$!

echo "[entrypoint] Starting web on port $WEB_PORT ..."
cd /app/web
PORT=$WEB_PORT node build/index.js &
WEB_PID=$!

# If either process exits, stop the other and exit
trap "kill $GATEWAY_PID $WEB_PID 2>/dev/null; exit 0" SIGINT SIGTERM

wait -n $GATEWAY_PID $WEB_PID 2>/dev/null || true
echo "[entrypoint] A process exited. Shutting down..."
kill $GATEWAY_PID $WEB_PID 2>/dev/null
wait
