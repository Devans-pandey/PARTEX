import { useState, useEffect } from "react";
import { subscribeToProblems } from "../firebase/db";
import type { Problem } from "../types/medical";

interface PatientProblemsScreenProps {
  patientId: string;
  patientName: string | null;
  onSelectProblem: (problemId: string, label: string) => void;
  onNewProblem: () => void;
  onStartConsultation: (choice: {
    kind: "continuation" | "new";
    problemId?: string;
    label?: string;
  }) => void;
  onOpenChatbot: () => void;
  onBack: () => void;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const urgencyConfig: Record<string, { bg: string; color: string; label: string }> = {
  high: { bg: "#FCEBEB", color: "#A32D2D", label: "HIGH" },
  medium: { bg: "#FAEEDA", color: "#854F0B", label: "MED" },
  low: { bg: "#EAF3DE", color: "#3B6D11", label: "LOW" },
};

export default function PatientProblemsScreen({
  patientId,
  patientName,
  onSelectProblem,
  onNewProblem,
  onStartConsultation,
  onOpenChatbot,
  onBack,
}: PatientProblemsScreenProps) {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [showConsultChoice, setShowConsultChoice] = useState(false);
  const [choiceKind, setChoiceKind] = useState<"continuation" | "new">("new");
  const [selectedContinuationProblemId, setSelectedContinuationProblemId] = useState<string>("");

  useEffect(() => {
    const unsub = subscribeToProblems(patientId, (data) => {
      setProblems(data);
    });
    return unsub;
  }, [patientId]);

  useEffect(() => {
    if (problems.length > 0 && !selectedContinuationProblemId) {
      setSelectedContinuationProblemId(problems[0].problem_id);
    }
  }, [problems, selectedContinuationProblemId]);

  const handleStartConsultation = () => {
    if (problems.length === 0) {
      onNewProblem();
      return;
    }
    setChoiceKind("new");
    setShowConsultChoice(true);
  };

  const handleConfirmConsultChoice = () => {
    if (choiceKind === "new") {
      onStartConsultation({ kind: "new" });
      setShowConsultChoice(false);
      return;
    }

    const selectedProblem = problems.find(
      (p) => p.problem_id === selectedContinuationProblemId
    );
    if (!selectedProblem) return;

    onStartConsultation({
      kind: "continuation",
      problemId: selectedProblem.problem_id,
      label: selectedProblem.label,
    });
    setShowConsultChoice(false);
  };

  return (
    <div className="pp-screen" id="patient-problems-screen">
      {/* Header */}
      <nav className="pp-header">
        <button className="cv-back-btn" onClick={onBack} id="btn-pp-back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="pp-header-center">
          <h1 className="pp-header-title">
            {patientName || patientId}
          </h1>
          <span className="pp-header-subtitle">Medical Problems</span>
        </div>
        <button
          className="pp-chatbot-btn"
          onClick={onOpenChatbot}
          id="btn-open-chatbot"
          title="Ask AI about patient history"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      </nav>

      {/* Content */}
      <div className="pp-container">
        {/* Action buttons */}
        <div className="pp-actions">
          <button
            className="pp-new-problem-btn"
            onClick={handleStartConsultation}
            id="btn-new-problem"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Start Consultation
          </button>
          <button
            className="pp-history-btn"
            onClick={onOpenChatbot}
            id="btn-history-bot"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            History Bot
          </button>
        </div>

        {/* Problems list */}
        {problems.length === 0 ? (
          <div className="pp-empty" id="pp-empty">
            <div className="pp-empty-icon">
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
            </div>
            <h2 className="pp-empty-title">No problems recorded</h2>
            <p className="pp-empty-text">
              Start a new consultation to record the patient's first medical problem.
            </p>
          </div>
        ) : (
          <div className="pp-problems-grid" id="pp-problems-grid">
            {problems.map((p) => {
              const uc = p.last_urgency ? urgencyConfig[p.last_urgency] : null;
              return (
                <div
                  key={p.problem_id}
                  className={`pp-problem-card ${p.status === "resolved" ? "pp-problem-card--resolved" : ""}`}
                  onClick={() => onSelectProblem(p.problem_id, p.label)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onSelectProblem(p.problem_id, p.label);
                  }}
                  id={`problem-card-${p.problem_id}`}
                >
                  <div className="pp-card-top">
                    <div className="pp-card-label-row">
                      <span className="pp-card-label">{p.label}</span>
                      {uc && (
                        <span
                          className="pp-card-urgency"
                          style={{ backgroundColor: uc.bg, color: uc.color }}
                        >
                          {uc.label}
                        </span>
                      )}
                    </div>
                    <span className={`pp-card-status pp-card-status--${p.status}`}>
                      {p.status === "active" ? "● Active" : "✓ Resolved"}
                    </span>
                  </div>

                  {/* Symptoms pills */}
                  {p.last_symptoms.length > 0 && (
                    <div className="pill-group" style={{ marginTop: 8 }}>
                      {p.last_symptoms.slice(0, 4).map((s, i) => (
                        <span key={i} className="pill pill--symptom">
                          {s}
                        </span>
                      ))}
                      {p.last_symptoms.length > 4 && (
                        <span className="pill pill--more">
                          +{p.last_symptoms.length - 4}
                        </span>
                      )}
                    </div>
                  )}

                  {p.last_diagnosis && (
                    <div className="pp-card-diagnosis">
                      <span className="pp-card-dx-label">Dx:</span> {p.last_diagnosis}
                    </div>
                  )}

                  <div className="pp-card-footer">
                    <span className="pp-card-date">{formatDate(p.last_visit_date || p.created_at)}</span>
                    <span className="pp-card-visits">
                      {p.visit_count} visit{p.visit_count !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showConsultChoice && (
        <div className="pp-modal-backdrop" id="pp-consult-choice-backdrop">
          <div className="pp-modal" role="dialog" aria-modal="true" id="pp-consult-choice-modal">
            <h3 className="pp-modal-title">Consultation Type</h3>
            <p className="pp-modal-subtitle">
              Doctor can choose whether this is a continuation or a new problem.
            </p>

            <label className="pp-choice-option">
              <input
                type="radio"
                name="consultType"
                checked={choiceKind === "continuation"}
                onChange={() => setChoiceKind("continuation")}
              />
              <span>Continuation of existing problem</span>
            </label>

            {choiceKind === "continuation" && (
              <div className="pp-choice-select-wrap">
                <select
                  className="pp-choice-select"
                  value={selectedContinuationProblemId}
                  onChange={(e) => setSelectedContinuationProblemId(e.target.value)}
                  id="pp-continuation-problem-select"
                >
                  {problems.map((p) => (
                    <option key={p.problem_id} value={p.problem_id}>
                      {p.label} ({p.visit_count} visit{p.visit_count !== 1 ? "s" : ""})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <label className="pp-choice-option">
              <input
                type="radio"
                name="consultType"
                checked={choiceKind === "new"}
                onChange={() => setChoiceKind("new")}
              />
              <span>New problem</span>
            </label>

            <div className="pp-modal-actions">
              <button
                className="pp-modal-btn pp-modal-btn--ghost"
                onClick={() => setShowConsultChoice(false)}
                id="btn-consult-choice-cancel"
              >
                Cancel
              </button>
              <button
                className="pp-modal-btn pp-modal-btn--primary"
                onClick={handleConfirmConsultChoice}
                id="btn-consult-choice-confirm"
                disabled={choiceKind === "continuation" && !selectedContinuationProblemId}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
