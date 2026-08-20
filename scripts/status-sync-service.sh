#!/bin/zsh
set -euo pipefail

LABEL="com.dj-sync-agent.sync-watch"
GUI_DOMAIN="gui/$(id -u)"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"

echo "=== DJ Sync Agent service ==="
echo "Label: $LABEL"
echo "Plist: $PLIST_PATH"

if [[ -f "$PLIST_PATH" ]]; then
  echo "Plist: present"
else
  echo "Plist: missing"
fi

echo
if launchctl print "$GUI_DOMAIN/$LABEL" 2>/dev/null; then
  echo
  echo "Service state: loaded"
else
  echo
  echo "Service state: not loaded"
fi
