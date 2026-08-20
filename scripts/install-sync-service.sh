#!/bin/zsh
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.dj-sync-agent.sync-watch"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_PATH="$PLIST_DIR/$LABEL.plist"
CONFIG_DIR="$HOME/.config/dj-sync-agent"
ENV_PATH="$CONFIG_DIR/sync-watch.env"
LOG_DIR="$HOME/Library/Logs/dj-sync-agent"

PNPM_BIN="${PNPM_BIN_OVERRIDE:-$(command -v pnpm || true)}"
NODE_BIN="${NODE_BIN_OVERRIDE:-$(command -v node || true)}"

if [[ -z "$PNPM_BIN" ]]; then
  echo "ERROR: pnpm was not found in the current shell."
  exit 1
fi

if [[ -z "$NODE_BIN" ]]; then
  echo "ERROR: node was not found in the current shell."
  exit 1
fi

: "${SYNC_AGENT_ID:?Set SYNC_AGENT_ID before installing the service.}"
: "${SYNC_API_URL:?Set SYNC_API_URL before installing the service.}"
: "${SYNC_API_KEY:?Set SYNC_API_KEY before installing the service.}"
: "${REKORDBOX_DB_KEY:?Set REKORDBOX_DB_KEY before installing the service.}"

REKORDBOX_CIPHER_COMPATIBILITY="${REKORDBOX_CIPHER_COMPATIBILITY:-4}"

mkdir -p "$PLIST_DIR" "$CONFIG_DIR" "$LOG_DIR"
chmod 700 "$CONFIG_DIR" "$LOG_DIR"

# Use a single-quoted heredoc for the generated shell file and
# then substitute only the required values. This avoids accidental
# expansion by the installer itself.
cat > "$ENV_PATH" <<EOF
SYNC_AGENT_ID=$(printf '%q' "$SYNC_AGENT_ID")
SYNC_API_URL=$(printf '%q' "$SYNC_API_URL")
SYNC_API_KEY=$(printf '%q' "$SYNC_API_KEY")

REKORDBOX_DB_KEY=$(printf '%q' "$REKORDBOX_DB_KEY")
REKORDBOX_CIPHER_COMPATIBILITY=$(printf '%q' "$REKORDBOX_CIPHER_COMPATIBILITY")

SYNC_WATCH_RUN_ON_START='true'
SYNC_WATCH_DRAIN='false'
SYNC_WATCH_DEBOUNCE_MS='1500'
CHANGE_BATCH_SIZE='500'
SYNC_MAX_BATCHES='20'
SYNC_API_TIMEOUT_MS='20000'
SYNC_MAX_RETRIES='4'
SYNC_RETRY_BASE_MS='1000'
EOF

chmod 600 "$ENV_PATH"

escape_xml() {
  print -r -- "$1" | sed \
    -e 's/&/\&amp;/g' \
    -e 's/</\&lt;/g' \
    -e 's/>/\&gt;/g' \
    -e 's/"/\&quot;/g' \
    -e "s/'/\&apos;/g"
}

PROJECT_DIR_XML="$(escape_xml "$PROJECT_DIR")"
PNPM_BIN_XML="$(escape_xml "$PNPM_BIN")"
ENV_PATH_XML="$(escape_xml "$ENV_PATH")"
LOG_DIR_XML="$(escape_xml "$LOG_DIR")"

cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>set -a; source '${ENV_PATH_XML}'; set +a; export PATH='$(dirname "$PNPM_BIN"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'; cd '${PROJECT_DIR_XML}'; exec '${PNPM_BIN_XML}' sync:watch</string>
  </array>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>ProcessType</key>
  <string>Background</string>

  <key>ThrottleInterval</key>
  <integer>10</integer>

  <key>WorkingDirectory</key>
  <string>${PROJECT_DIR_XML}</string>

  <key>StandardOutPath</key>
  <string>${LOG_DIR_XML}/sync-watch.log</string>

  <key>StandardErrorPath</key>
  <string>${LOG_DIR_XML}/sync-watch.error.log</string>
</dict>
</plist>
EOF

plutil -lint "$PLIST_PATH" >/dev/null

GUI_DOMAIN="gui/$(id -u)"

launchctl bootout "$GUI_DOMAIN/$LABEL" 2>/dev/null || true
launchctl bootstrap "$GUI_DOMAIN" "$PLIST_PATH"
launchctl enable "$GUI_DOMAIN/$LABEL" 2>/dev/null || true
launchctl kickstart -k "$GUI_DOMAIN/$LABEL"

echo
echo "Installed and started: $LABEL"
echo "Project: $PROJECT_DIR"
echo "Environment file: $ENV_PATH"
echo "Logs: $LOG_DIR"
echo
echo "The environment file includes Rekordbox SQLCipher settings."
echo "Its permissions are: $(stat -f '%Lp' "$ENV_PATH")"
