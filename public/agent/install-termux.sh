#!/data/data/com.termux/files/usr/bin/bash
# Second Brain agent installer for Android (Termux). Free and open source end to end.
# Needs, from F-Droid: Termux, Termux:API (phone controls) and Termux:Boot (start after a restart).
# The You page in your dashboard gives you the one line that runs this, with your pairing code.
set -e
if [ -z "$SB_PAIR" ] || [ -z "$SB_APP" ]; then echo "Copy the full command from the You page in your dashboard."; exit 1; fi

echo "Installing Node.js and the Termux:API tools (free)..."
pkg install -y nodejs-lts termux-api >/dev/null

# Lets the agent read your notes folder (Obsidian) and find files. Android asks once.
[ -d "$HOME/storage/shared" ] || termux-setup-storage || true

DIR="$HOME/.second-brain-agent"
mkdir -p "$DIR"
pkill -f second-brain-agent.mjs 2>/dev/null || true
rm -f "$DIR/agent.pid"
curl -fsSL "${SB_APP%/}/agent/second-brain-agent.mjs" -o "$DIR/second-brain-agent.mjs"
node "$DIR/second-brain-agent.mjs" pair "$SB_PAIR"

mkdir -p "$HOME/.termux/boot"
cat > "$HOME/.termux/boot/second-brain-agent.sh" <<EOF
#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock
exec node "$DIR/second-brain-agent.mjs" start >/dev/null 2>&1
EOF
chmod +x "$HOME/.termux/boot/second-brain-agent.sh"

termux-wake-lock || true
nohup node "$DIR/second-brain-agent.mjs" start >/dev/null 2>&1 &

echo ""
echo "Done. Your phone is connected."
echo "Open Termux:Boot once so the agent starts again after a restart."
echo "In Android settings, set Termux battery use to Unrestricted so it keeps running."
