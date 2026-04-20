import type { ConversationTurn } from "../types/medical";

interface ChatBubbleProps {
  turn: ConversationTurn;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ChatBubble({ turn }: ChatBubbleProps) {
  const isPatient = turn.speaker === "patient";

  return (
    <div
      className={`chat-bubble ${isPatient ? "chat-bubble--patient" : "chat-bubble--doctor"}`}
      id={`chat-bubble-${turn.id}`}
    >
      <div className="chat-bubble-speaker">
        {isPatient ? "Patient" : "Doctor"}
      </div>
      <div className="chat-bubble-text">{turn.transcript}</div>
      <div className="chat-bubble-time">{formatTime(turn.timestamp)}</div>
    </div>
  );
}
