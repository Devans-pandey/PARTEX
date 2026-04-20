import { useState, useEffect, useRef, useCallback } from "react";
import ChatBubble from "./ChatBubble";
import SessionTimer from "./SessionTimer";
import UnifiedRecordButton from "./UnifiedRecordButton";
import PatientCard from "./PatientCard";
import MissingFieldsBanner from "./MissingFieldsBanner";
import { subscribeToProblemVisits } from "../firebase/db";
import type {
  ConversationTurn,
  ProblemVisit,
  RealtimeAssist,
  SpeakerSegment,
  VisitRecord,
} from "../types/medical";

interface ProblemChatScreenProps {
  patientId: string;
  problemId: string | null; // null = new problem
  problemLabel: string;
  onBack: () => void;
}

const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

type ViewMode = "history" | "conversation" | "extracting" | "report";

export default function ProblemChatScreen({
  patientId,
  problemId,
  problemLabel,
  onBack,
}: ProblemChatScreenProps) {
  const [mode, setMode] = useState<ViewMode>(
    problemId ? "history" : "conversation"
  );
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [pastVisits, setPastVisits] = useState<ProblemVisit[]>([]);
  const [report, setReport] = useState<VisitRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeProblemId, setActiveProblemId] = useState<string | null>(
    problemId
  );
  const [assist, setAssist] = useState<RealtimeAssist | null>(null);
  const [assistLoading, setAssistLoading] = useState(false);
  const [assistError, setAssistError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Subscribe to existing visits for this problem
  useEffect(() => {
    if (!activeProblemId) return;

    const unsub = subscribeToProblemVisits(
      patientId,
      activeProblemId,
      (visits) => {
        setPastVisits(visits);
      }
    );
    return unsub;
  }, [patientId, activeProblemId]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns, pastVisits]);

  // Fetch realtime AI suggestions as conversation evolves.
  useEffect(() => {
    if (mode !== "conversation" || turns.length === 0) {
      setAssist(null);
      setAssistError(null);
      setAssistLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setAssistLoading(true);
      setAssistError(null);
      try {
        const res = await fetch(`${BACKEND}/assist`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            patient_id: patientId,
            problem_id: activeProblemId,
            problem_label: problemLabel,
            turns: turns.map((t) => ({
              speaker: t.speaker,
              text: t.transcript,
              timestamp: t.timestamp,
            })),
          }),
        });

        if (!res.ok) {
          throw new Error("Failed to fetch live suggestions");
        }

        const data: RealtimeAssist = await res.json();
        setAssist(data);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        setAssistError(err instanceof Error ? err.message : "Suggestion fetch failed");
      } finally {
        setAssistLoading(false);
      }
    }, 900);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [mode, turns, patientId, activeProblemId, problemLabel]);

  const handleTranscriptReady = useCallback(
    (transcript: string, speakers: SpeakerSegment[]) => {
      // Convert speaker segments to conversation turns
      if (speakers.length > 0) {
        const newTurns: ConversationTurn[] = speakers.map((seg, i) => ({
          id: `turn_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
          speaker: seg.speaker,
          transcript: seg.text,
          timestamp: new Date().toISOString(),
        }));
        setTurns((prev) => [...prev, ...newTurns]);
      } else {
        // Fallback: treat entire transcript as single turn
        const newTurn: ConversationTurn = {
          id: `turn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          speaker: "patient",
          transcript,
          timestamp: new Date().toISOString(),
        };
        setTurns((prev) => [...prev, newTurn]);
      }
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
          problem_id: activeProblemId || "",
          chunk_id: sessionId,
          turns: turns.map((t) => ({
            speaker: t.speaker,
            text: t.transcript,
            timestamp: t.timestamp,
          })),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Extraction failed");
      }

      const extracted: VisitRecord = await res.json();

      // Update active problem ID if backend created a new one
      if (extracted.problem_id && !activeProblemId) {
        setActiveProblemId(extracted.problem_id);
      }

      setReport(extracted);
      setMode("report");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Extraction failed";
      setError(msg);
      setMode("conversation");
    }
  }, [turns, patientId, activeProblemId]);

  const handleStartNewVisit = () => {
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
      high: { bg: "#FCEBEB", color: "#A32D2D", label: "HIGH URGENCY" },
      medium: { bg: "#FAEEDA", color: "#854F0B", label: "MEDIUM PRIORITY" },
      low: { bg: "#EAF3DE", color: "#3B6D11", label: "LOW — Routine" },
    };

    const uc = urgencyConfig[report.urgency] || urgencyConfig.low;

    return (
      <div className="cv-report" id="consultation-report">
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
          <div
            className="cv-urgency-banner"
            style={{ backgroundColor: uc.bg, color: uc.color }}
            id="report-urgency-banner"
          >
            {uc.label}
          </div>

          <PatientCard visit={report} />
          <MissingFieldsBanner
            missingFields={report.missing_critical_fields || []}
          />

          {/* Conversation transcript */}
          <div className="cv-report-transcript card">
            <ConversationTranscriptToggle turns={turns} />
          </div>

          <div className="cv-report-actions">
            <button
              className="cv-action-btn cv-action-btn--primary"
              onClick={handleStartNewVisit}
              id="btn-new-visit"
            >
              Add Another Visit
            </button>
            <button
              className="cv-action-btn cv-action-btn--secondary"
              onClick={onBack}
              id="btn-back-to-problems"
            >
              Back to Problems
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // HISTORY mode — show past visits for this problem
  // -----------------------------------------------------------------------
  if (mode === "history" && pastVisits.length > 0) {
    return (
      <div className="pcs-history" id="problem-history">
        <nav className="cv-header">
          <button className="cv-back-btn" onClick={onBack} id="btn-history-back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div className="cv-header-center">
            <h1 className="cv-header-title">{problemLabel}</h1>
            <span className="pcs-visit-count">
              {pastVisits.length} visit{pastVisits.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div style={{ width: 36 }} />
        </nav>

        <div className="pcs-history-body" ref={scrollRef}>
          {pastVisits.map((visit, idx) => (
            <div key={visit.visit_id} className="pcs-visit-block" id={`visit-block-${idx}`}>
              <div className="pcs-visit-header">
                <span className="pcs-visit-date">
                  {new Date(visit.processed_at).toLocaleString("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
                {visit.extracted?.urgency && (
                  <span
                    className={`pcs-visit-urgency pcs-visit-urgency--${visit.extracted.urgency}`}
                  >
                    {visit.extracted.urgency.toUpperCase()}
                  </span>
                )}
              </div>

              {/* Show extracted data summary */}
              {visit.extracted && (
                <div className="pcs-visit-summary">
                  {(visit.extracted.symptoms || []).length > 0 && (
                    <div className="pill-group">
                      {(visit.extracted.symptoms || []).map((s: string, i: number) => (
                        <span key={i} className="pill pill--symptom">{s}</span>
                      ))}
                    </div>
                  )}
                  {visit.extracted.diagnosis && (
                    <p className="pcs-dx"><strong>Diagnosis:</strong> {visit.extracted.diagnosis}</p>
                  )}
                  {(visit.extracted.medications || []).length > 0 && (
                    <div className="pill-group" style={{ marginTop: 6 }}>
                      {(visit.extracted.medications || []).map((m: string, i: number) => (
                        <span key={i} className="pill pill--medication">{m}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Show transcript turns */}
              {visit.turns && visit.turns.length > 0 && (
                <TranscriptAccordion
                  label="View Transcript"
                  turns={visit.turns}
                />
              )}

              {/* Fallback: raw transcript */}
              {(!visit.turns || visit.turns.length === 0) && visit.raw_transcript && (
                <RawTranscriptAccordion transcript={visit.raw_transcript} />
              )}
            </div>
          ))}

          {/* Add new visit button */}
          <div className="pcs-add-visit-area">
            <button
              className="pcs-add-visit-btn"
              onClick={handleStartNewVisit}
              id="btn-add-visit"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add New Visit
            </button>
          </div>
        </div>
      </div>
    );
  }

  // If history mode but no past visits, switch to conversation
  if (mode === "history" && pastVisits.length === 0) {
    // Wait a moment for data to load, then show conversation
    return (
      <div className="cv-conversation" id="consultation-conversation">
        <nav className="cv-header">
          <button className="cv-back-btn" onClick={onBack} id="btn-conv-back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div className="cv-header-center">
            <h1 className="cv-header-title">{problemLabel}</h1>
            <span className="pcs-visit-count">Loading...</span>
          </div>
          <div style={{ width: 36 }} />
        </nav>
        <div className="cv-chat-area">
          <div className="cv-chat-placeholder">
            <div className="cv-extracting-spinner" />
            <p>Loading visit history...</p>
          </div>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // CONVERSATION mode — recording a new visit
  // -----------------------------------------------------------------------
  return (
    <div className="cv-conversation" id="consultation-conversation">
      <nav className="cv-header">
        <button className="cv-back-btn" onClick={onBack} id="btn-conv-back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="cv-header-center">
          <h1 className="cv-header-title">{problemLabel}</h1>
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
            <p>Tap the mic to start recording</p>
            <p className="cv-chat-subtext">AI will auto-detect Doctor vs Patient</p>
          </div>
        ) : (
          turns.map((turn) => <ChatBubble key={turn.id} turn={turn} />)
        )}
      </div>

      {/* Error */}
      {error && (
        <p className="cv-error" id="cv-error-msg">
          {error}
        </p>
      )}

      {/* Bottom controls */}
      {turns.length > 0 && (
        <div className="cv-assist-panel" id="cv-assist-panel">
          <div className="cv-assist-header-row">
            <h3 className="cv-assist-title">Live AI Doctor Support</h3>
            {assistLoading && <span className="cv-assist-loading">Updating...</span>}
          </div>

          {assistError && <p className="cv-assist-error">{assistError}</p>}

          {!assistError && assist && (
            <>
              <div className="cv-assist-block">
                <div className="cv-assist-label">Medication ideas</div>
                {assist.medication_suggestions.length > 0 ? (
                  <div className="pill-group" style={{ marginTop: 8 }}>
                    {assist.medication_suggestions.map((m, i) => (
                      <span key={i} className="pill pill--medication">
                        {m}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="cv-assist-muted">No confident medication ideas yet.</p>
                )}
              </div>

              <div className="cv-assist-block">
                <div className="cv-assist-label">Counter-questions to ask now</div>
                {assist.counter_questions.length > 0 ? (
                  <ul className="cv-assist-list">
                    {assist.counter_questions.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="cv-assist-muted">No additional counter-questions suggested.</p>
                )}
              </div>

              {assist.rationale && (
                <p className="cv-assist-rationale">{assist.rationale}</p>
              )}
              {assist.caution && <p className="cv-assist-caution">{assist.caution}</p>}
            </>
          )}
        </div>
      )}

      <div className="cv-bottom-controls" id="cv-controls">
        <UnifiedRecordButton
          onTranscriptReady={handleTranscriptReady}
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
// Internal: collapsible transcript components
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

function TranscriptAccordion({
  label,
  turns,
}: {
  label: string;
  turns: ConversationTurn[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="pcs-transcript-accordion">
      <button
        className="transcript-toggle"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Hide" : label}
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

function RawTranscriptAccordion({ transcript }: { transcript: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="pcs-transcript-accordion">
      <button
        className="transcript-toggle"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Hide transcript" : "View Transcript"}
        <span className={`chevron ${open ? "open" : ""}`}>▾</span>
      </button>
      {open && (
        <div className="transcript-content">
          <p>{transcript}</p>
        </div>
      )}
    </div>
  );
}
