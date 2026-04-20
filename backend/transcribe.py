"""
Transcription module using Sarvam Saaras v3 (primary) with Groq Whisper (fallback).

Sarvam AI is purpose-built for Indian languages (Hindi, Marathi, English, code-mixed).
Groq Whisper Large-v3 is used as a fallback if Sarvam fails.
"""

import os
from sarvamai import SarvamAI
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Allowed languages (ISO 639-1 codes)
# ---------------------------------------------------------------------------
ALLOWED_LANGUAGES = {"en": "english", "hi": "hindi", "mr": "marathi"}

# Sarvam uses BCP-47 language codes
SARVAM_LANG_MAP = {
    "hi": "hi-IN",
    "mr": "mr-IN",
    "en": "en-IN",
}

# Reverse map for Sarvam -> our codes
SARVAM_REVERSE_MAP = {v: k for k, v in SARVAM_LANG_MAP.items()}

# ---------------------------------------------------------------------------
# Clients
# ---------------------------------------------------------------------------
sarvam_client = None
groq_client = None

SARVAM_API_KEY = os.getenv("SARVAM_API_KEY", "")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

if SARVAM_API_KEY:
    sarvam_client = SarvamAI(api_subscription_key=SARVAM_API_KEY)
    print("[transcribe] Sarvam AI (Saaras v3) initialized — PRIMARY transcription engine.")
else:
    print("[transcribe] WARNING: SARVAM_API_KEY not set. Sarvam disabled.")

if GROQ_API_KEY:
    groq_client = Groq(api_key=GROQ_API_KEY)
    print("[transcribe] Groq Whisper Large-v3 initialized — FALLBACK transcription engine.")
else:
    print("[transcribe] WARNING: GROQ_API_KEY not set. Groq fallback disabled.")

print(f"[transcribe] Language detection restricted to: {list(ALLOWED_LANGUAGES.values())}")


# ---------------------------------------------------------------------------
# Sarvam transcription (primary)
# ---------------------------------------------------------------------------
def _transcribe_with_sarvam(audio_path: str) -> dict | None:
    """
    Transcribe using Sarvam Saaras v3.
    Returns dict with transcript + language, or None on failure.
    """
    if not sarvam_client:
        return None

    try:
        with open(audio_path, "rb") as audio_file:
            # Use 'transcribe' mode to get original language output
            response = sarvam_client.speech_to_text.transcribe(
                file=audio_file,
                model="saaras:v3",
                mode="formal",
            )

        transcript = ""
        language_code = "hi"  # default

        # Parse response
        if hasattr(response, "transcript"):
            transcript = response.transcript.strip()
        elif hasattr(response, "text"):
            transcript = response.text.strip()
        elif isinstance(response, dict):
            transcript = response.get("transcript", response.get("text", "")).strip()

        # Try to get language from response
        if hasattr(response, "language_code"):
            lang = response.language_code
            language_code = SARVAM_REVERSE_MAP.get(lang, lang)
        elif hasattr(response, "language"):
            lang = response.language
            if lang and lang.lower() in ALLOWED_LANGUAGES:
                language_code = lang.lower()

        # Ensure language is in allowed set
        if language_code not in ALLOWED_LANGUAGES:
            language_code = "hi"

        if transcript:
            print(f"[transcribe] Sarvam SUCCESS | lang={language_code}")
            return {
                "transcript": transcript,
                "language_detected": language_code,
                "engine": "sarvam",
            }

        print("[transcribe] Sarvam returned empty transcript, falling back to Groq.")
        return None

    except Exception as exc:
        print(f"[transcribe] Sarvam FAILED: {type(exc).__name__}: {str(exc)[:200]}")
        return None


# ---------------------------------------------------------------------------
# Groq Whisper transcription (fallback)
# ---------------------------------------------------------------------------
def _transcribe_with_groq(audio_path: str) -> dict | None:
    """
    Transcribe using Groq Whisper Large-v3 as fallback.
    Returns dict with transcript + language, or None on failure.
    """
    if not groq_client:
        return None

    # Groq language name -> ISO code mapping
    NAME_TO_CODE = {name.lower(): code for code, name in ALLOWED_LANGUAGES.items()}
    NAME_TO_CODE["urdu"] = "hi"

    try:
        # Detect language
        with open(audio_path, "rb") as audio_file:
            detect_result = groq_client.audio.transcriptions.create(
                file=("audio.wav", audio_file.read()),
                model="whisper-large-v3",
                response_format="verbose_json",
            )

        detected = getattr(detect_result, "language", None)
        language_code = "hi"

        if detected:
            lower = detected.lower()
            if lower in ALLOWED_LANGUAGES:
                language_code = lower
            elif lower in NAME_TO_CODE:
                language_code = NAME_TO_CODE[lower]

        # Transcribe with detected language
        with open(audio_path, "rb") as audio_file:
            result = groq_client.audio.transcriptions.create(
                file=("audio.wav", audio_file.read()),
                model="whisper-large-v3",
                language=language_code,
                response_format="json",
                prompt="Doctor patient conversation in a hospital.",
            )

        transcript = result.text.strip()

        if transcript:
            print(f"[transcribe] Groq Whisper SUCCESS | lang={language_code}")
            return {
                "transcript": transcript,
                "language_detected": language_code,
                "engine": "groq",
            }

        return None

    except Exception as exc:
        print(f"[transcribe] Groq Whisper FAILED: {type(exc).__name__}: {str(exc)[:200]}")
        return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def transcribe_audio(audio_path: str) -> dict:
    """
    Transcribe an audio file.

    Strategy: Sarvam Saaras v3 (primary) -> Groq Whisper Large-v3 (fallback).

    Args:
        audio_path: Path to 16 kHz mono WAV file.

    Returns:
        dict with keys: transcript (str), language_detected (str)
    """
    # Try Sarvam first (best for Indian languages)
    result = _transcribe_with_sarvam(audio_path)

    # Fallback to Groq Whisper
    if result is None:
        print("[transcribe] Falling back to Groq Whisper...")
        result = _transcribe_with_groq(audio_path)

    # If both fail
    if result is None:
        print("[transcribe] ERROR: Both Sarvam and Groq failed!")
        return {
            "transcript": "",
            "language_detected": "unknown",
        }

    return {
        "transcript": result["transcript"],
        "language_detected": result["language_detected"],
    }
