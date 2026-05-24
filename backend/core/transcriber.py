"""
transcriber.py
Wraps faster-whisper. Transcribes audio chunks (WAV bytes) and
translates Hindi / Bengali to English automatically via Whisper's
built-in translation task.
"""

import io
import logging
import tempfile
import os
import numpy as np
from faster_whisper import WhisperModel
from core.config import config

logger = logging.getLogger(__name__)

# Languages that need translation to English
TRANSLATE_LANGS = {"hi", "bn"}   # Hindi, Bengali

_model: WhisperModel | None = None


def get_model() -> WhisperModel:
    global _model
    if _model is None:
        logger.info(f"Loading Whisper model '{config.WHISPER_MODEL}' on {config.WHISPER_DEVICE} …")
        _model = WhisperModel(
            config.WHISPER_MODEL,
            device=config.WHISPER_DEVICE,
            compute_type=config.WHISPER_COMPUTE,
        )
        logger.info("Whisper model loaded.")
    return _model


def transcribe_chunk(audio_bytes: bytes, sample_rate: int = 16000) -> dict:
    """
    Accepts raw PCM float32 bytes (mono, 16kHz) OR a WAV file bytes.
    Returns:
        {
          "text": str,
          "language": str,       # detected language code
          "translated": bool,    # True if translated from non-English
          "confidence": float,
        }
    """
    if not audio_bytes or len(audio_bytes) < 1024:
        return {"text": "", "language": "en", "translated": False, "confidence": 0.0}

    model = get_model()

    # Write to temp WAV so faster-whisper can read it
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        tmp_path = f.name
        # If raw PCM, wrap in WAV header; if already WAV, write as-is
        if audio_bytes[:4] == b"RIFF":
            f.write(audio_bytes)
        else:
            f.write(_pcm_to_wav(audio_bytes, sample_rate))

    try:
        # First pass: detect language
        segments_gen, info = model.transcribe(
            tmp_path,
            task="transcribe",
            beam_size=1,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 300},
        )
        detected_lang = info.language
        segments = list(segments_gen)

        if not segments:
            return {"text": "", "language": detected_lang, "translated": False, "confidence": 0.0}

        # If Hindi or Bengali → re-run with translate task
        if detected_lang in TRANSLATE_LANGS:
            segments_gen2, _ = model.transcribe(
                tmp_path,
                task="translate",       # Whisper translates to English
                beam_size=1,
                vad_filter=True,
                vad_parameters={"min_silence_duration_ms": 300},
            )
            segments = list(segments_gen2)
            translated = True
        else:
            translated = False

        text = " ".join(s.text.strip() for s in segments).strip()
        avg_conf = float(np.mean([
            getattr(s, "avg_logprob", -0.5) for s in segments
        ])) if segments else -1.0
        # Convert log-prob to rough 0-1 confidence
        confidence = round(min(1.0, max(0.0, 1.0 + avg_conf / 5.0)), 2)

        return {
            "text": text,
            "language": detected_lang,
            "translated": translated,
            "confidence": confidence,
        }

    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


def _pcm_to_wav(pcm_bytes: bytes, sample_rate: int) -> bytes:
    """Wrap raw float32 PCM in a minimal WAV container."""
    import struct
    num_samples = len(pcm_bytes) // 4   # float32 = 4 bytes
    num_channels = 1
    bits_per_sample = 32
    byte_rate = sample_rate * num_channels * bits_per_sample // 8
    block_align = num_channels * bits_per_sample // 8
    data_size = len(pcm_bytes)
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF", 36 + data_size, b"WAVE",
        b"fmt ", 18,
        3,                  # IEEE float
        num_channels, sample_rate, byte_rate, block_align, bits_per_sample, 0,
        b"data", data_size,
    )
    return header + pcm_bytes
