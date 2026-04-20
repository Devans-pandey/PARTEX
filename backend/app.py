"""
Flask server for Healthcare Voice AI.
Endpoints:
  POST /transcribe  — accept audio blob, return transcript
  POST /extract     — accept transcript, return structured medical JSON
"""

import os
import uuid
import subprocess
import tempfile
from datetime import datetime, timezone

from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

import firebase_admin
from firebase_admin import credentials, db as firebase_db

load_dotenv()

# ---------------------------------------------------------------------------
# Firebase initialisation
# ---------------------------------------------------------------------------
FIREBASE_CRED_PATH = os.getenv("FIREBASE_CREDENTIALS_PATH", "serviceAccountKey.json")
FIREBASE_DB_URL = os.getenv("FIREBASE_DATABASE_URL", "")

if os.path.exists(FIREBASE_CRED_PATH) and FIREBASE_DB_URL:
    cred = credentials.Certificate(FIREBASE_CRED_PATH)
    firebase_admin.initialize_app(cred, {"databaseURL": FIREBASE_DB_URL})
    FIREBASE_ENABLED = True
    print("[app] Firebase initialized successfully.")
else:
    FIREBASE_ENABLED = False
    print("[app] WARNING: Firebase credentials not found. Database writes disabled.")

# ---------------------------------------------------------------------------
# Lazy-load heavy modules so startup logs are clear
# ---------------------------------------------------------------------------
from transcribe import transcribe_audio          # noqa: E402
from extract import extract_medical_data          # noqa: E402

# ---------------------------------------------------------------------------
# Flask app
# ---------------------------------------------------------------------------
app = Flask(__name__)
CORS(app)


def _convert_to_wav(input_path: str, output_path: str) -> bool:
    """Convert any audio file to 16 kHz mono WAV using ffmpeg."""
    try:
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", input_path,
                "-ar", "16000",
                "-ac", "1",
                "-f", "wav",
                output_path,
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return True
    except (subprocess.CalledProcessError, FileNotFoundError) as exc:
        print(f"[app] ffmpeg conversion failed: {exc}")
        return False


def _write_to_firebase(patient_id: str, visit_id: str, data: dict) -> None:
    """Write visit data to Firebase Realtime Database."""
    if not FIREBASE_ENABLED:
        print("[app] Firebase disabled — skipping write.")
        return
    ref = firebase_db.reference(f"patients/{patient_id}/visits/{visit_id}")
    ref.set(data)
    print(f"[app] Wrote visit {visit_id} for patient {patient_id} to Firebase.")


def _get_prior_patient_data(patient_id: str) -> dict | None:
    """Fetch merged patient profile from all prior visits in Firebase."""
    if not FIREBASE_ENABLED:
        return None
    try:
        ref = firebase_db.reference(f"patients/{patient_id}/visits")
        visits = ref.get()
        if not visits:
            return None

        # Sort visits by processed_at (most recent first)
        visit_list = sorted(
            visits.values(),
            key=lambda v: v.get("processed_at", ""),
            reverse=True,
        )

        # Merge: take the most recent non-null value for each field
        merged: dict = {}
        merge_fields = ["patient_name", "age", "gender", "diagnosis", "duration"]
        list_fields = ["symptoms", "medications"]

        for field in merge_fields:
            for v in visit_list:
                val = v.get(field)
                if val is not None and val != "":
                    merged[field] = val
                    break

        # For list fields: combine unique values across all visits
        for field in list_fields:
            combined = []
            for v in visit_list:
                for item in v.get(field, []):
                    if item and item not in combined:
                        combined.append(item)
            if combined:
                merged[field] = combined

        if merged:
            print(f"[app] Prior patient data for {patient_id}: {list(merged.keys())}")
            return merged
        return None
    except Exception as exc:
        print(f"[app] Failed to fetch prior data: {exc}")
        return None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/transcribe", methods=["POST"])
def transcribe_endpoint():
    """
    POST /transcribe
    Receives: multipart/form-data with field 'audio' (webm/wav blob)
    Returns:  { transcript, language_detected, chunk_id }
    """
    if "audio" not in request.files:
        return jsonify({"error": "No audio file provided"}), 400

    audio_file = request.files["audio"]
    chunk_id = str(uuid.uuid4())[:8]

    # Save uploaded blob to a temp file
    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp_in:
        audio_file.save(tmp_in)
        tmp_in_path = tmp_in.name

    # Convert to 16 kHz mono WAV
    tmp_wav_path = tmp_in_path.replace(".webm", ".wav")
    if not _convert_to_wav(tmp_in_path, tmp_wav_path):
        os.unlink(tmp_in_path)
        return jsonify({"error": "Audio conversion failed. Is ffmpeg installed?"}), 500

    # Transcribe
    result = transcribe_audio(tmp_wav_path)

    # Cleanup temp files
    for p in (tmp_in_path, tmp_wav_path):
        if os.path.exists(p):
            os.unlink(p)

    return jsonify({
        "transcript": result["transcript"],
        "language_detected": result["language_detected"],
        "chunk_id": chunk_id,
    })


@app.route("/extract", methods=["POST"])
def extract_endpoint():
    """
    POST /extract
    Receives JSON: { transcript, patient_id, chunk_id }
    Returns:  structured medical JSON + writes to Firebase
    """
    body = request.get_json(force=True)
    transcript = body.get("transcript", "")
    patient_id = body.get("patient_id", "UNKNOWN")
    chunk_id = body.get("chunk_id", str(uuid.uuid4())[:8])

    if not transcript:
        return jsonify({"error": "Empty transcript"}), 400

    # Fetch prior patient data for returning patients
    prior_data = _get_prior_patient_data(patient_id)

    # Extract structured data via Groq LLM (with prior context if available)
    extracted = extract_medical_data(transcript, prior_patient_data=prior_data)

    # Build visit record
    now = datetime.now(timezone.utc).isoformat()
    # Firebase paths cannot contain . $ # [ ] / or special chars
    safe_ts = now.replace(":", "-").replace("+", "_").replace(".", "_")
    visit_id = f"{chunk_id}_{safe_ts}"

    visit_record = {
        **extracted,
        "patient_id": patient_id,
        "visit_id": visit_id,
        "chunk_id": chunk_id,
        "raw_transcript": transcript,
        "processed_at": now,
        "extraction_status": extracted.get("extraction_status", "success"),
    }

    # Write to Firebase
    _write_to_firebase(patient_id, visit_id, visit_record)

    return jsonify(visit_record)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "firebase": FIREBASE_ENABLED})


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
