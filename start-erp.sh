#!/bin/bash
# ─────────────────────────────────────────
#   College ERP — One Click Starter
# ─────────────────────────────────────────

APP_PATH="/Users/aarya/college-erp"
BACKEND="$APP_PATH/backend"
FRONTEND="$APP_PATH/frontend"

echo "🚀 Starting College ERP..."
echo ""

# ── Check Node is installed ───────────────
if ! command -v node &> /dev/null; then
  echo "❌ Node.js not found. Please install it from https://nodejs.org"
  exit 1
fi

# ── Check backend folder exists ──────────
if [ ! -d "$BACKEND" ]; then
  echo "❌ Backend folder not found at $BACKEND"
  exit 1
fi

# ── Check frontend folder exists ─────────
if [ ! -d "$FRONTEND" ]; then
  echo "❌ Frontend folder not found at $FRONTEND"
  exit 1
fi

# ── Kill anything already on port 3000/3001 ──
echo "🔄 Clearing ports 3000 and 3001..."
lsof -ti:3000 | xargs kill -9 2>/dev/null
lsof -ti:3001 | xargs kill -9 2>/dev/null
sleep 1

# ── Create .env.local for frontend if missing ──
if [ ! -f "$FRONTEND/.env.local" ]; then
  echo "REACT_APP_API_URL=http://localhost:3000/api" > "$FRONTEND/.env.local"
  echo "✅ Created frontend .env.local"
fi

# ── Start Backend ─────────────────────────
echo "▶ Starting Backend (port 3000)..."
osascript -e "tell application \"Terminal\" to do script \"echo '🔧 BACKEND'; cd $BACKEND && node server.js\""
sleep 3

# ── Wait for backend to be ready ─────────
echo "⏳ Waiting for backend..."
for i in {1..10}; do
  if curl -s http://localhost:3000/api/faculties > /dev/null 2>&1; then
    echo "✅ Backend is ready!"
    break
  fi
  sleep 1
done

# ── Start Frontend ────────────────────────
echo "▶ Starting Frontend (port 3001)..."
osascript -e "tell application \"Terminal\" to do script \"echo '🎨 FRONTEND'; cd $FRONTEND && npm start\""
sleep 5

# ── Open browser ──────────────────────────
echo "🌐 Opening browser..."
open http://localhost:3001

echo ""
echo "✅ College ERP is starting up!"
echo "   Frontend  →  http://localhost:3001"
echo "   Backend   →  http://localhost:3000"
echo "   Admin     →  admin@college.com / Admin@123"
echo ""
echo "   To stop: close both Terminal windows"
