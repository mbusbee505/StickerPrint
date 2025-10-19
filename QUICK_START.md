# Quick Start Guide

## Start the App (Two Terminals)

### Terminal 1: Backend
```bash
./start_backend.sh
```
✅ Backend running on http://localhost:8000

### Terminal 2: Frontend
```bash
./start_frontend.sh
```
✅ Frontend running on http://localhost:3000

## First Time Setup

### 1. Configure API Key
1. Open http://localhost:3000
2. Click **Config** in nav
3. Enter your OpenAI API key
4. Click **Save**

### 2. Upload Prompts
1. Click **Dashboard** in nav
2. Click **Choose File**
3. Select your `.txt` file (one prompt per line)
4. Click **Start Run**

### 3. View Results
1. Click **Gallery** in nav
2. Watch images appear in real-time
3. Hover over images to see prompts
4. Click **Download ZIP (Latest)** for bulk download

## URLs

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

## File Locations

- **Database**: `data/app.db`
- **Prompts**: `data/prompts/`
- **Images**: `data/images/{run_id}/`
- **ZIPs**: `data/zips/`

## Common Commands

### Stop Servers
```bash
# Ctrl+C in each terminal
```

### Reset Database
```bash
rm data/app.db
# Restart backend - DB will recreate
```

### View Logs
```bash
# Backend logs appear in terminal 1
# Frontend logs in terminal 2 and browser console
```

### Install Dependencies
```bash
# Backend
cd backend
source venv/bin/activate
pip install -r requirements.txt

# Frontend
cd frontend
npm install
```

## Troubleshooting

### Backend won't start
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Frontend won't start
```bash
cd frontend
rm -rf node_modules
npm install
```

### Images not generating
- Check API key in Config page
- View backend terminal for errors
- Verify OpenAI account has credits

### Live updates not working
- Check browser console for errors
- Verify backend is running
- Refresh the page

## Quick Tips

✅ **Old CLI still works**: `python3 stickerprint.py -f prompts.txt`

✅ **Config changes apply immediately**: No restart needed

✅ **ZIPs auto-build**: Created when run finishes

✅ **Gallery live-updates**: Images appear as generated

✅ **Dark mode**: Automatically follows system preference

✅ **Mobile friendly**: Works on phones and tablets

## Next Steps

📖 Full documentation: [README_WEBAPP.md](README_WEBAPP.md)

📖 Migration guide: [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md)

📖 Architecture details: [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)
