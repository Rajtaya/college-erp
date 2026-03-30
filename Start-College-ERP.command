#!/bin/bash

# ─────────────────────────────────────────
#   College ERP — One Click Starter
# ─────────────────────────────────────────

APP_PATH="/user/aarya/App_F"
BACKEND="$APP_PATH/college-erp-backend-master"
FRONTEND="$APP_PATH/college-erp-frontend-master"

echo "🚀 Starting College ERP..."
echo ""

# Start Backend
echo "▶ Starting Backend (port 3000)..."
osascript -e "tell application \"Terminal\" to do script \"cd $BACKEND && npm start\""

sleep 2

# Start Frontend
echo "▶ Starting Frontend (port 3001)..."
osascript -e "tell application \"Terminal\" to do script \"cd $FRONTEND && npm start\""

sleep 5

# Open browser
echo "🌐 Opening browser..."
open http://localhost:3001

echo ""
echo "✅ College ERP is starting up!"
echo "   Frontend → http://localhost:3001"
echo "   Backend  → http://localhost:3000"
