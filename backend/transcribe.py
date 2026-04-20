"""
Transcription module using Groq's Whisper Large-v3 API.
Much more accurate for Hindi/Marathi than local Whisper base/small models.
Language detection is constrained to English, Hindi, and Marathi.
"""

import os
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Allowed languages (ISO 639-1 codes)
# ---------------------------------------------------------------------------
ALLOWED_LANGUAGES = {"en": "english", "hi": "hindi", "mr": "marathi"}

client = Groq(api_key=os.getenv("GROQ_API_KEY"))
print("[transcribe] Using Groq Whisper Large-v3 API for transcription.")
print(f"[transcribe] Language detection restricted to: {list(ALLOWED_LANGUAGES.values())}")


def _detect_language(audio_path: str) -> str:
    """
    Detect language by running a quick transcription without forcing a language.
    Groq Whisper returns the detected language in the response.
    Falls back to 'hi' (Hindi) if detection fails or returns unsupported language.
    """
    # Reverse map: full name -> ISO code (Groq returns full names like "Hindi")
    NAME_TO_CODE = {name.lower(): code for code, name in ALLOWED_LANGUAGES.items()}
    # Also allow "urdu" -> "hi" since Urdu and Hindi are very close in speech
    NAME_TO_CODE["urdu"] = "hi"

    try:
        with open(audio_path, "rb") as audio_file:
            result = client.audio.transcriptions.create(
                file=("audio.wav", audio_file.read()),
                model="whisper-large-v3",
                response_format="verbose_json",
            )

            detected = getattr(result, "language", None)
            print(f"[transcribe] Raw detected language: {detected}")

            if detected:
                # Check if it's already an ISO code
                if detected.lower() in ALLOWED_LANGUAGES:
                    return detected.lower()
                # Check if it's a full name
                code = NAME_TO_CODE.get(detected.lower())
                if code:
                    print(f"[transcribe] Mapped '{detected}' -> '{code}'")
                    return code

            print(f"[transcribe] Language '{detected}' not in allowed set, defaulting to 'hi'")
            return "hi"

    except Exception as exc:
        print(f"[transcribe] Language detection failed: {exc}, defaulting to 'hi'")
        return "hi"


def transcribe_audio(audio_path: str) -> dict:
    """
    Transcribe an audio file using Groq's Whisper Large-v3 API.

    Language detection is restricted to English, Hindi, and Marathi.

    Args:
        audio_path: Path to 16 kHz mono WAV file.

    Returns:
        dict with keys: transcript (str), language_detected (str)
    """
    # Detect language first
    detected_lang = _detect_language(audio_path)
    print(f"[transcribe] Transcribing with language: {detected_lang} ({ALLOWED_LANGUAGES[detected_lang]})")

    # Transcribe with the detected language forced
    with open(audio_path, "rb") as audio_file:
        result = client.audio.transcriptions.create(
            file=("audio.wav", audio_file.read()),
            model="whisper-large-v3",
            language=detected_lang,
            response_format="json",
            prompt="Doctor patient conversation in a hospital. Medical terms, symptoms, medications.",
        )

    transcript = result.text.strip()
    print(f"[transcribe] Transcript: {transcript.encode('ascii', errors='replace').decode('ascii')}")

    return {
        "transcript": transcript,
        "language_detected": detected_lang,
    }
