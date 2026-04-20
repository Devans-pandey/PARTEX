"""
Flask server for Healthcare Voice AI.
Endpoints:
  POST /transcribe         — accept audio blob, return transcript
  POST /extract            — accept transcript, return structured medical JSON (problem-based)
  GET  /patients/<id>/problems         — list all problems for a patient
  GET  /patients/<id>/problems/<pid>/transcript — get saved transcript for a problem
  POST /chatbot            — answer questions about patient history
  POST /migrate            — migrate old visits/ schema to problems/ schema
  GET  /health             — health check
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
from extract import extract_medical_data, detect_speakers  # noqa: E402
from chatbot import answer_patient_query, generate_realtime_assist  # noqa: E402
from rag import index_patient_visit, reindex_patient_from_firebase, get_index_stats  # noqa: E402

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


def _get_patient_data(patient_id: str) -> dict | None:
    """Fetch full patient record from Firebase."""
    if not FIREBASE_ENABLED:
        return None
    try:
        ref = firebase_db.reference(f"patients/{patient_id}")
        return ref.get()
    except Exception as exc:
        print(f"[app] Failed to fetch patient data: {exc}")
        return None


def _get_prior_patient_data(patient_id: str) -> dict | None:
    """Fetch merged patient profile from all prior visits/problems in Firebase."""
    if not FIREBASE_ENABLED:
        return None
    try:
        patient_data = _get_patient_data(patient_id)
        if not patient_data:
            return None

        # Collect all extracted data from problems (new schema)
        all_extracted = []
        problems = patient_data.get("problems", {})
        for prob_data in problems.values():
            for visit in (prob_data.get("visits", {}) or {}).values():
                ext = visit.get("extracted", {})
                if ext:
                    ext["processed_at"] = visit.get("processed_at", "")
                    all_extracted.append(ext)

        # Also collect from legacy visits (old schema)
        legacy_visits = patient_data.get("visits", {})
        if legacy_visits:
            for v in legacy_visits.values():
                all_extracted.append(v)

        if not all_extracted:
            return None

        # Sort by processed_at (most recent first)
        all_extracted.sort(
            key=lambda v: v.get("processed_at", ""),
            reverse=True,
        )

        # Merge: take the most recent non-null value for each field
        merged: dict = {}
        merge_fields = ["patient_name", "age", "gender", "diagnosis", "duration"]
        list_fields = ["symptoms", "medications"]

        for field in merge_fields:
            for v in all_extracted:
                val = v.get(field)
                if val is not None and val != "":
                    merged[field] = val
                    break

        # For list fields: combine unique values across all visits
        for field in list_fields:
            combined = []
            for v in all_extracted:
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

    # Auto-detect speakers from the raw transcript
    speakers = []
    if result["transcript"].strip():
        speakers = detect_speakers(result["transcript"])

    return jsonify({
        "transcript": result["transcript"],
        "language_detected": result["language_detected"],
        "chunk_id": chunk_id,
        "speakers": speakers,
    })


@app.route("/extract", methods=["POST"])
def extract_endpoint():
    """
    POST /extract
    Receives JSON: { transcript, patient_id, problem_id?, chunk_id, turns? }
    Returns:  structured medical JSON + writes to Firebase under problems/
    """
    body = request.get_json(force=True)
    transcript = body.get("transcript", "")
    patient_id = body.get("patient_id", "UNKNOWN")
    problem_id = body.get("problem_id", "")  # if empty, create new problem
    chunk_id = body.get("chunk_id", str(uuid.uuid4())[:8])
    turns = body.get("turns", [])  # conversation turns array

    if not transcript:
        return jsonify({"error": "Empty transcript"}), 400

    # Fetch prior patient data for returning patients
    prior_data = _get_prior_patient_data(patient_id)

    # Extract structured data via Groq LLM (with prior context if available)
    extracted = extract_medical_data(transcript, prior_patient_data=prior_data)

    # Build visit record
    now = datetime.now(timezone.utc).isoformat()
    safe_ts = now.replace(":", "-").replace("+", "_").replace(".", "_")
    visit_id = f"{chunk_id}_{safe_ts}"

    # If no problem_id provided, create a new one
    if not problem_id:
        problem_id = f"prob_{str(uuid.uuid4())[:8]}"

    problem_label = extracted.get("problem_label", "General Consultation")

    visit_record = {
        "visit_id": visit_id,
        "chunk_id": chunk_id,
        "raw_transcript": transcript,
        "turns": turns,
        "extracted": extracted,
        "processed_at": now,
        "extraction_status": extracted.get("extraction_status", "success"),
    }

    # Write to Firebase under new schema: patients/{id}/problems/{problem_id}/
    if FIREBASE_ENABLED:
        try:
            # Write/update problem metadata
            prob_ref = firebase_db.reference(f"patients/{patient_id}/problems/{problem_id}")
            prob_meta = prob_ref.get() or {}

            if not prob_meta.get("created_at"):
                # New problem
                prob_ref.update({
                    "label": problem_label,
                    "created_at": now,
                    "status": "active",
                })
            else:
                # Update label if we got a better one
                if problem_label != "General Consultation":
                    prob_ref.update({"label": problem_label})

            # Write visit under problem
            visit_ref = firebase_db.reference(
                f"patients/{patient_id}/problems/{problem_id}/visits/{visit_id}"
            )
            visit_ref.set(visit_record)
            print(f"[app] Wrote visit {visit_id} for patient {patient_id}, problem {problem_id}")

            # Index into RAG vector store
            index_patient_visit(
                patient_id=patient_id,
                problem_id=problem_id,
                visit_id=visit_id,
                transcript=transcript,
                extracted=extracted,
                problem_label=problem_label,
            )

        except Exception as exc:
            print(f"[app] Firebase write failed: {exc}")

    # Return full response
    return jsonify({
        **extracted,
        "patient_id": patient_id,
        "problem_id": problem_id,
        "problem_label": problem_label,
        "visit_id": visit_id,
        "chunk_id": chunk_id,
        "raw_transcript": transcript,
        "turns": turns,
        "processed_at": now,
        "extraction_status": extracted.get("extraction_status", "success"),
    })


@app.route("/patients/<patient_id>/problems", methods=["GET"])
def get_patient_problems(patient_id: str):
    """
    GET /patients/<patient_id>/problems
    Returns list of problems for a patient with visit counts.
    """
    if not FIREBASE_ENABLED:
        return jsonify({"problems": []}), 200

    try:
        ref = firebase_db.reference(f"patients/{patient_id}/problems")
        problems_data = ref.get()

        if not problems_data:
            return jsonify({"problems": []}), 200

        problems = []
        for prob_id, prob_data in problems_data.items():
            visits = prob_data.get("visits", {}) or {}
            visit_count = len(visits)

            # Get latest visit info
            latest_visit = None
            if visits:
                visit_list = sorted(
                    visits.values(),
                    key=lambda v: v.get("processed_at", ""),
                    reverse=True,
                )
                latest_visit = visit_list[0]

            latest_extracted = {}
            if latest_visit:
                latest_extracted = latest_visit.get("extracted", {})

            problems.append({
                "problem_id": prob_id,
                "label": prob_data.get("label", "Unknown"),
                "created_at": prob_data.get("created_at", ""),
                "status": prob_data.get("status", "active"),
                "visit_count": visit_count,
                "last_visit_date": latest_visit.get("processed_at", "") if latest_visit else "",
                "last_urgency": latest_extracted.get("urgency", None),
                "last_symptoms": latest_extracted.get("symptoms", []),
                "last_diagnosis": latest_extracted.get("diagnosis", None),
            })

        # Sort by last visit date (most recent first)
        problems.sort(
            key=lambda p: p.get("last_visit_date", ""),
            reverse=True,
        )

        return jsonify({"problems": problems}), 200

    except Exception as exc:
        print(f"[app] Failed to fetch problems: {exc}")
        return jsonify({"error": str(exc)}), 500


@app.route("/patients/<patient_id>/problems/<problem_id>/transcript", methods=["GET"])
def get_problem_transcript(patient_id: str, problem_id: str):
    """
    GET /patients/<patient_id>/problems/<problem_id>/transcript
    Returns all visits and transcripts for a specific problem.
    """
    if not FIREBASE_ENABLED:
        return jsonify({"visits": []}), 200

    try:
        ref = firebase_db.reference(
            f"patients/{patient_id}/problems/{problem_id}/visits"
        )
        visits_data = ref.get()

        if not visits_data:
            return jsonify({"visits": []}), 200

        visits = []
        for visit_id, visit in visits_data.items():
            visits.append({
                "visit_id": visit_id,
                "raw_transcript": visit.get("raw_transcript", ""),
                "turns": visit.get("turns", []),
                "extracted": visit.get("extracted", {}),
                "processed_at": visit.get("processed_at", ""),
            })

        # Sort newest first
        visits.sort(
            key=lambda v: v.get("processed_at", ""),
            reverse=True,
        )

        return jsonify({"visits": visits}), 200

    except Exception as exc:
        print(f"[app] Failed to fetch transcript: {exc}")
        return jsonify({"error": str(exc)}), 500


@app.route("/chatbot", methods=["POST"])
def chatbot_endpoint():
    """
    POST /chatbot
    Receives JSON: { patient_id, question }
    Returns: { answer }
    """
    body = request.get_json(force=True)
    patient_id = body.get("patient_id", "")
    question = body.get("question", "")

    if not patient_id:
        return jsonify({"error": "patient_id is required"}), 400
    if not question:
        return jsonify({"error": "question is required"}), 400

    # Fetch full patient data from Firebase
    patient_data = _get_patient_data(patient_id)

    if not patient_data:
        return jsonify({
            "answer": "No medical records found for this patient. Please record a consultation first."
        }), 200

    # Get AI answer
    answer = answer_patient_query(patient_data, question, patient_id=patient_id)

    return jsonify({"answer": answer}), 200


@app.route("/assist", methods=["POST"])
def assist_endpoint():
    """
    POST /assist
    Receives JSON: { patient_id, turns, problem_id?, problem_label? }
    Returns: { medication_suggestions, counter_questions, rationale, caution }
    """
    body = request.get_json(force=True)
    patient_id = body.get("patient_id", "")
    turns = body.get("turns", [])
    problem_label = body.get("problem_label", "")

    if not patient_id:
        return jsonify({"error": "patient_id is required"}), 400
    if not isinstance(turns, list):
        return jsonify({"error": "turns must be an array"}), 400

    patient_data = _get_patient_data(patient_id)
    assist = generate_realtime_assist(
        patient_data=patient_data,
        turns=turns,
        problem_label=problem_label,
    )
    return jsonify(assist), 200


@app.route("/migrate", methods=["POST"])
def migrate_endpoint():
    """
    POST /migrate
    One-time migration: move old patients/{id}/visits/ to patients/{id}/problems/default/visits/
    """
    if not FIREBASE_ENABLED:
        return jsonify({"error": "Firebase not enabled"}), 500

    try:
        patients_ref = firebase_db.reference("patients")
        all_patients = patients_ref.get()

        if not all_patients:
            return jsonify({"message": "No patients to migrate"}), 200

        migrated = 0
        for patient_id, patient_data in all_patients.items():
            old_visits = patient_data.get("visits", {})
            has_problems = bool(patient_data.get("problems"))

            if old_visits and not has_problems:
                # Create a default problem from the old visits
                now = datetime.now(timezone.utc).isoformat()

                # Try to determine a label from the most recent visit
                visit_list = sorted(
                    old_visits.values(),
                    key=lambda v: v.get("processed_at", ""),
                    reverse=True,
                )
                label = "General Consultation"
                for v in visit_list:
                    if v.get("diagnosis"):
                        label = v["diagnosis"][:30]
                        break
                    if v.get("symptoms") and len(v["symptoms"]) > 0:
                        label = v["symptoms"][0].title()
                        break

                default_problem_id = "prob_migrated"

                # Write problem metadata
                prob_ref = firebase_db.reference(
                    f"patients/{patient_id}/problems/{default_problem_id}"
                )
                prob_ref.set({
                    "label": label,
                    "created_at": visit_list[-1].get("processed_at", now) if visit_list else now,
                    "status": "active",
                })

                # Move each visit under the problem (convert to new format)
                for visit_id, visit_data in old_visits.items():
                    new_visit = {
                        "visit_id": visit_id,
                        "chunk_id": visit_data.get("chunk_id", ""),
                        "raw_transcript": visit_data.get("raw_transcript", ""),
                        "turns": [],
                        "extracted": {
                            "patient_name": visit_data.get("patient_name"),
                            "age": visit_data.get("age"),
                            "gender": visit_data.get("gender"),
                            "symptoms": visit_data.get("symptoms", []),
                            "duration": visit_data.get("duration"),
                            "diagnosis": visit_data.get("diagnosis"),
                            "medications": visit_data.get("medications", []),
                            "urgency": visit_data.get("urgency", "low"),
                            "extraction_confidence": visit_data.get("extraction_confidence", "medium"),
                            "additional_notes": visit_data.get("additional_notes"),
                            "problem_label": label,
                        },
                        "processed_at": visit_data.get("processed_at", now),
                        "extraction_status": visit_data.get("extraction_status", "success"),
                    }
                    visit_ref = firebase_db.reference(
                        f"patients/{patient_id}/problems/{default_problem_id}/visits/{visit_id}"
                    )
                    visit_ref.set(new_visit)

                migrated += 1
                print(f"[app] Migrated patient {patient_id} ({len(old_visits)} visits -> problem '{label}')")

        return jsonify({
            "message": f"Migration complete. {migrated} patient(s) migrated.",
            "migrated_count": migrated,
        }), 200

    except Exception as exc:
        print(f"[app] Migration failed: {exc}")
        return jsonify({"error": str(exc)}), 500


@app.route("/reindex", methods=["POST"])
def reindex_endpoint():
    """
    POST /reindex
    Rebuild RAG vector index from all patient data in Firebase.
    Optional JSON body: { "patient_id": "PT-1234" } to reindex a single patient.
    """
    if not FIREBASE_ENABLED:
        return jsonify({"error": "Firebase not enabled"}), 500

    body = request.get_json(force=True) if request.data else {}
    target_patient = body.get("patient_id", "")

    try:
        if target_patient:
            # Reindex single patient
            patient_data = _get_patient_data(target_patient)
            if not patient_data:
                return jsonify({"error": f"Patient {target_patient} not found"}), 404
            count = reindex_patient_from_firebase(target_patient, patient_data)
            return jsonify({
                "message": f"Reindexed patient {target_patient}",
                "chunks_indexed": count,
            }), 200
        else:
            # Reindex all patients
            patients_ref = firebase_db.reference("patients")
            all_patients = patients_ref.get()
            if not all_patients:
                return jsonify({"message": "No patients to reindex"}), 200

            total = 0
            for pid, pdata in all_patients.items():
                total += reindex_patient_from_firebase(pid, pdata)

            return jsonify({
                "message": f"Reindexed all patients",
                "patients_count": len(all_patients),
                "chunks_indexed": total,
            }), 200

    except Exception as exc:
        print(f"[app] Reindex failed: {exc}")
        return jsonify({"error": str(exc)}), 500


@app.route("/health", methods=["GET"])
def health():
    rag_stats = get_index_stats()
    return jsonify({"status": "ok", "firebase": FIREBASE_ENABLED, "rag": rag_stats})


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
