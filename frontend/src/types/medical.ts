/**
 * TypeScript interfaces for the Healthcare Voice AI system.
 */

export interface MedicalRecord {
  patient_name: string | null;
  age: number | null;
  gender: "male" | "female" | "other" | null;
  symptoms: string[];
  duration: string | null;
  diagnosis: string | null;
  medications: string[];
  language_detected: "hi" | "mr" | "en" | "hinglish" | "mixed";
  urgency: "low" | "medium" | "high";
  missing_critical_fields: string[];
  extraction_confidence: "high" | "medium" | "low";
  additional_notes: string | null;
  problem_label?: string;
}

export interface VisitRecord extends MedicalRecord {
  patient_id: string;
  visit_id: string;
  chunk_id: string;
  raw_transcript: string;
  processed_at: string;
  extraction_status: "success" | "failed";
  problem_id?: string;
  turns?: ConversationTurn[];
}

export interface TranscribeResponse {
  transcript: string;
  language_detected: string;
  chunk_id: string;
  speakers?: SpeakerSegment[];
}

export interface SpeakerSegment {
  speaker: "doctor" | "patient";
  text: string;
}

// ---------------------------------------------------------------------------
// New interfaces for patient management & consultation flow
// ---------------------------------------------------------------------------

export interface ConversationTurn {
  id: string;
  speaker: "patient" | "doctor";
  transcript: string;
  timestamp: string; // ISO string
}

export interface ConsultationSession {
  session_id: string;
  patient_id: string;
  turns: ConversationTurn[];
  status: "active" | "extracting" | "complete";
  started_at: string; // ISO string
}

export interface PatientSummary {
  patient_id: string;
  patient_name: string | null;
  last_visit_date: string | null;
  last_urgency: "low" | "medium" | "high" | null;
  visit_count: number;
}

// ---------------------------------------------------------------------------
// Problem-based interfaces
// ---------------------------------------------------------------------------

export interface Problem {
  problem_id: string;
  label: string;
  created_at: string;
  status: "active" | "resolved";
  visit_count: number;
  last_visit_date: string;
  last_urgency: "low" | "medium" | "high" | null;
  last_symptoms: string[];
  last_diagnosis: string | null;
}

export interface ProblemVisit {
  visit_id: string;
  raw_transcript: string;
  turns: ConversationTurn[];
  extracted: MedicalRecord;
  processed_at: string;
}

// ---------------------------------------------------------------------------
// Chatbot interfaces
// ---------------------------------------------------------------------------

export interface ChatbotMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: string;
}

export interface RealtimeAssist {
  medication_suggestions: string[];
  counter_questions: string[];
  rationale: string;
  caution: string;
}
