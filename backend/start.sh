#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install --production=false
fi

mkdir -p media/hls

export ADMIN_USER="${ADMIN_USER:-admin}"
export ADMIN_PASS="${ADMIN_PASS:-Admin@123}"
export STREAM_KEY="${STREAM_KEY:-mystream}"
export HTTP_PORT="${HTTP_PORT:-3000}"
export RTMP_PORT="${RTMP_PORT:-1935}"
export SESSION_SECRET="${SESSION_SECRET:-change-me-to-a-random-string}"
export FFMPEG_PATH="${FFMPEG_PATH:-$(command -v ffmpeg || echo /usr/bin/ffmpeg)}"
export HLS_DIR="${HLS_DIR:-./media/hls}"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "Warning: ffmpeg not found. HLS transcoding may fail." >&2
fi

echo "Starting server on http://localhost:${HTTP_PORT}"
echo "RTMP ingest: rtmp://localhost:${RTMP_PORT}/live"
echo "Stream key: ${STREAM_KEY}"
exec npm start
