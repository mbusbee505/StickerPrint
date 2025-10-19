#!/bin/bash
# Start backend server

cd backend

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -q -r requirements.txt

# Start server
echo "Starting backend server on http://localhost:8000"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
