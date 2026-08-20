#!/bin/zsh
set -euo pipefail

LABEL="com.dj-sync-agent.sync-watch"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"
GUI_DOMAIN="gui/$(id -u)"

launchctl bootout "$GUI_DOMAIN/$LABEL" 2>/dev/null || true
rm -f "$PLIST_PATH"

echo "Removed LaunchAgent: $LABEL"
