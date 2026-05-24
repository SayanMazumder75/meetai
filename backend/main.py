"""
main.py — FastAPI backend for MeetAI Transcriber
"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse

from core.config import config
from core.session import store
from core.transcriber import transcribe_chunk, get_model
from core.summarizer import summarize

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Warm up Whisper model at startup so first request isn't slow
    logger.info("Warming up Whisper model…")
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, get_model)
    logger.info("Ready.")
    yield


app = FastAPI(title=config.APP_NAME, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── REST endpoints ────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "model": config.WHISPER_MODEL}


@app.post("/sessions")
async def create_session(body: dict = {}):
    title = body.get("title", "")
    sess  = store.create(title)
    return {"session_id": sess.session_id, "title": sess.title, "started_at": sess.started_at.isoformat()}


@app.get("/sessions")
async def list_sessions():
    return store.list_all()


@app.get("/sessions/{session_id}")
async def get_session(session_id: str):
    sess = store.get(session_id)
    if not sess:
        raise HTTPException(404, "Session not found")
    return sess.to_dict()


@app.post("/sessions/{session_id}/summarize")
async def summarize_session(session_id: str):
    sess = store.get(session_id)
    if not sess:
        raise HTTPException(404, "Session not found")
    if len(sess.chunks) == 0:
        raise HTTPException(400, "No transcript yet")

    loop   = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, summarize, sess.chunks)

    sess.summary      = result["summary"]
    sess.action_items = result["action_items"]
    sess.key_points   = result["key_points"]
    return result


@app.get("/sessions/{session_id}/export")
async def export_session(session_id: str):
    sess = store.get(session_id)
    if not sess:
        raise HTTPException(404, "Session not found")
    return PlainTextResponse(
        content=sess.export_text(),
        media_type="text/plain",
        headers={"Content-Disposition": f'attachment; filename="{session_id}.txt"'},
    )


@app.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    store.delete(session_id)
    return {"deleted": session_id}


# ─── WebSocket — live transcription ───────────────────────────────────────────

@app.websocket("/ws/{session_id}")
async def ws_transcribe(websocket: WebSocket, session_id: str):
    """
    Protocol (binary frames):
      Client → Server : raw audio bytes (PCM float32 mono 16kHz OR WAV)
      Server → Client : JSON string with transcription result

    JSON result shape:
      {
        "type": "chunk",
        "chunk": { id, text, language, translated, confidence, speaker, timestamp, time_label },
        "session_id": str
      }
    or
      { "type": "error", "message": str }
    """
    sess = store.get(session_id)
    if not sess:
        await websocket.close(code=4004, reason="Session not found")
        return

    await websocket.accept()
    logger.info(f"WS connected: {session_id}")

    loop = asyncio.get_event_loop()

    try:
        while True:
            # Receive audio chunk (binary)
            data = await websocket.receive_bytes()

            if not data:
                continue

            # Run transcription in thread pool (CPU-bound)
            try:
                result = await loop.run_in_executor(
                    None, transcribe_chunk, data, 16000
                )
            except Exception as e:
                logger.exception("Transcription error")
                await websocket.send_json({"type": "error", "message": str(e)})
                continue

            text = result.get("text", "").strip()
            if not text:
                # Send heartbeat so client knows we're alive
                await websocket.send_json({"type": "heartbeat"})
                continue

            chunk = sess.add_chunk(
                text=text,
                language=result["language"],
                translated=result["translated"],
                confidence=result["confidence"],
                speaker="You",
            )

            await websocket.send_json({
                "type": "chunk",
                "chunk": {
                    "id": chunk.id,
                    "text": chunk.text,
                    "language": chunk.language,
                    "translated": chunk.translated,
                    "confidence": chunk.confidence,
                    "speaker": chunk.speaker,
                    "timestamp": chunk.timestamp,
                    "time_label": chunk.time_label,
                },
                "session_id": session_id,
            })

    except WebSocketDisconnect:
        logger.info(f"WS disconnected: {session_id}")
    except Exception as e:
        logger.exception(f"WS error: {session_id}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
