"""
RAG (Retrieval-Augmented Generation) module for patient history chatbot.

Uses ChromaDB as a local vector database to store and retrieve
patient medical records (transcripts + extracted data).
This enables semantic search over patient history instead of
dumping the entire history into the LLM context window.
"""

import os
import json
import chromadb
from chromadb.config import Settings

# ---------------------------------------------------------------------------
# ChromaDB initialisation (persistent local storage)
# ---------------------------------------------------------------------------
CHROMA_DIR = os.path.join(os.path.dirname(__file__), "chroma_db")

chroma_client = chromadb.Client(Settings(
    persist_directory=CHROMA_DIR,
    anonymized_telemetry=False,
    is_persistent=True,
))

# One collection for all patient documents
COLLECTION_NAME = "patient_records"

try:
    collection = chroma_client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )
    print(f"[rag] ChromaDB collection '{COLLECTION_NAME}' ready ({collection.count()} docs)")
except Exception as exc:
    print(f"[rag] WARNING: ChromaDB init failed: {exc}")
    collection = None


# ---------------------------------------------------------------------------
# Indexing: add patient visit data to vector store
# ---------------------------------------------------------------------------
def index_patient_visit(
    patient_id: str,
    problem_id: str,
    visit_id: str,
    transcript: str,
    extracted: dict,
    problem_label: str = "",
) -> bool:
    """
    Index a patient visit into ChromaDB for later retrieval.

    Creates multiple document chunks:
    1. The raw transcript
    2. A structured summary of extracted medical data

    Args:
        patient_id: e.g. "PT-7583"
        problem_id: e.g. "prob_f4500b1a"
        visit_id: unique visit identifier
        transcript: raw conversation transcript
        extracted: structured medical data dict
        problem_label: e.g. "Skin Rash"

    Returns:
        True if indexing succeeded.
    """
    if not collection:
        print("[rag] Collection not available, skipping indexing.")
        return False

    try:
        documents = []
        metadatas = []
        ids = []

        base_meta = {
            "patient_id": patient_id,
            "problem_id": problem_id,
            "visit_id": visit_id,
            "problem_label": problem_label or "General Consultation",
        }

        # --- Chunk 1: Raw transcript ---
        if transcript and transcript.strip():
            documents.append(f"[Patient: {patient_id}] [Problem: {problem_label}] Transcript:\n{transcript.strip()}")
            metadatas.append({**base_meta, "chunk_type": "transcript"})
            ids.append(f"{patient_id}_{visit_id}_transcript")

        # --- Chunk 2: Structured medical summary ---
        summary_parts = []
        if extracted.get("patient_name"):
            summary_parts.append(f"Patient Name: {extracted['patient_name']}")
        if extracted.get("age"):
            summary_parts.append(f"Age: {extracted['age']}")
        if extracted.get("gender"):
            summary_parts.append(f"Gender: {extracted['gender']}")
        if extracted.get("symptoms"):
            symptoms = extracted["symptoms"]
            if isinstance(symptoms, list):
                summary_parts.append(f"Symptoms: {', '.join(symptoms)}")
            else:
                summary_parts.append(f"Symptoms: {symptoms}")
        if extracted.get("duration"):
            summary_parts.append(f"Duration: {extracted['duration']}")
        if extracted.get("diagnosis"):
            summary_parts.append(f"Diagnosis: {extracted['diagnosis']}")
        if extracted.get("medications"):
            meds = extracted["medications"]
            if isinstance(meds, list):
                summary_parts.append(f"Medications: {', '.join(meds)}")
            else:
                summary_parts.append(f"Medications: {meds}")
        if extracted.get("urgency"):
            summary_parts.append(f"Urgency: {extracted['urgency']}")
        if extracted.get("additional_notes"):
            summary_parts.append(f"Notes: {extracted['additional_notes']}")

        if summary_parts:
            summary_text = (
                f"[Patient: {patient_id}] [Problem: {problem_label}] "
                f"Medical Record Summary:\n" + "\n".join(summary_parts)
            )
            documents.append(summary_text)
            metadatas.append({**base_meta, "chunk_type": "summary"})
            ids.append(f"{patient_id}_{visit_id}_summary")

        if not documents:
            print(f"[rag] No content to index for visit {visit_id}")
            return False

        # Upsert (add or update) documents
        collection.upsert(
            documents=documents,
            metadatas=metadatas,
            ids=ids,
        )

        print(f"[rag] Indexed {len(documents)} chunks for patient {patient_id}, visit {visit_id}")
        return True

    except Exception as exc:
        print(f"[rag] Indexing failed: {type(exc).__name__}: {exc}")
        return False


# ---------------------------------------------------------------------------
# Retrieval: find relevant chunks for a query
# ---------------------------------------------------------------------------
def retrieve_context(
    patient_id: str,
    query: str,
    n_results: int = 6,
) -> list[dict]:
    """
    Retrieve the most relevant document chunks for a patient query.

    Args:
        patient_id: Filter results to this patient only.
        query: The user's question.
        n_results: Max number of chunks to retrieve.

    Returns:
        List of dicts with keys: text, chunk_type, problem_label, distance
    """
    if not collection or collection.count() == 0:
        return []

    try:
        results = collection.query(
            query_texts=[query],
            n_results=n_results,
            where={"patient_id": patient_id},
        )

        chunks = []
        if results and results["documents"]:
            for i, doc in enumerate(results["documents"][0]):
                meta = results["metadatas"][0][i] if results["metadatas"] else {}
                distance = results["distances"][0][i] if results["distances"] else 0

                chunks.append({
                    "text": doc,
                    "chunk_type": meta.get("chunk_type", "unknown"),
                    "problem_label": meta.get("problem_label", ""),
                    "visit_id": meta.get("visit_id", ""),
                    "distance": distance,
                })

        print(f"[rag] Retrieved {len(chunks)} chunks for query: '{query[:60]}...'")
        return chunks

    except Exception as exc:
        print(f"[rag] Retrieval failed: {type(exc).__name__}: {exc}")
        return []


# ---------------------------------------------------------------------------
# Bulk reindex: reindex all patient data from Firebase
# ---------------------------------------------------------------------------
def reindex_patient_from_firebase(patient_id: str, patient_data: dict) -> int:
    """
    Reindex all visits for a patient from their Firebase data.
    Useful for initial setup or rebuilding the index.

    Returns:
        Number of chunks indexed.
    """
    if not collection or not patient_data:
        return 0

    count = 0
    problems = patient_data.get("problems", {})

    for prob_id, prob_data in problems.items():
        label = prob_data.get("label", "General Consultation")
        visits = prob_data.get("visits", {}) or {}

        for visit_id, visit in visits.items():
            transcript = visit.get("raw_transcript", "")
            extracted = visit.get("extracted", {})

            if index_patient_visit(
                patient_id=patient_id,
                problem_id=prob_id,
                visit_id=visit_id,
                transcript=transcript,
                extracted=extracted,
                problem_label=label,
            ):
                count += 1

    # Also index legacy visits
    legacy = patient_data.get("visits", {})
    if legacy:
        for visit_id, visit in legacy.items():
            transcript = visit.get("raw_transcript", "")
            if index_patient_visit(
                patient_id=patient_id,
                problem_id="legacy",
                visit_id=visit_id,
                transcript=transcript,
                extracted=visit,
                problem_label=visit.get("diagnosis", "Legacy Visit"),
            ):
                count += 1

    print(f"[rag] Reindexed {count} chunks for patient {patient_id}")
    return count


def get_index_stats() -> dict:
    """Return stats about the current vector index."""
    if not collection:
        return {"status": "unavailable", "total_documents": 0}

    return {
        "status": "ready",
        "total_documents": collection.count(),
        "collection_name": COLLECTION_NAME,
    }
