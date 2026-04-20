import { useState, useCallback } from "react";
import PatientListScreen from "./components/PatientListScreen";
import ConsultationView from "./components/ConsultationView";
import "./styles.css";

type Screen = "patient-list" | "consultation";

function generatePatientId(): string {
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `PT-${digits}`;
}

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>("patient-list");
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");

  const handleSelectPatient = useCallback((patientId: string) => {
    setSelectedPatientId(patientId);
    setCurrentScreen("consultation");
  }, []);

  const handleNewPatient = useCallback(() => {
    setSelectedPatientId(generatePatientId());
    setCurrentScreen("consultation");
  }, []);

  const handleBackToList = useCallback(() => {
    setCurrentScreen("patient-list");
    setSelectedPatientId("");
  }, []);

  if (currentScreen === "consultation" && selectedPatientId) {
    return (
      <ConsultationView
        patientId={selectedPatientId}
        onBack={handleBackToList}
      />
    );
  }

  return (
    <PatientListScreen
      onSelectPatient={handleSelectPatient}
      onNewPatient={handleNewPatient}
    />
  );
}
