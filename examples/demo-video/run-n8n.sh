#!/usr/bin/env bash
# Start a fresh n8n in Docker for recording the verification video.
#
# - Uses its own data directory (default ~/.n8n-demo) so the community node is
#   genuinely installed from npm on camera, not pre-installed.
# - N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE lets the AI Agent use community nodes
#   as tools; without it the "Artefaktum Tool" node never appears.
#
#   ./run-n8n.sh            # start (keeps existing data dir)
#   ./run-n8n.sh --fresh    # wipe the data dir first
set -euo pipefail

DATA_DIR="${N8N_DEMO_DIR:-$HOME/.n8n-demo}"
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"

if [[ "${1:-}" == "--fresh" ]]; then
  echo "wiping $DATA_DIR"
  rm -rf "$DATA_DIR"
fi
mkdir -p "$DATA_DIR"

echo "n8n data dir: $DATA_DIR"
echo "open http://localhost:5678"
exec docker run -it --rm \
  --name n8n-demo \
  -p 5678:5678 \
  -e N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true \
  -e N8N_RUNNERS_ENABLED=true \
  -e GENERIC_TIMEZONE=Europe/Vilnius \
  -e TZ=Europe/Vilnius \
  -v "$DATA_DIR:/home/node/.n8n" \
  n8nio/n8n:latest
