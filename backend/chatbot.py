"""
Patient history chatbot module.
Uses Groq LLM to answer questions about a patient's medical history
by aggregating data from all their problems and visits in Firebase.
"""

import os
import json
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

CHATBOT_SYSTEM = """You are a helpful medical assistant for Indian hospital OPDs. 
You have access to a patient's complete medical history from their electronic health records.
Answer questions clearly and concisely in English.
If the data doesn't contain the answer, say so honestly.
Do NOT make up medical information. Only report what is in the records.
Format your responses in a readable way with bullet points when listing multiple items."""

CHATBOT_PROMPT = """Based on the following patient medical history, answer the user's question.

PATIENT HISTORY:
{patient_history}

USER QUESTION: {question}

Answer based ONLY on the patient history data provided above. Be specific and reference dates/visits when possible."""

REALTIME_ASSIST_SYSTEM = """You are a consultation co-pilot for doctors in an Indian OPD.
Your role is to provide safe, concise, and practical support during a live consultation.
Output STRICT JSON only with keys:
- medication_suggestions: string[]
- counter_questions: string[]
- rationale: string
- caution: string

Rules:
- Suggest only broad medication classes/examples, not definitive prescriptions.
- If insufficient data, return empty medication_suggestions and ask focused counter_questions.
- Keep arrays short: max 5 items each.
- Never fabricate patient facts not in provided context.
- Include a brief safety caveat in caution."""

REALTIME_ASSIST_PROMPT = """Generate live doctor support from this context.

PATIENT HISTORY:
{patient_history}

CURRENT PROBLEM LABEL:
{problem_label}

LIVE CONSULTATION TURNS (latest at bottom):
{turns_text}

Return JSON only with the required keys."""


def _build_patient_history_text(patient_data: dict) -> str:
    """
    Build a readable text summary of all problems and visits for context.
    
    Args:
        patient_data: Full patient record from Firebase (problems/visits tree).
    
    Returns:
        Formatted string with all patient history.
    """
    if not patient_data:
        return "No medical history available for this patient."

    lines = []
    
    # Check for problems (new schema)
    problems = patient_data.get("problems", {})
    if problems:
        for prob_id, prob_data in problems.items():
            label = prob_data.get("label", "Unknown Problem")
            status = prob_data.get("status", "unknown")
            created = prob_data.get("created_at", "unknown date")
            lines.append(f"\n--- Problem: {label} (Status: {status}, Since: {created}) ---")

            visits = prob_data.get("visits", {})
            if visits:
                # Sort visits by processed_at
                visit_list = sorted(
                    visits.values(),
                    key=lambda v: v.get("processed_at", ""),
                    reverse=True,
                )
                for visit in visit_list:
                    date = visit.get("processed_at", "unknown date")
                    extracted = visit.get("extracted", {})
                    lines.append(f"  Visit on {date}:")
                    
                    if extracted.get("symptoms"):
                        lines.append(f"    Symptoms: {', '.join(extracted['symptoms'])}")
                    if extracted.get("diagnosis"):
                        lines.append(f"    Diagnosis: {extracted['diagnosis']}")
                    if extracted.get("medications"):
                        lines.append(f"    Medications: {', '.join(extracted['medications'])}")
                    if extracted.get("duration"):
                        lines.append(f"    Duration: {extracted['duration']}")
                    if extracted.get("urgency"):
                        lines.append(f"    Urgency: {extracted['urgency']}")
                    if extracted.get("additional_notes"):
                        lines.append(f"    Notes: {extracted['additional_notes']}")

    # Also check for legacy visits (old schema)
    legacy_visits = patient_data.get("visits", {})
    if legacy_visits:
        lines.append("\n--- Legacy Visit Records ---")
        visit_list = sorted(
            legacy_visits.values(),
            key=lambda v: v.get("processed_at", ""),
            reverse=True,
        )
        for visit in visit_list:
            date = visit.get("processed_at", "unknown date")
            lines.append(f"  Visit on {date}:")
            if visit.get("symptoms"):
                lines.append(f"    Symptoms: {', '.join(visit['symptoms'])}")
            if visit.get("diagnosis"):
                lines.append(f"    Diagnosis: {visit['diagnosis']}")
            if visit.get("medications"):
                lines.append(f"    Medications: {', '.join(visit['medications'])}")
            if visit.get("duration"):
                lines.append(f"    Duration: {visit['duration']}")
            if visit.get("urgency"):
                lines.append(f"    Urgency: {visit['urgency']}")
            if visit.get("additional_notes"):
                lines.append(f"    Notes: {visit['additional_notes']}")

    if not lines:
        return "No medical history available for this patient."

    # Add patient demographics from most recent data
    name = None
    age = None
    gender = None
    
    # Try to get demographics from problems first
    for prob_data in problems.values():
        for visit in (prob_data.get("visits", {}) or {}).values():
            ext = visit.get("extracted", {})
            if not name and ext.get("patient_name"):
                name = ext["patient_name"]
            if not age and ext.get("age"):
                age = ext["age"]
            if not gender and ext.get("gender"):
                gender = ext["gender"]

    # Then from legacy visits
    for visit in legacy_visits.values():
        if not name and visit.get("patient_name"):
            name = visit["patient_name"]
        if not age and visit.get("age"):
            age = visit["age"]
        if not gender and visit.get("gender"):
            gender = visit["gender"]

    header = f"Patient: {name or 'Unknown'}"
    if age:
        header += f", Age: {age}"
    if gender:
        header += f", Gender: {gender}"

    return header + "\n" + "\n".join(lines)


def answer_patient_query(patient_data: dict, question: str) -> str:
    """
    Answer a question about a patient's medical history using Groq LLM.

    Args:
        patient_data: Full patient record from Firebase.
        question: User's question about the patient.

    Returns:
        String answer from the LLM.
    """
    history_text = _build_patient_history_text(patient_data)

    prompt = CHATBOT_PROMPT.format(
        patient_history=history_text,
        question=question,
    )

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": CHATBOT_SYSTEM},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=600,
        )

        return response.choices[0].message.content.strip()

    except Exception as exc:
        print(f"[chatbot] LLM call failed: {exc}")
        return f"Sorry, I encountered an error while processing your question. Please try again. Error: {str(exc)}"


def _extract_json_object(text: str) -> dict | None:
    """Extract JSON object from raw model text."""
    if not text:
        return None

    cleaned = text.strip()
    try:
        return json.loads(cleaned)
    except Exception:
        pass

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None

    snippet = cleaned[start:end + 1]
    try:
        return json.loads(snippet)
    except Exception:
        return None


def generate_realtime_assist(
    patient_data: dict | None,
    turns: list[dict],
    problem_label: str | None = None,
) -> dict:
    """
    Generate real-time medication ideas and counter-questions for doctor.
    """
    history_text = _build_patient_history_text(patient_data or {})

    turns_text_parts = []
    for t in turns[-12:]:
        speaker = (t.get("speaker") or "patient").upper()
        text = t.get("text") or t.get("transcript") or ""
        if text:
            turns_text_parts.append(f"{speaker}: {text}")

    turns_text = "\n".join(turns_text_parts) or "No conversation turns yet."

    prompt = REALTIME_ASSIST_PROMPT.format(
        patient_history=history_text,
        problem_label=problem_label or "General Consultation",
        turns_text=turns_text,
    )

    fallback = {
        "medication_suggestions": [],
        "counter_questions": [
            "What is the exact duration and progression of symptoms?",
            "Any red-flag signs, allergies, or current medicines?",
        ],
        "rationale": "Insufficient context for confident medication suggestions yet.",
        "caution": "Use clinical judgment and local guidelines before prescribing.",
    }

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": REALTIME_ASSIST_SYSTEM},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
            max_tokens=500,
        )

        content = (response.choices[0].message.content or "").strip()
        parsed = _extract_json_object(content)
        if not isinstance(parsed, dict):
            return fallback

        meds = parsed.get("medication_suggestions", [])
        questions = parsed.get("counter_questions", [])
        rationale = parsed.get("rationale") or fallback["rationale"]
        caution = parsed.get("caution") or fallback["caution"]

        if not isinstance(meds, list):
            meds = []
        if not isinstance(questions, list):
            questions = []

        return {
            "medication_suggestions": [str(m).strip() for m in meds if str(m).strip()][:5],
            "counter_questions": [str(q).strip() for q in questions if str(q).strip()][:5],
            "rationale": str(rationale).strip(),
            "caution": str(caution).strip(),
        }

    except Exception as exc:
        print(f"[chatbot] realtime assist failed: {exc}")
        return fallback
