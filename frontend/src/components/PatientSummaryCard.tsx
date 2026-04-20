import type { PatientSummary } from "../types/medical";

interface PatientSummaryCardProps {
  patient: PatientSummary;
  onClick: (patientId: string) => void;
}

function getInitials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0][0]?.toUpperCase() || "?";
}

function hashColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 45%)`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "No visits";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const urgencyStyles: Record<string, { bg: string; color: string }> = {
  high: { bg: "#FCEBEB", color: "#A32D2D" },
  medium: { bg: "#FAEEDA", color: "#854F0B" },
  low: { bg: "#EAF3DE", color: "#3B6D11" },
};

export default function PatientSummaryCard({
  patient,
  onClick,
}: PatientSummaryCardProps) {
  const initials = getInitials(patient.patient_name);
  const avatarBg = hashColor(patient.patient_id);
  const urgency = patient.last_urgency;
  const uStyle = urgency ? urgencyStyles[urgency] || urgencyStyles.low : null;

  return (
    <div
      className="patient-summary-card"
      onClick={() => onClick(patient.patient_id)}
      id={`patient-card-${patient.patient_id}`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onClick(patient.patient_id);
      }}
    >
      <div className="psc-avatar" style={{ backgroundColor: avatarBg }}>
        {initials}
      </div>
      <div className="psc-info">
        <div className="psc-name">
          {patient.patient_name || "Unknown Patient"}
        </div>
        <div className="psc-id">{patient.patient_id}</div>
        <div className="psc-meta">
          <span className="psc-date">{formatDate(patient.last_visit_date)}</span>
          <span className="psc-visits">
            {patient.visit_count} visit{patient.visit_count !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
      {uStyle && (
        <span
          className="psc-urgency"
          style={{ backgroundColor: uStyle.bg, color: uStyle.color }}
        >
          {urgency?.toUpperCase()}
        </span>
      )}
    </div>
  );
}
