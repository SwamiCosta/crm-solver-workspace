#!/usr/bin/env bash
# sync-docs.sh
# Copies root-level documentation into server/context/ so the Docker image
# stays current with the latest findings and architecture docs.
#
# Run this from the engineering environment (repo root accessible) BEFORE
# building the Docker image. Requires the full repo to be present locally.
# The Docker build context is server/ only — this script must run first.
#
# Usage:
#   From repo root:  bash server/scripts/sync-docs.sh
#   From server/:    bash scripts/sync-docs.sh
#   Via npm:         npm run sync  (run from server/)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$SERVER_DIR")"

echo "sync-docs: root=${ROOT_DIR}"
echo "sync-docs: server=${SERVER_DIR}"
echo ""

# Verify we are in the right place
if [ ! -f "$ROOT_DIR/CLAUDE.md" ]; then
  echo "ERROR: Could not locate CLAUDE.md at repo root (${ROOT_DIR})."
  echo "This script must be run from within the crm-solver-workspace repository."
  exit 1
fi

# ARCHITECTURE.md — server root level
cp "$ROOT_DIR/ARCHITECTURE.md" "$SERVER_DIR/ARCHITECTURE.md"
echo "  synced: ARCHITECTURE.md"

# assumptions.md
cp "$ROOT_DIR/docs/assumptions.md" "$SERVER_DIR/context/assumptions.md"
echo "  synced: context/assumptions.md"

# hitl-ramp.md
cp "$ROOT_DIR/docs/hitl-ramp.md" "$SERVER_DIR/context/hitl-ramp.md"
echo "  synced: context/hitl-ramp.md"

# findings/
mkdir -p "$SERVER_DIR/context/findings"
SYNCED=0
for f in "$ROOT_DIR/docs/findings/"*.md; do
  [ -f "$f" ] || continue
  cp "$f" "$SERVER_DIR/context/findings/$(basename "$f")"
  echo "  synced: context/findings/$(basename "$f")"
  SYNCED=$((SYNCED + 1))
done

echo ""
echo "sync-docs: complete. ${SYNCED} finding(s) synced."
echo "You can now build the Docker image from server/:"
echo "  docker build -t crm-solver-interfacer ./server"
