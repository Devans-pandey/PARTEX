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
}

export interface VisitRecord extends MedicalRecord {
  patient_id: string;
  visit_id: string;
  chunk_id: string;
  raw_transcript: string;
  processed_at: string;
  extraction_status: "success" | "failed";
}

export interface TranscribeResponse {
  transcript: string;
  language_detected: string;
  chunk_id: string;
}
