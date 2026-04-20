import type { VisitRecord } from "../types/medical";
import UrgencyBadge from "./UrgencyBadge";
import TranscriptPanel from "./TranscriptPanel";

interface PatientCardProps {
  visit: VisitRecord | null;
}

export default function PatientCard({ visit }: PatientCardProps) {
  if (!visit) {
    return (
      <div className="card patient-card patient-card--empty" id="patient-card">
        <p className="muted-text">
          No data yet. Start recording a conversation to see extracted medical
          information here.
        </p>
      </div>
    );
  }

  return (
    <div className="card patient-card" id="patient-card">
      {/* Header */}
      <div className="patient-header">
        <div className="patient-identity">
          <h2 className="patient-name">
            {visit.patient_name || "Unknown Patient"}
          </h2>
          <div className="patient-meta">
            {visit.age !== null && <span>{visit.age} yrs</span>}
            {visit.gender && (
              <span className="capitalize">{visit.gender}</span>
            )}
          </div>
        </div>
        <UrgencyBadge urgency={visit.urgency} />
      </div>

      {/* Symptoms */}
      {(visit.symptoms || []).length > 0 && (
        <div className="field-group">
          <label className="field-label">Symptoms</label>
          <div className="pill-group">
            {(visit.symptoms || []).map((s, i) => (
              <span key={i} className="pill pill--symptom">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Duration */}
      {visit.duration && (
        <div className="field-group">
          <label className="field-label">Duration</label>
          <p className="field-value">{visit.duration}</p>
        </div>
      )}

      {/* Medications */}
      {(visit.medications || []).length > 0 && (
        <div className="field-group">
          <label className="field-label">Medications</label>
          <div className="pill-group">
            {(visit.medications || []).map((m, i) => (
              <span key={i} className="pill pill--medication">
                {m}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Diagnosis */}
      <div className="field-group">
        <label className="field-label">Diagnosis</label>
        <p className={`field-value ${!visit.diagnosis ? "muted-text" : ""}`}>
          {visit.diagnosis || "Not yet determined"}
        </p>
      </div>

      {/* Additional notes */}
      {visit.additional_notes && (
        <div className="field-group">
          <label className="field-label">Notes</label>
          <p className="field-value">{visit.additional_notes}</p>
        </div>
      )}

      {/* Confidence */}
      <div className="field-group">
        <span className="confidence-label">
          Extraction confidence:{" "}
          <strong>{visit.extraction_confidence}</strong>
        </span>
      </div>

      {/* Transcript panel */}
      <TranscriptPanel transcript={visit.raw_transcript} />
    </div>
  );
}
