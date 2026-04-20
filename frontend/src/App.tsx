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

  const handleExtracted = useCallback((data: VisitRecord) => {
    // Store extracted data locally so PatientCard shows it immediately,
    // even if Firebase is not configured or slow to sync.
    setVisits((prev) => {
      const exists = prev.some((v) => v.visit_id === data.visit_id);
      if (exists) return prev;
      const updated = [data, ...prev];
      updated.sort(
        (a, b) =>
          new Date(b.processed_at).getTime() -
          new Date(a.processed_at).getTime()
      );
      return updated;
    });
    setStatusMessage("Data extracted and saved ✓");
    setTimeout(() => setStatusMessage(null), 3000);
  }, []);

  const handleError = useCallback((msg: string) => {
    setStatusMessage(`Error: ${msg}`);
  }, []);

  return (
    <>
      {/* ---- Top Navbar ---- */}
      <nav className="top-navbar" id="top-navbar">
        <div className="navbar-brand">
          <div className="navbar-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <div>
            <div className="navbar-title">PARTEX Healthcare AI</div>
            <div className="navbar-subtitle">Multilingual OPD Voice Capture</div>
          </div>
        </div>
        <div className="navbar-logos">
          <img
            src="/ait-pune-logo.png"
            alt="AIT Pune"
            className="navbar-logo-img"
            id="ait-pune-logo"
          />
          <img
            src="/partex-logo.png"
            alt="PARTEX"
            className="navbar-logo-img"
            id="partex-logo"
          />
        </div>
      </nav>

      {/* ---- Main Content ---- */}
      <div className="app-container">
        {/* Hero */}
        <section className="hero-section" id="hero-section">
          <h1 className="hero-title">Doctor–Patient Voice Intelligence</h1>
          <p className="hero-description">
            Record a conversation between doctor and patient in Hindi, Marathi,
            English, or any mix. Our AI transcribes and extracts structured
            medical data in real-time.
          </p>
        </section>

        {/* Patient ID */}
        <div className="card patient-id-card" id="patient-id-section">
          <label className="field-label" htmlFor="patient-id-input">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
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
            id="status-message"
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

        {/* Footer */}
        <footer className="app-footer" id="app-footer">
          <p className="footer-text">
            Built with ❤️ by <strong>PARTEX</strong> &amp; <strong>AIT Pune</strong><br />
            Powered by Whisper ASR &amp; Groq LLM
          </p>
        </footer>
      </div>
    </>
  );
}
