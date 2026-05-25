"""
session.py — In-memory session store with concurrency safety.
"""

import uuid
import asyncio
from datetime import datetime
from dataclasses import dataclass, field, asdict
from typing import Optional
from collections import OrderedDict

from core.config import config


@dataclass
class Chunk:
    id: str
    text: str
    language: str
    translated: bool
    confidence: float
    speaker: str
    timestamp: str          # ISO string
    time_label: str         # "00:03"


@dataclass
class Session:
    session_id: str
    title: str
    started_at: datetime
    chunks: list = field(default_factory=list)
    summary: Optional[str] = None
    action_items: list = field(default_factory=list)
    key_points: list = field(default_factory=list)

    # Concurrency control
    ws_connected: bool = False
    lock: asyncio.Lock = field(default_factory=asyncio.Lock, init=False, repr=False)

    def add_chunk(self, text: str, language: str, translated: bool,
                  confidence: float, speaker: str = "Speaker") -> Chunk:
        """Synchronous chunk addition (must be called under lock)."""
        elapsed = (datetime.now() - self.started_at).seconds
        chunk = Chunk(
            id=str(uuid.uuid4())[:8],
            text=text,
            language=language,
            translated=translated,
            confidence=confidence,
            speaker=speaker,
            timestamp=datetime.now().isoformat(),
            time_label=f"{elapsed//60:02d}:{elapsed%60:02d}",
        )
        self.chunks.append(chunk)
        return chunk

    async def add_chunk_async(self, *args, **kwargs) -> Chunk:
        """Async safe wrapper that acquires the lock."""
        async with self.lock:
            return self.add_chunk(*args, **kwargs)

    async def get_chunks_copy(self) -> list:
        """Return a shallow copy of chunks under the lock."""
        async with self.lock:
            return self.chunks.copy()

    def to_dict(self) -> dict:
        """Return a dict representation (caller should handle concurrency if needed)."""
        return {
            "session_id": self.session_id,
            "title": self.title,
            "started_at": self.started_at.isoformat(),
            "chunks": [asdict(c) for c in self.chunks],
            "summary": self.summary,
            "action_items": self.action_items,
            "key_points": self.key_points,
        }

    def export_text(self) -> str:
        """Sync export – use only after copying chunks externally."""
        lines = [f"# {self.title}", f"Started: {self.started_at.strftime('%d %b %Y %H:%M')}", ""]
        for c in self.chunks:
            flag = " [translated]" if c.translated else ""
            lines.append(f"[{c.time_label}] {c.speaker}: {c.text}{flag}")
        if self.summary:
            lines += ["", "## Summary", self.summary]
        if self.action_items:
            lines += ["", "## Action Items"]
            lines += [f"- {a}" for a in self.action_items]
        if self.key_points:
            lines += ["", "## Key Points"]
            lines += [f"- {k}" for k in self.key_points]
        return "\n".join(lines)


class SessionStore:
    """Thread-safe in-memory store. Evicts oldest when full.
       All public methods are async and acquire a global lock for consistency.
    """

    def __init__(self):
        self._sessions: OrderedDict[str, Session] = OrderedDict()
        self._global_lock = asyncio.Lock()

    async def create(self, title: str = "") -> Session:
        async with self._global_lock:
            if len(self._sessions) >= config.MAX_SESSIONS:
                self._sessions.popitem(last=False)   # evict oldest
            sid = str(uuid.uuid4())
            sess = Session(
                session_id=sid,
                title=title or f"Meeting {datetime.now().strftime('%d %b %Y %H:%M')}",
                started_at=datetime.now(),
            )
            self._sessions[sid] = sess
            return sess

    async def get(self, session_id: str) -> Optional[Session]:
        async with self._global_lock:
            return self._sessions.get(session_id)

    async def delete(self, session_id: str):
        async with self._global_lock:
            self._sessions.pop(session_id, None)

    async def list_all(self) -> list:
        async with self._global_lock:
            return [
                {
                    "session_id": s.session_id,
                    "title": s.title,
                    "started_at": s.started_at.isoformat(),
                    "chunk_count": len(s.chunks),
                }
                for s in reversed(list(self._sessions.values()))
            ]


# Singleton
store = SessionStore()