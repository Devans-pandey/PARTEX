import { useState, useEffect, useCallback, useMemo } from "react";
import RecordButton from "./components/RecordButton";
import PatientCard from "./components/PatientCard";
import MissingFieldsBanner from "./components/MissingFieldsBanner";
import VisitHistory from "./components/VisitHistory";
import { subscribeToVisits } from "./firebase/db";
import type { VisitRecord, TranscribeResponse } from "./types/medical";
import "./styles.css";

function generatePatientId(): string {
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `PT-${digits}`;
}

export default function App() {
  const [patientId, setPatientId] = useState(generatePatientId);
  const [visits, setVisits] = useState<VisitRecord[]>([]);
  const [languageDetected, setLanguageDetected] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Subscribe to Firebase for the current patient
  useEffect(() => {
    const unsub = subscribeToVisits(patientId, (data) => {
      setVisits(data);
    });
    return unsub;
  }, [patientId]);

  const latestVisit = useMemo(() => visits[0] || null, [visits]);

  const handleTranscript = useCallback((resp: TranscribeResponse) => {
    setLanguageDetected(resp.language_detected);
    setStatusMessage(null);
  }, []);

  const handleExtracted = useCallback((_data: VisitRecord) => {
    setStatusMessage("Data extracted and saved ✓");
    setTimeout(() => setStatusMessage(null), 3000);
  }, []);

  const handleError = useCallback((msg: string) => {
    setStatusMessage(`Error: ${msg}`);
  }, []);

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="header-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
        </div>
        <div>
          <h1 className="app-title">Healthcare Voice AI</h1>
          <p className="app-subtitle">Multilingual OPD Voice Capture System</p>
        </div>
      </header>

      {/* Patient ID */}
      <div className="card patient-id-card">
        <label className="field-label" htmlFor="patient-id-input">
          Patient ID
        </label>
        <input
          id="patient-id-input"
          type="text"
          className="patient-id-input"
          value={patientId}
          onChange={(e) => setPatientId(e.target.value)}
          placeholder="e.g. PT-1234"
        />
      </div>

      {/* Language badge */}
      {languageDetected && (
        <div className="language-badge-wrapper">
          <span className="language-badge" id="language-badge">
            🌐 Language detected: <strong>{languageDetected}</strong>
          </span>
        </div>
      )}

      {/* Record button */}
      <RecordButton
        patientId={patientId}
        onTranscript={handleTranscript}
        onExtracted={handleExtracted}
        onError={handleError}
      />

      {/* Status message */}
      {statusMessage && (
        <p
          className={`status-message ${
            statusMessage.startsWith("Error") ? "status-error" : "status-success"
          }`}
        >
          {statusMessage}
        </p>
      )}

      {/* Missing fields banner */}
      {latestVisit && (
        <MissingFieldsBanner
          missingFields={latestVisit.missing_critical_fields || []}
        />
      )}

      {/* Patient card */}
      <PatientCard visit={latestVisit} />

      {/* Visit history */}
      <VisitHistory visits={visits} />
    </div>
  );
}
