"""
Groq LLM extraction module.
Calls llama-3.3-70b-versatile to extract structured medical data from transcripts.
"""

import os
import json
import re
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

SYSTEM_PROMPT = "You are a clinical data extraction engine for Indian hospitals."

USER_PROMPT_TEMPLATE = """Extract structured medical information from the following doctor-patient conversation transcript. The conversation may be in Hindi, Marathi, English, Hinglish, or a mix.

RULES:
- Return ONLY a valid JSON object. No markdown, no explanation, no text before or after.
- Normalize ALL symptom and medication names to standard English medical terms.
- If a field is not clearly and explicitly stated, return null. Do not guess or infer.
- For urgency: "high" = chest pain, breathing difficulty, loss of consciousness, severe bleeding. "medium" = fever >3 days, persistent vomiting, moderate pain. "low" = everything else.
- Paracetamol and Pantoprazole are different medications. Identify drug names carefully.
- "wahan dard hai" or "wo wali tablet" are ambiguous — return null for those fields.

OUTPUT SCHEMA (return exactly these fields):
{{
  "patient_name": string or null,
  "age": number or null,
  "gender": "male" | "female" | "other" | null,
  "symptoms": array of normalized English strings (empty array if none),
  "duration": string describing duration or null,
  "diagnosis": string or null,
  "medications": array of strings (empty array if none),
  "language_detected": "hi" | "mr" | "en" | "hinglish" | "mixed",
  "urgency": "low" | "medium" | "high",
  "missing_critical_fields": array of field names that are null but medically important,
  "extraction_confidence": "high" | "medium" | "low",
  "additional_notes": string or null
}}

FEW-SHOT EXAMPLES:

Example 1:
Transcript: "Ramu ko teen din se bukhar hai, 102 degree. Sar bhi dard kar raha hai. Koi dawai nahi li."
Output: {{"patient_name":"Ramu","age":null,"gender":null,"symptoms":["fever","headache"],"duration":"3 days","diagnosis":null,"medications":[],"language_detected":"hinglish","urgency":"medium","missing_critical_fields":["age","diagnosis"],"extraction_confidence":"high","additional_notes":"Temperature 102°F. No medication taken."}}

Example 2:
Transcript: "Mujhe continuous fever hai aani doka dukhat aahe.Teen divas zaale."
Output: {{"patient_name":null,"age":null,"gender":null,"symptoms":["fever","headache"],"duration":"3 days","diagnosis":null,"medications":[],"language_detected":"mixed","urgency":"medium","missing_critical_fields":["patient_name","age","diagnosis"],"extraction_confidence":"high","additional_notes":"Code-switching: Hindi + Marathi detected."}}

Example 3:
Transcript: "45 year old female patient. Chest pain since morning, shortness of breath. Takes aspirin daily."
Output: {{"patient_name":null,"age":45,"gender":"female","symptoms":["chest pain","shortness of breath"],"duration":"since morning","diagnosis":null,"medications":["aspirin"],"language_detected":"en","urgency":"high","missing_critical_fields":["patient_name","diagnosis"],"extraction_confidence":"high","additional_notes":null}}

PREVIOUSLY KNOWN PATIENT DATA (from prior visits — use this to fill gaps, do NOT override with null if already known):
{prior_context}

NOW EXTRACT FROM THIS TRANSCRIPT:
{transcript}"""


def _parse_json_response(text: str) -> dict | None:
    """Attempt to parse JSON from LLM response, stripping markdown fences if present."""
    # Try direct parse first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Strip markdown code fences
    cleaned = re.sub(r"```(?:json)?\s*", "", text)
    cleaned = re.sub(r"```\s*$", "", cleaned).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return None


def extract_medical_data(transcript: str, prior_patient_data: dict | None = None) -> dict:
    """
    Extract structured medical data from a transcript using Groq LLM.

    If prior_patient_data is provided (from previous visits), the LLM will
    use it to fill gaps and preserve already-known fields.

    Args:
        transcript: Raw conversation text.
        prior_patient_data: Optional dict with previously known fields.

    Returns:
        dict with all extracted medical fields, or a failure envelope.
    """
    # Build prior context string
    prior_context = "None (new patient)"
    if prior_patient_data:
        known_fields = []
        for key in ["patient_name", "age", "gender", "symptoms", "medications", "diagnosis", "duration"]:
            val = prior_patient_data.get(key)
            if val is not None and val != [] and val != "":
                known_fields.append(f"  {key}: {val}")
        if known_fields:
            prior_context = "\n".join(known_fields)

    user_prompt = USER_PROMPT_TEMPLATE.format(
        transcript=transcript,
        prior_context=prior_context,
    )

    # First attempt
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0,
        max_tokens=800,
    )

    raw_text = response.choices[0].message.content.strip()
    parsed = _parse_json_response(raw_text)

    if parsed is not None:
        return parsed

    # Retry with stricter instruction
    retry_prompt = (
        user_prompt
        + "\n\nIMPORTANT: Your previous response was not valid JSON. "
        "Return ONLY a raw JSON object. No markdown fences, no backticks, "
        "no explanation text. Start with { and end with }."
    )

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": retry_prompt},
        ],
        temperature=0,
        max_tokens=800,
    )

    raw_text_retry = response.choices[0].message.content.strip()
    parsed = _parse_json_response(raw_text_retry)

    if parsed is not None:
        return parsed

    # Both attempts failed
    return {
        "extraction_status": "failed",
        "raw_transcript": transcript,
    }
