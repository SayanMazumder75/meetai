# 🎙️ MeetAI Transcriber

Live meeting transcription + translation for **English, Hindi, Bengali** — completely free.

## How it works

- **Your mic** → captured via browser `getUserMedia`
- **Meeting audio (others)** → captured via `getDisplayMedia` (screen share with system audio)
- Both merged → streamed to backend via WebSocket every 3 seconds
- **faster-whisper (base model)** transcribes on CPU — no GPU, no API cost
- Hindi / Bengali → auto-translated to English by Whisper's built-in translation task
- Extractive AI summary via `sumy` (no LLM needed)

---

## Stack

| Layer | Tech | Cost |
|-------|------|------|
| Frontend | React + Vite + Tailwind | Free (Vercel) |
| Backend | FastAPI + uvicorn | Free (Render) |
| STT | faster-whisper base (~145MB) | Free (CPU) |
| Translation | Whisper translate task | Free |
| Summarization | sumy (LSA) | Free |

---

## Deploy in 3 steps

### Step 1 — Push to GitHub

```bash
git init
git add .
git commit -m "initial"
gh repo create meetai --public --push
```

### Step 2 — Deploy backend on Render (free)

1. Go to https://render.com → New → Web Service
2. Connect your GitHub repo
3. Set **Root Directory** → `backend`
4. **Build Command** → `bash build.sh`
5. **Start Command** → `uvicorn main:app --host 0.0.0.0 --port $PORT --workers 1`
6. **Instance Type** → Free
7. Add environment variables:
   - `WHISPER_MODEL` = `base`
   - `WHISPER_DEVICE` = `cpu`
   - `WHISPER_COMPUTE` = `int8`
8. Deploy — first build takes ~5 minutes (downloads Whisper model)
9. Copy your Render URL: `https://meetai-backend.onrender.com`

> ⚠ Free Render instances sleep after 15min inactivity. First request wakes them (30s delay).
> Use https://cron-job.org to ping `/health` every 10 minutes to keep it awake.

### Step 3 — Deploy frontend on Vercel (free)

1. Go to https://vercel.com → New Project → Import your repo
2. Set **Root Directory** → `frontend`
3. Add environment variable:
   - `VITE_API_URL` = `https://your-render-url.onrender.com`
4. Deploy — done in ~60 seconds

---

## Run locally

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload

# Frontend (new terminal)
cd frontend
npm install
cp .env.example .env.local
# Edit .env.local: VITE_API_URL=http://localhost:8000
npm run dev
```

Open http://localhost:5173

---

## Usage

1. Open the app in Chrome or Edge (Firefox has limited `getDisplayMedia` audio support)
2. Enter your meeting title
3. Click **▶ Start — Mic Only** for your voice only
4. OR click **🖥 Start — Mic + Screen Audio** to capture everyone in a Google Meet / Zoom call:
   - Browser asks you to share your screen
   - Pick the meeting window (or entire screen)
   - **Check "Share audio"** checkbox in the browser dialog
5. Transcript appears live every ~3-5 seconds
6. Click **✨ Generate** for AI summary, action items, key points
7. Click **⬇ Export .txt** to download the full notes

---

## Language support

| Language | Transcription | Translation to English |
|----------|---------------|----------------------|
| English  | ✅ | — |
| Hindi    | ✅ | ✅ auto |
| Bengali  | ✅ | ✅ auto |

Mixed-language speech (code-switching) is handled per-chunk by Whisper's language detection.

---

## Free tier limits

- Render free: 512MB RAM, shared CPU, sleeps after 15min idle
- Whisper base model: ~145MB, ~3-8s transcription per 3s chunk on CPU
- Max 50 concurrent sessions (in-memory, resets on restart)
- No persistent storage — sessions lost on backend restart

For production: upgrade Render to $7/month Starter, use `tiny` model for faster response.
