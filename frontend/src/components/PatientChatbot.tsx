import { useState, useRef, useEffect, useCallback } from "react";
import type { ChatbotMessage } from "../types/medical";

interface PatientChatbotProps {
  patientId: string;
  patientName: string | null;
  onBack: () => void;
}

const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

const SUGGESTED_QUESTIONS = [
  "What are all the problems this patient has had?",
  "What medications has this patient been prescribed?",
  "Summarize the patient's complete medical history",
  "What was the last diagnosis?",
  "Has this patient had any high urgency visits?",
];

export default function PatientChatbot({
  patientId,
  patientName,
  onBack,
}: PatientChatbotProps) {
  const [messages, setMessages] = useState<ChatbotMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendMessage = useCallback(
    async (question: string) => {
      if (!question.trim() || loading) return;

      const userMsg: ChatbotMessage = {
        id: `msg_${Date.now()}_user`,
        role: "user",
        text: question.trim(),
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setLoading(true);

      try {
        const res = await fetch(`${BACKEND}/chatbot`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patient_id: patientId,
            question: question.trim(),
          }),
        });

        if (!res.ok) {
          throw new Error("Failed to get response");
        }

        const data = await res.json();

        const assistantMsg: ChatbotMessage = {
          id: `msg_${Date.now()}_assistant`,
          role: "assistant",
          text: data.answer || "No response received.",
          timestamp: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err: unknown) {
        const errMsg: ChatbotMessage = {
          id: `msg_${Date.now()}_error`,
          role: "assistant",
          text: `Sorry, something went wrong. ${err instanceof Error ? err.message : ""}`,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errMsg]);
      } finally {
        setLoading(false);
      }
    },
    [patientId, loading]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <div className="chatbot-screen" id="patient-chatbot">
      {/* Header */}
      <nav className="cv-header">
        <button className="cv-back-btn" onClick={onBack} id="btn-chatbot-back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="cv-header-center">
          <h1 className="cv-header-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6, verticalAlign: "middle" }}>
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            History Bot
          </h1>
          <span className="chatbot-patient-label">
            {patientName || patientId}
          </span>
        </div>
        <div style={{ width: 36 }} />
      </nav>

      {/* Messages */}
      <div className="chatbot-messages" ref={scrollRef} id="chatbot-messages">
        {messages.length === 0 ? (
          <div className="chatbot-welcome">
            <div className="chatbot-welcome-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <h2 className="chatbot-welcome-title">
              Ask me about {patientName || "this patient"}'s history
            </h2>
            <p className="chatbot-welcome-text">
              I can look up symptoms, medications, diagnoses, and visit history.
            </p>

            {/* Suggested questions */}
            <div className="chatbot-suggestions">
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  className="chatbot-suggestion-chip"
                  onClick={() => sendMessage(q)}
                  id={`suggestion-${i}`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`chatbot-msg chatbot-msg--${msg.role}`}
                id={`chatbot-msg-${msg.id}`}
              >
                {msg.role === "assistant" && (
                  <div className="chatbot-msg-avatar">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  </div>
                )}
                <div className="chatbot-msg-bubble">
                  <div className="chatbot-msg-text">{msg.text}</div>
                  <div className="chatbot-msg-time">
                    {new Date(msg.timestamp).toLocaleTimeString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="chatbot-msg chatbot-msg--assistant">
                <div className="chatbot-msg-avatar">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </div>
                <div className="chatbot-msg-bubble chatbot-msg-bubble--typing">
                  <span className="chatbot-typing-dot" />
                  <span className="chatbot-typing-dot" />
                  <span className="chatbot-typing-dot" />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Input area */}
      <form className="chatbot-input-area" onSubmit={handleSubmit} id="chatbot-input-form">
        <input
          ref={inputRef}
          type="text"
          className="chatbot-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about patient history..."
          disabled={loading}
          id="chatbot-input"
        />
        <button
          type="submit"
          className="chatbot-send-btn"
          disabled={!input.trim() || loading}
          id="btn-chatbot-send"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </form>
    </div>
  );
}
