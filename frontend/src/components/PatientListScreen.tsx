import { useState, useEffect } from "react";
import PatientSummaryCard from "./PatientSummaryCard";
import { subscribeToAllPatients } from "../firebase/db";
import type { PatientSummary } from "../types/medical";

interface PatientListScreenProps {
  onSelectPatient: (patientId: string) => void;
  onNewPatient: () => void;
}

export default function PatientListScreen({
  onSelectPatient,
  onNewPatient,
}: PatientListScreenProps) {
  const [patients, setPatients] = useState<PatientSummary[]>([]);

  useEffect(() => {
    const unsub = subscribeToAllPatients((data) => {
      setPatients(data);
    });
    return unsub;
  }, []);

  return (
    <>
      {/* Header */}
      <nav className="pl-header" id="patient-list-header">
        <div className="pl-header-brand">
          <div className="navbar-icon">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <div>
            <div className="navbar-title">VoiceClinic</div>
            <div className="navbar-subtitle">Patient Management</div>
          </div>
        </div>
        <button
          className="pl-new-patient-btn"
          onClick={onNewPatient}
          id="btn-new-patient"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Patient
        </button>
      </nav>

      {/* Content */}
      <div className="pl-container">
        {patients.length === 0 ? (
          /* Empty state */
          <div className="pl-empty" id="patient-list-empty">
            <div className="pl-empty-icon">
              <svg
                width="64"
                height="64"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <line x1="19" y1="8" x2="19" y2="14" />
                <line x1="22" y1="11" x2="16" y2="11" />
              </svg>
            </div>
            <h2 className="pl-empty-title">No patients yet</h2>
            <p className="pl-empty-text">
              Start your first consultation by adding a new patient.
            </p>
            <button
              className="pl-empty-cta"
              onClick={onNewPatient}
              id="btn-new-patient-cta"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add New Patient
            </button>
          </div>
        ) : (
          /* Patient grid */
          <div className="pl-grid" id="patient-list-grid">
            {patients.map((p) => (
              <PatientSummaryCard
                key={p.patient_id}
                patient={p}
                onClick={onSelectPatient}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
