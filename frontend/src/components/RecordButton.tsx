import { useRef, useState, useCallback, useEffect } from "react";
import type { TranscribeResponse, VisitRecord } from "../types/medical";

interface RecordButtonProps {
  patientId: string;
  onTranscript?: (resp: TranscribeResponse) => void;
  onExtracted?: (data: VisitRecord) => void;
  onError?: (msg: string) => void;
}

const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
const CHUNK_INTERVAL_MS = 12000; // 12 seconds

export default function RecordButton({
  patientId,
  onTranscript,
  onExtracted,
  onError,
}: RecordButtonProps) {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const sendChunk = useCallback(
    async (blob: Blob) => {
      if (blob.size === 0) return;
      setProcessing(true);
      try {
        // Step 1: Transcribe
        const formData = new FormData();
        formData.append("audio", blob, "audio.webm");

        const transcribeRes = await fetch(`${BACKEND}/transcribe`, {
          method: "POST",
          body: formData,
        });

        if (!transcribeRes.ok) {
          const err = await transcribeRes.json();
          throw new Error(err.error || "Transcription failed");
        }

        const transcribeData: TranscribeResponse = await transcribeRes.json();
        onTranscript?.(transcribeData);

        if (!transcribeData.transcript.trim()) {
          setProcessing(false);
          return;
        }

        // Step 2: Extract
        const extractRes = await fetch(`${BACKEND}/extract`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript: transcribeData.transcript,
            patient_id: patientId,
            chunk_id: transcribeData.chunk_id,
          }),
        });

        if (!extractRes.ok) {
          const err = await extractRes.json();
          throw new Error(err.error || "Extraction failed");
        }

        const extracted: VisitRecord = await extractRes.json();
        onExtracted?.(extracted);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        setError(msg);
        onError?.(msg);
      } finally {
        setProcessing(false);
      }
    },
    [patientId, onTranscript, onExtracted, onError]
  );

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const startNewRecorder = () => {
        const recorder = new MediaRecorder(stream);
        chunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          sendChunk(blob);
        };

        recorder.start();
        mediaRecorderRef.current = recorder;
      };

      startNewRecorder();
      setRecording(true);

      // Restart every 12 seconds
      intervalRef.current = window.setInterval(() => {
        if (
          mediaRecorderRef.current &&
          mediaRecorderRef.current.state === "recording"
        ) {
          mediaRecorderRef.current.stop();
          startNewRecorder();
        }
      }, CHUNK_INTERVAL_MS);
    } catch {
      setError(
        "Microphone access denied. Please allow microphone in browser settings."
      );
    }
  }, [sendChunk]);

  const stopRecording = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setRecording(false);
  }, []);

  const handleClick = () => {
    if (recording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className="record-button-container">
      <button
        className={`record-button ${recording ? "recording" : ""}`}
        onClick={handleClick}
        disabled={processing && !recording}
        aria-label={recording ? "Stop recording" : "Start recording"}
        id="record-btn"
      >
        {/* Microphone SVG icon */}
        <svg
          className="mic-icon"
          width="40"
          height="40"
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
      </button>

      <p className="record-label">
        {recording
          ? "Recording… Tap to Stop"
          : processing
          ? "Processing final chunk…"
          : "Tap to Record"}
      </p>

      {error && <p className="record-error">{error}</p>}
    </div>
  );
}
