import type { VisitRecord } from "../types/medical";
import UrgencyBadge from "./UrgencyBadge";

interface VisitHistoryProps {
  visits: VisitRecord[];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function VisitHistory({ visits }: VisitHistoryProps) {
  // Skip the first (latest) visit since it's shown in PatientCard
  const past = visits.slice(1);

  if (past.length === 0) return null;

  return (
    <div className="visit-history" id="visit-history">
      <h3 className="section-title">Previous Visits</h3>
      <div className="visit-list">
        {past.map((v) => (
          <div key={v.visit_id} className="card visit-card">
            <div className="visit-card-header">
              <span className="visit-date">{formatDate(v.processed_at)}</span>
              <UrgencyBadge urgency={v.urgency} />
            </div>
            {v.symptoms.length > 0 && (
              <div className="pill-group">
                {v.symptoms.map((s, i) => (
                  <span key={i} className="pill pill--symptom">
                    {s}
                  </span>
                ))}
              </div>
            )}
            {v.medications.length > 0 && (
              <div className="pill-group" style={{ marginTop: 6 }}>
                {v.medications.map((m, i) => (
                  <span key={i} className="pill pill--medication">
                    {m}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
