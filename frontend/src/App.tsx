import { useState, useCallback } from "react";
import PatientListScreen from "./components/PatientListScreen";
import PatientProblemsScreen from "./components/PatientProblemsScreen";
import ProblemChatScreen from "./components/ProblemChatScreen";
import PatientChatbot from "./components/PatientChatbot";
import "./styles.css";

type Screen =
  | "patient-list"
  | "patient-problems"
  | "problem-chat"
  | "patient-chatbot";

function generatePatientId(): string {
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `PT-${digits}`;
}

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>("patient-list");
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [selectedPatientName, setSelectedPatientName] = useState<string | null>(null);
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(null);
  const [selectedProblemLabel, setSelectedProblemLabel] = useState<string>("New Consultation");

  // Patient list → Patient problems screen
  const handleSelectPatient = useCallback((patientId: string) => {
    setSelectedPatientId(patientId);
    setCurrentScreen("patient-problems");
  }, []);

  // New patient → Patient problems screen (fresh)
  const handleNewPatient = useCallback(() => {
    setSelectedPatientId(generatePatientId());
    setSelectedPatientName(null);
    setCurrentScreen("patient-problems");
  }, []);

  // Patient problems → Problem chat (existing problem)
  const handleSelectProblem = useCallback((problemId: string, label: string) => {
    setSelectedProblemId(problemId);
    setSelectedProblemLabel(label);
    setCurrentScreen("problem-chat");
  }, []);

  // Patient problems → Problem chat (new problem)
  const handleNewProblem = useCallback(() => {
    setSelectedProblemId(null);
    setSelectedProblemLabel("New Consultation");
    setCurrentScreen("problem-chat");
  }, []);

  const handleStartConsultation = useCallback(
    (choice: { kind: "continuation" | "new"; problemId?: string; label?: string }) => {
      if (choice.kind === "continuation" && choice.problemId) {
        setSelectedProblemId(choice.problemId);
        setSelectedProblemLabel(choice.label || "Follow-up Consultation");
      } else {
        setSelectedProblemId(null);
        setSelectedProblemLabel("New Consultation");
      }
      setCurrentScreen("problem-chat");
    },
    []
  );

  // Patient problems → Chatbot
  const handleOpenChatbot = useCallback(() => {
    setCurrentScreen("patient-chatbot");
  }, []);

  // Back to patient list
  const handleBackToList = useCallback(() => {
    setCurrentScreen("patient-list");
    setSelectedPatientId("");
    setSelectedPatientName(null);
    setSelectedProblemId(null);
  }, []);

  // Back to patient problems
  const handleBackToProblems = useCallback(() => {
    setCurrentScreen("patient-problems");
    setSelectedProblemId(null);
  }, []);

  // --- Render screens ---

  if (currentScreen === "patient-chatbot" && selectedPatientId) {
    return (
      <PatientChatbot
        patientId={selectedPatientId}
        patientName={selectedPatientName}
        onBack={handleBackToProblems}
      />
    );
  }

  if (currentScreen === "problem-chat" && selectedPatientId) {
    return (
      <ProblemChatScreen
        patientId={selectedPatientId}
        problemId={selectedProblemId}
        problemLabel={selectedProblemLabel}
        onBack={handleBackToProblems}
      />
    );
  }

  if (currentScreen === "patient-problems" && selectedPatientId) {
    return (
      <PatientProblemsScreen
        patientId={selectedPatientId}
        patientName={selectedPatientName}
        onSelectProblem={handleSelectProblem}
        onNewProblem={handleNewProblem}
        onStartConsultation={handleStartConsultation}
        onOpenChatbot={handleOpenChatbot}
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
