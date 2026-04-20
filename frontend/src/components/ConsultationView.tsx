import { useState, useEffect, useRef, useCallback } from "react";
import ChatBubble from "./ChatBubble";
import SessionTimer from "./SessionTimer";
import TurnRecorder from "./TurnRecorder";
import PatientCard from "./PatientCard";
import MissingFieldsBanner from "./MissingFieldsBanner";
import { subscribeToVisits } from "../firebase/db";
import type {
  ConversationTurn,
  VisitRecord,
} from "../types/medical";

interface ConsultationViewProps {
  patientId: string;
  onBack: () => void;
}

const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

type ViewMode = "conversation" | "extracting" | "report";

export default function ConsultationView({
  patientId,
  onBack,
}: ConsultationViewProps) {
  const [mode, setMode] = useState<ViewMode>("conversation");
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [patientName, setPatientName] = useState<string | null>(null);
  const [report, setReport] = useState<VisitRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Subscribe to Firebase visits for this patient (for report display)
  useEffect(() => {
    const unsub = subscribeToVisits(patientId, (visits) => {
      // If we're in report mode and have a matching visit, update report
      if (visits.length > 0 && mode === "report" && !report) {
        setReport(visits[0]);
      }
      // Try to get patient name from existing visits
      if (!patientName && visits.length > 0) {
        const name = visits.find((v) => v.patient_name)?.patient_name;
        if (name) setPatientName(name);
      }
    });
    return unsub;
  }, [patientId, mode, report, patientName]);

  // Auto-scroll to newest bubble
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns]);

  const handleTurnComplete = useCallback(
    (speaker: "patient" | "doctor", transcript: string) => {
      const newTurn: ConversationTurn = {
        id: `turn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        speaker,
        transcript,
        timestamp: new Date().toISOString(),
      };
      setTurns((prev) => [...prev, newTurn]);
    },
    []
  );

  const handleEndConsultation = useCallback(async () => {
    if (turns.length === 0) {
      setError("No conversation recorded. Please record at least one turn.");
      return;
    }

    setMode("extracting");
    setError(null);

    // Build full transcript
    const fullTranscript = turns
      .map(
        (t) =>
          `${t.speaker === "patient" ? "PATIENT" : "DOCTOR"}: ${t.transcript}`
      )
      .join("\n");

    const sessionId = `session_${Date.now()}`;

    try {
      const res = await fetch(`${BACKEND}/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: fullTranscript,
          patient_id: patientId,
          chunk_id: sessionId,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Extraction failed");
      }

      const extracted: VisitRecord = await res.json();
      setReport(extracted);
      if (extracted.patient_name) {
        setPatientName(extracted.patient_name);
      }
      setMode("report");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Extraction failed";
      setError(msg);
      setMode("conversation");
    }
  }, [turns, patientId]);

  const handleNewConsultation = () => {
    setTurns([]);
    setReport(null);
    setError(null);
    setMode("conversation");
  };

  // -----------------------------------------------------------------------
  // EXTRACTING overlay
  // -----------------------------------------------------------------------
  if (mode === "extracting") {
    return (
      <div className="cv-extracting-overlay" id="extracting-overlay">
        <div className="cv-extracting-content">
          <div className="cv-extracting-spinner" />
          <h2 className="cv-extracting-title">Analyzing conversation...</h2>
          <p className="cv-extracting-subtitle">
            Extracting medical data from {turns.length} turn
            {turns.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // REPORT mode
  // -----------------------------------------------------------------------
  if (mode === "report" && report) {
    const urgencyConfig: Record<
      string,
      { bg: string; color: string; label: string }
    > = {
      high: {
        bg: "#FCEBEB",
        color: "#A32D2D",
        label: "HIGH URGENCY",
      },
      medium: {
        bg: "#FAEEDA",
        color: "#854F0B",
        label: "MEDIUM PRIORITY",
      },
      low: {
        bg: "#EAF3DE",
        color: "#3B6D11",
        label: "LOW — Routine",
      },
    };

    const uc = urgencyConfig[report.urgency] || urgencyConfig.low;

    return (
      <div className="cv-report" id="consultation-report">
        {/* Header */}
        <nav className="cv-header">
          <button className="cv-back-btn" onClick={onBack} id="btn-report-back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h1 className="cv-header-title">Consultation Report</h1>
          <div style={{ width: 36 }} />
        </nav>

        <div className="cv-report-body">
          {/* Urgency banner */}
          <div
            className="cv-urgency-banner"
            style={{ backgroundColor: uc.bg, color: uc.color }}
            id="report-urgency-banner"
          >
            {uc.label}
          </div>

          {/* Patient card (reuse existing component) */}
          <PatientCard visit={report} />

          {/* Missing fields */}
          <MissingFieldsBanner
            missingFields={report.missing_critical_fields || []}
          />

          {/* Conversation transcript (collapsible) */}
          <div className="cv-report-transcript card">
            <ConversationTranscriptToggle turns={turns} />
          </div>

          {/* Actions */}
          <div className="cv-report-actions">
            <button
              className="cv-action-btn cv-action-btn--primary"
              onClick={handleNewConsultation}
              id="btn-new-consultation"
            >
              Start New Consultation
            </button>
            <button
              className="cv-action-btn cv-action-btn--secondary"
              onClick={onBack}
              id="btn-back-to-list"
            >
              Back to Patient List
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // CONVERSATION mode
  // -----------------------------------------------------------------------
  return (
    <div className="cv-conversation" id="consultation-conversation">
      {/* Header */}
      <nav className="cv-header">
        <button className="cv-back-btn" onClick={onBack} id="btn-conv-back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="cv-header-center">
          <h1 className="cv-header-title">
            {patientName || patientId}
          </h1>
          <SessionTimer running={mode === "conversation"} />
        </div>
        <div style={{ width: 36 }} />
      </nav>

      {/* Chat area */}
      <div className="cv-chat-area" ref={scrollRef} id="chat-area">
        {turns.length === 0 ? (
          <div className="cv-chat-placeholder">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.2 }}>
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
            <p>Tap below to begin the consultation</p>
          </div>
        ) : (
          turns.map((turn) => <ChatBubble key={turn.id} turn={turn} />)
        )}
      </div>

      {/* Error message */}
      {error && (
        <p className="cv-error" id="cv-error-msg">
          {error}
        </p>
      )}

      {/* Bottom controls */}
      <div className="cv-bottom-controls" id="cv-controls">
        <TurnRecorder
          onTurnComplete={handleTurnComplete}
          onError={(msg) => setError(msg)}
          disabled={mode !== "conversation"}
        />
        <button
          className="cv-end-btn"
          onClick={handleEndConsultation}
          disabled={turns.length === 0}
          id="btn-end-consultation"
        >
          End Consultation
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal: collapsible conversation transcript for report mode
// ---------------------------------------------------------------------------
function ConversationTranscriptToggle({
  turns,
}: {
  turns: ConversationTurn[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        className="transcript-toggle"
        onClick={() => setOpen((v) => !v)}
        id="btn-toggle-conversation"
      >
        {open ? "Hide conversation" : "Show full conversation"}
        <span className={`chevron ${open ? "open" : ""}`}>▾</span>
      </button>
      {open && (
        <div className="cv-conversation-bubbles">
          {turns.map((turn) => (
            <ChatBubble key={turn.id} turn={turn} />
          ))}
        </div>
      )}
    </div>
  );
}
