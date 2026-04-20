import { useRef, useState, useCallback, useEffect } from "react";

interface TurnRecorderProps {
  onTurnComplete: (speaker: "patient" | "doctor", transcript: string) => void;
  onError?: (msg: string) => void;
  disabled?: boolean;
}

const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

export default function TurnRecorder({
  onTurnComplete,
  onError,
  disabled = false,
}: TurnRecorderProps) {
  const [recordingSpeaker, setRecordingSpeaker] = useState<
    "patient" | "doctor" | null
  >(null);
  const [processing, setProcessing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const startRecording = useCallback(
    async (speaker: "patient" | "doctor") => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        streamRef.current = stream;
        chunksRef.current = [];

        const recorder = new MediaRecorder(stream);

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
          // Stop mic
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
          }

          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          if (blob.size === 0) {
            setRecordingSpeaker(null);
            return;
          }

          setProcessing(true);
          setRecordingSpeaker(null);

          try {
            const formData = new FormData();
            formData.append("audio", blob, "audio.webm");

            const res = await fetch(`${BACKEND}/transcribe`, {
              method: "POST",
              body: formData,
            });

            if (!res.ok) {
              const err = await res.json();
              throw new Error(err.error || "Transcription failed");
            }

            const data = await res.json();
            const transcript = data.transcript?.trim();

            if (transcript) {
              onTurnComplete(speaker, transcript);
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Unknown error";
            onError?.(msg);
          } finally {
            setProcessing(false);
          }
        };

        recorder.start();
        mediaRecorderRef.current = recorder;
        setRecordingSpeaker(speaker);
      } catch {
        onError?.(
          "Microphone access denied. Please allow microphone in browser settings."
        );
      }
    },
    [onTurnComplete, onError]
  );

  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const handleClick = (speaker: "patient" | "doctor") => {
    if (recordingSpeaker === speaker) {
      stopRecording();
    } else if (!recordingSpeaker) {
      startRecording(speaker);
    }
  };

  const isDisabled = disabled || processing;

  return (
    <div className="turn-recorder" id="turn-recorder">
      <div className="turn-recorder-buttons">
        <button
          className={`turn-btn turn-btn--patient ${recordingSpeaker === "patient" ? "turn-btn--recording" : ""}`}
          onClick={() => handleClick("patient")}
          disabled={isDisabled || recordingSpeaker === "doctor"}
          id="btn-patient-speak"
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
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
          {recordingSpeaker === "patient"
            ? "Recording..."
            : "Patient Speaking"}
        </button>

        <button
          className={`turn-btn turn-btn--doctor ${recordingSpeaker === "doctor" ? "turn-btn--recording" : ""}`}
          onClick={() => handleClick("doctor")}
          disabled={isDisabled || recordingSpeaker === "patient"}
          id="btn-doctor-speak"
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
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
          {recordingSpeaker === "doctor"
            ? "Recording..."
            : "Doctor Speaking"}
        </button>
      </div>

      {processing && (
        <p className="turn-processing-label">Transcribing...</p>
      )}
    </div>
  );
}
