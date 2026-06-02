#!/bin/bash

# TRACK SYSTEM LAUNCH SCRIPT

LOG_FILE="/tmp/track-server.log"

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "TRACK System Launcher"
echo "===================="
echo ""

# Start MongoDB container
echo -n "Starting MongoDB... "
docker start mongodb 2>/dev/null || docker run -d --name mongodb -p 27017:27017 -e MONGO_INITDB_ROOT_USERNAME=admin -e MONGO_INITDB_ROOT_PASSWORD=admin123 -v mongodb-data:/data/db mongo:8 >/dev/null 2>&1
if [ $? -eq 0 ]; then echo "OK"; else echo "FAILED"; fi

# Start Oracle XE container (adjust name if different)
echo -n "Starting Oracle XE... "
docker start oracle-xe 2>/dev/null
if [ $? -eq 0 ]; then echo "OK"; else echo "SKIPPED (container not found)"; fi

# Wait for databases
echo -n "Waiting for databases... "
sleep 5
echo "OK"

# Change to the webapp directory (now relative to script location)
cd "$SCRIPT_DIR/webapp" || {
    echo "ERROR: webapp directory not found at $SCRIPT_DIR/webapp"
    exit 1
}

# Kill any existing server process
pkill -f "node server.js" 2>/dev/null

# Start Node.js server
echo -n "Starting Node.js server... "
node server.js > "$LOG_FILE" 2>&1 &
SERVER_PID=$!
sleep 3

if ps -p $SERVER_PID > /dev/null 2>&1; then
    echo "OK (PID: $SERVER_PID)"
else
    echo "FAILED. Check $LOG_FILE"
    exit 1
fi

# Open browser
echo -n "Opening browser... "
# Try to find an available browser (prefer Brave, then fallback to default)
if command -v brave-browser &> /dev/null; then
    brave-browser --new-tab http://localhost:3000/login.html 2>/dev/null &
elif command -v google-chrome &> /dev/null; then
    google-chrome --new-tab http://localhost:3000/login.html 2>/dev/null &
elif command -v firefox &> /dev/null; then
    firefox --new-tab http://localhost:3000/login.html 2>/dev/null &
else
    echo "WARNING: No supported browser found"
fi
echo "OK"

echo ""
echo "TRACK System Ready"
echo "=================="
echo ""
echo "Login: http://localhost:3000/login.html"
echo ""
echo "Admin: ID=1, Password=admin123"
echo "Regular: ID=2, Password=regular123"
echo ""
echo "Stop server: pkill -f 'node server.js'"
