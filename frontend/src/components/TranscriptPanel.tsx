import { useState } from "react";

interface TranscriptPanelProps {
  transcript: string;
}

export default function TranscriptPanel({ transcript }: TranscriptPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="transcript-panel" id="transcript-panel">
      <button
        className="transcript-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        id="transcript-toggle-btn"
      >
        {open ? "Hide transcript" : "Show transcript"}
        <span className={`chevron ${open ? "open" : ""}`}>▾</span>
      </button>
      {open && (
        <div className="transcript-content">
          <p>{transcript || "No transcript available."}</p>
        </div>
      )}
    </div>
  );
}
