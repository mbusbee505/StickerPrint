#!/bin/bash

# StickerPrint - Single-command startup script
# Starts both backend and frontend in parallel

set -e

echo "🎨 Starting StickerPrint..."
echo ""

# Check if backend venv exists
if [ ! -d "backend/venv" ]; then
    echo "⚠️  Backend virtual environment not found. Creating it..."
    cd backend
    python3 -m venv venv
    if [ $? -ne 0 ]; then
        echo "❌ Failed to create virtual environment. Please install python3-venv:"
        echo "   sudo apt install python3-venv  # Ubuntu/Debian"
        echo "   sudo yum install python3-venv  # CentOS/RHEL"
        exit 1
    fi
    ./venv/bin/pip install -r requirements.txt
    cd ..
    echo "✅ Backend setup complete"
    echo ""
fi

# Check if frontend node_modules exists
if [ ! -d "frontend/node_modules" ]; then
    echo "⚠️  Frontend dependencies not found. Installing..."
    cd frontend
    npm install
    cd ..
    echo "✅ Frontend setup complete"
    echo ""
fi

# Check for API key
if [ -z "$OPENAI_API_KEY" ] && [ ! -f "backend/.env" ]; then
    echo "⚠️  Warning: OPENAI_API_KEY not set and no backend/.env file found"
    echo "   You'll need to configure it via the Config page at http://localhost:3000/config"
    echo ""
fi

# Function to cleanup background processes on exit
cleanup() {
    echo ""
    echo "🛑 Shutting down..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

# Start backend
echo "🔧 Starting backend on http://localhost:8000..."
cd backend
./venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 > ../backend.log 2>&1 &
BACKEND_PID=$!
cd ..

# Give backend time to start
sleep 2

# Start frontend
echo "🎨 Starting frontend on http://localhost:3000..."
cd frontend
npm run dev > ../frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

# Wait a moment for servers to initialize
sleep 3

echo ""
echo "✅ StickerPrint is running!"
echo ""
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:8000"
echo "   API Docs: http://localhost:8000/docs"
echo ""
echo "📋 Logs:"
echo "   Backend:  tail -f backend.log"
echo "   Frontend: tail -f frontend.log"
echo ""
echo "Press Ctrl+C to stop both servers"
echo ""

# Wait for any process to exit
wait
