interface MissingFieldsBannerProps {
  missingFields: string[];
}

const fieldQuestions: Record<string, string> = {
  patient_name: "What is the patient's name?",
  age: "How old are you?",
  gender: "What is the patient's gender?",
  duration: "How long have you had these symptoms?",
  diagnosis: "Has any doctor given a diagnosis before?",
  symptoms: "What symptoms are you experiencing?",
  medications: "Are you currently taking any medications?",
};

export default function MissingFieldsBanner({
  missingFields,
}: MissingFieldsBannerProps) {
  if (!missingFields || missingFields.length === 0) return null;

  const questions = missingFields.map(
    (field) => fieldQuestions[field] || `What is the ${field.replace(/_/g, " ")}?`
  );

  return (
    <div className="missing-banner" id="missing-fields-banner">
      <div className="missing-banner-icon">⚠️</div>
      <div className="missing-banner-content">
        <strong>Missing information</strong> — Ask the patient:
        <ul className="missing-list">
          {questions.map((q, i) => (
            <li key={i}>{q}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
