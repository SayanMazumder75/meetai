# main.py – corrected (async store, ws_connected guard)
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

from core.config import config
from core.session import store
from core.transcriber import transcribe_chunk, get_model
from core.summarizer import summarize

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
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


@app.get("/health")
async def health():
    return {"status": "ok", "model": config.WHISPER_MODEL}


@app.post("/sessions")
async def create_session(body: dict = {}):
    title = body.get("title", "")
    sess = await store.create(title)          # ✅ await
    return {"session_id": sess.session_id, "title": sess.title, "started_at": sess.started_at.isoformat()}


@app.get("/sessions/{session_id}")
async def get_session(session_id: str):
    sess = await store.get(session_id)        # ✅ await
    if not sess:
        raise HTTPException(404, "Session not found")
    async with sess.lock:
        return sess.to_dict()


@app.post("/sessions/{session_id}/summarize")
async def summarize_session(session_id: str):
    sess = await store.get(session_id)
    if not sess:
        raise HTTPException(404, "Session not found")
    chunks_copy = await sess.get_chunks_copy()
    if not chunks_copy:
        raise HTTPException(400, "No transcript yet")
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, summarize, chunks_copy)
    async with sess.lock:
        sess.summary = result["summary"]
        sess.action_items = result["action_items"]
        sess.key_points = result["key_points"]
    return result


@app.get("/sessions/{session_id}/export")
async def export_session(session_id: str):
    sess = await store.get(session_id)
    if not sess:
        raise HTTPException(404, "Session not found")
    chunks_copy = await sess.get_chunks_copy()
    async with sess.lock:
        original_chunks = sess.chunks
        sess.chunks = chunks_copy
        text = sess.export_text()
        sess.chunks = original_chunks
    return PlainTextResponse(
        content=text,
        media_type="text/plain",
        headers={"Content-Disposition": f'attachment; filename="{session_id}.txt"'},
    )


@app.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    await store.delete(session_id)
    return {"deleted": session_id}


@app.websocket("/ws/{session_id}")
async def ws_transcribe(websocket: WebSocket, session_id: str):
    sess = await store.get(session_id)
    if not sess:
        await websocket.close(code=4004, reason="Session not found")
        return

    async with sess.lock:
        if sess.ws_connected:
            await websocket.close(code=4000, reason="Session already active")
            return
        sess.ws_connected = True

    await websocket.accept()
    logger.info(f"WS connected: {session_id}")
    loop = asyncio.get_event_loop()

    try:
        while True:
            data = await websocket.receive_bytes()
            if not data:
                continue
            try:
                result = await loop.run_in_executor(None, transcribe_chunk, data, 16000)
            except Exception as e:
                logger.exception("Transcription error")
                await websocket.send_json({"type": "error", "message": str(e)})
                continue

            text = result.get("text", "").strip()
            if not text:
                await websocket.send_json({"type": "heartbeat"})
                continue

            async with sess.lock:
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
    finally:
        async with sess.lock:
            sess.ws_connected = False