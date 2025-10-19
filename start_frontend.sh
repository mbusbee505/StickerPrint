#!/bin/bash
# Start frontend development server

cd frontend

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Start dev server
echo "Starting frontend server on http://localhost:3000"
npm run dev
