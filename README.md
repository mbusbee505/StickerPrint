# StickerPrint

A web application for batch AI sticker generation using OpenAI's image API.

## ✨ Features

- **Upload & Generate**: Upload text prompts and generate sticker images in batch
- **Gallery**: Browse all generated images in a responsive grid
- **Live Updates**: Real-time progress updates via Server-Sent Events
- **ZIP Downloads**: Download individual runs or all images as ZIP files
- **Configuration**: Manage API key and styling prompts without restarts

## 🚀 Quick Start

### Prerequisites
- Python 3.9+
- Node.js 18+
- OpenAI API key

### One-Command Startup

```bash
./start.sh
```

This will:
1. Create Python virtual environment (if needed)
2. Install backend dependencies (if needed)
3. Install frontend dependencies (if needed)
4. Start backend server on http://localhost:8000
5. Start frontend dev server on http://localhost:3000

**Open http://localhost:3000** and configure your API key in the Config page.

### First-Time Setup

```bash
# 1. Set your OpenAI API key (optional - can also set via UI)
export OPENAI_API_KEY="your-key-here"

# 2. Start the app
./start.sh
```

### Stop the App

Press `Ctrl+C` in the terminal where you ran `./start.sh`

## 📖 Usage

1. **Configure API Key**
   - Go to http://localhost:3000/config
   - Enter your OpenAI API key
   - Customize the base prompt (optional)
   - Click Save

2. **Generate Stickers**
   - Go to Dashboard
   - Upload a `.txt` file with one prompt per line
   - Click "Start Run"
   - Monitor progress in real-time

3. **View & Download**
   - Go to Gallery to see generated images
   - Hover over images to see prompts
   - Download individual images or bulk ZIPs

## 📁 Project Structure

```
StickerPrint/
├── start.sh              # Single-command startup script
├── backend/              # FastAPI backend
│   ├── app/
│   │   ├── main.py      # API entry point
│   │   ├── database.py  # SQLite models
│   │   ├── routes/      # API endpoints
│   │   └── services/    # Business logic
│   └── requirements.txt
├── frontend/             # React + Vite frontend
│   ├── src/
│   │   ├── pages/       # Dashboard, Gallery, Config
│   │   └── services/    # API client, SSE
│   └── package.json
└── data/                 # SQLite DB, images, ZIPs

```

## 🛠️ Manual Startup (Alternative)

If you prefer to start services separately:

### Backend
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## 🐳 Docker Deployment

See [CROSS_PLATFORM_GUIDE.md](CROSS_PLATFORM_GUIDE.md) for Docker setup.

## 📊 API Endpoints

- `POST /api/prompts/upload` - Upload prompts file
- `POST /api/runs` - Start generation run
- `GET /api/images` - List images
- `GET /api/runs/{id}/zip` - Download run ZIP
- `GET /api/config` - Get configuration
- `PUT /api/config` - Update configuration
- `GET /api/events` - SSE event stream

Full API docs: http://localhost:8000/docs

## 🔧 Configuration

### Environment Variables
- `OPENAI_API_KEY` - Your OpenAI API key (or set via UI)

### Base Prompt (via Config UI)
Default styling applied to all prompts:
```
flat vector or doodle style with clean lines no shading or photorealism,
transparent background PNG-ready for cutting, isolated composition not
touching edges centered within canvas, bold outlines for clear cut lines,
high contrast color palette 2-4 tones, cute expressive or aesthetic shape
that looks great as a sticker, no drop shadows no textures outside the design
```

## 📝 Development

### View Logs
```bash
# Backend logs
tail -f backend.log

# Frontend logs
tail -f frontend.log
```

### Build for Production
```bash
cd frontend
npm run build
```

## 🔍 Troubleshooting

**Backend won't start:**
- Check Python version: `python3 --version` (needs 3.9+)
- Activate venv: `source backend/venv/bin/activate`

**Frontend won't start:**
- Check Node version: `node --version` (needs 18+)
- Delete node_modules: `rm -rf frontend/node_modules && cd frontend && npm install`

**Images not generating:**
- Set API key via Config page at http://localhost:3000/config
- Check backend logs: `tail -f backend.log`

**Port already in use:**
- Backend (8000): `lsof -ti:8000 | xargs kill`
- Frontend (3000): `lsof -ti:3000 | xargs kill`

## 📄 License

MIT
