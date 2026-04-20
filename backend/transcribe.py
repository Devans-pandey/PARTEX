"""
Whisper-based transcription module.
Loads the model once at import time and exposes a transcribe function.
"""

import os
import whisper
from dotenv import load_dotenv

load_dotenv()

MODEL_SIZE = os.getenv("WHISPER_MODEL", "base")
print(f"[transcribe] Loading Whisper model: {MODEL_SIZE} ...")
model = whisper.load_model(MODEL_SIZE)
print(f"[transcribe] Whisper model '{MODEL_SIZE}' loaded successfully.")


def transcribe_audio(audio_path: str) -> dict:
    """
    Transcribe an audio file using Whisper.

    Args:
        audio_path: Path to 16 kHz mono WAV file.

    Returns:
        dict with keys: transcript (str), language_detected (str)
    """
    result = model.transcribe(
        audio_path,
        language=None,
        condition_on_previous_text=False,
    )

    transcript = result.get("text", "").strip()
    language = result.get("language", "unknown")

    return {
        "transcript": transcript,
        "language_detected": language,
    }
