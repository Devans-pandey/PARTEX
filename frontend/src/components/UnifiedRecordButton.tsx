import { useRef, useState, useCallback, useEffect } from "react";
import type { SpeakerSegment } from "../types/medical";

interface UnifiedRecordButtonProps {
  onTranscriptReady: (
    transcript: string,
    speakers: SpeakerSegment[]
  ) => void;
  onError?: (msg: string) => void;
  disabled?: boolean;
}

const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

export default function UnifiedRecordButton({
  onTranscriptReady,
  onError,
  disabled = false,
}: UnifiedRecordButtonProps) {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      setElapsed(0);

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
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }

        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size === 0) {
          setRecording(false);
          return;
        }

        setProcessing(true);
        setRecording(false);

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
          const speakers: SpeakerSegment[] = data.speakers || [];

          if (transcript) {
            onTranscriptReady(transcript, speakers);
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
      setRecording(true);

      // Timer
      timerRef.current = window.setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } catch {
      onError?.(
        "Microphone access denied. Please allow microphone in browser settings."
      );
    }
  }, [onTranscriptReady, onError]);

  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const handleClick = () => {
    if (recording) {
      stopRecording();
    } else if (!processing) {
      startRecording();
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const isDisabled = disabled || processing;

  return (
    <div className="unified-rec" id="unified-record-btn">
      {/* Main mic button */}
      <button
        className={`unified-rec-btn ${recording ? "unified-rec-btn--recording" : ""} ${processing ? "unified-rec-btn--processing" : ""}`}
        onClick={handleClick}
        disabled={isDisabled}
        aria-label={recording ? "Stop recording" : "Start recording"}
        id="btn-unified-mic"
      >
        {/* Pulse rings when recording */}
        {recording && (
          <>
            <span className="unified-rec-pulse unified-rec-pulse--1" />
            <span className="unified-rec-pulse unified-rec-pulse--2" />
            <span className="unified-rec-pulse unified-rec-pulse--3" />
          </>
        )}

        {processing ? (
          <div className="unified-rec-spinner" />
        ) : (
          <svg
            className="unified-rec-icon"
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {recording ? (
              /* Stop icon (square) */
              <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
            ) : (
              /* Mic icon */
              <>
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </>
            )}
          </svg>
        )}
      </button>

      {/* Label */}
      <div className="unified-rec-label">
        {recording ? (
          <span className="unified-rec-recording-text">
            <span className="unified-rec-dot" />
            Recording — {formatTime(elapsed)}
          </span>
        ) : processing ? (
          <span className="unified-rec-processing-text">Transcribing…</span>
        ) : (
          <span>Tap to record conversation</span>
        )}
      </div>

      {/* Auto-detect info */}
      <p className="unified-rec-info">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        AI auto-detects Doctor vs Patient
      </p>
    </div>
  );
}
