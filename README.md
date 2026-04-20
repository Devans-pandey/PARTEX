# Healthcare Voice AI

A multilingual (Hindi, Marathi, Hinglish, English) voice capture system designed for Indian hospital OPDs. A doctor speaks with a patient, the system listens in real-time, transcribes the conversation using OpenAI Whisper, extracts structured medical data via Groq LLM (Llama 3.3 70B), stores it in Firebase Realtime Database under a unique Patient ID, and displays it live in a React dashboard — all in real-time.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    BROWSER (React + Vite)                    │
│                                                             │
│  ┌──────────┐  ┌────────────┐  ┌────────────────────────┐  │
│  │  Record   │  │  Patient   │  │   Visit History /      │  │
│  │  Button   │  │  Card      │  │   Missing Fields       │  │
│  └────┬─────┘  └─────▲──────┘  └───────────▲────────────┘  │
│       │ audio         │ onValue()           │               │
│       │ blob          │ listener            │               │
│       ▼               │                     │               │
│  ┌─────────────────── Firebase Realtime DB ─┘               │
│  │                     (live sync)                          │
└──┼──────────────────────────────────────────────────────────┘
   │ POST /transcribe
   │ POST /extract
   ▼
┌──────────────────────────────────────────────────────────────┐
│                 BACKEND (Python Flask)                        │
│                                                              │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────────┐   │
│  │  ffmpeg       │   │  Whisper     │   │  Groq LLM      │   │
│  │  (16kHz WAV)  │──▶│  (ASR)       │──▶│  (extraction)  │   │
│  └──────────────┘   └──────────────┘   └───────┬────────┘   │
│                                                 │            │
│                                    Firebase Admin SDK         │
│                                    (write visit record)      │
└──────────────────────────────────────────────────────────────┘
```

---

## Setup Instructions

### Prerequisites

- **Python 3.9+**
- **Node.js 18+**
- **ffmpeg** installed and on PATH
  - Windows: `choco install ffmpeg` or download from https://ffmpeg.org
  - macOS: `brew install ffmpeg`
  - Linux: `sudo apt-get install ffmpeg`
- A **Groq API key** (free at https://console.groq.com)
- A **Firebase project** with Realtime Database enabled (free tier)

### 1. Backend Setup

```bash
cd backend

# Create a virtual environment (recommended)
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Configure environment
# Edit .env and fill in:
#   GROQ_API_KEY=your_actual_groq_key
#   FIREBASE_DATABASE_URL=https://your-project.firebaseio.com
#
# Place your Firebase service account JSON as serviceAccountKey.json
# (Download from Firebase Console → Project Settings → Service Accounts)

# Start the server
python app.py
```

The backend runs on **http://localhost:5000**.

### 2. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Configure environment
# Edit .env and fill in:
#   VITE_FIREBASE_API_KEY=your_firebase_web_api_key
#   VITE_FIREBASE_DATABASE_URL=https://your-project.firebaseio.com
#   VITE_FIREBASE_PROJECT_ID=your-project-id
#   VITE_BACKEND_URL=http://localhost:5000

# Start dev server
npm run dev
```

The frontend runs on **http://localhost:5173**.

---

## How to Use

1. **Open the app** in your browser at http://localhost:5173
2. **Enter a Patient ID** or use the auto-generated one (e.g. PT-4829)
3. **Tap the big round microphone button** to start recording
4. **Speak naturally** — the doctor-patient conversation can be in Hindi, Marathi, English, or any mix
5. **Every 12 seconds**, the audio is automatically sent to the backend for processing
6. **Watch the Patient Card** update live with:
   - Patient name, age, gender
   - Symptoms (as pill badges)
   - Duration, diagnosis, medications
   - Urgency level (HIGH / MEDIUM / LOW)
7. **Check the yellow banner** if any critical information is missing — it tells you exactly what to ask the patient
8. **Tap the mic button again** to stop recording
9. **View past visits** in the history section below the patient card
10. **Expand the transcript** at the bottom to see the raw text

---

## Tech Stack

| Layer       | Technology              |
|-------------|------------------------|
| Frontend    | React + Vite (TypeScript) |
| Backend     | Python Flask            |
| ASR         | OpenAI Whisper (base)   |
| LLM         | Groq (Llama 3.3 70B)   |
| Database    | Firebase Realtime DB    |
| Styling     | Plain CSS               |

---

## Project Structure

```
PARTEX/
├── backend/
│   ├── app.py              ← Flask server with /transcribe and /extract
│   ├── transcribe.py       ← Whisper model loading + transcription
│   ├── extract.py          ← Groq LLM structured extraction
│   ├── requirements.txt
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── App.tsx          ← Main application layout
│   │   ├── main.tsx         ← React entry point
│   │   ├── styles.css       ← All styles (no frameworks)
│   │   ├── components/
│   │   │   ├── RecordButton.tsx
│   │   │   ├── PatientCard.tsx
│   │   │   ├── TranscriptPanel.tsx
│   │   │   ├── UrgencyBadge.tsx
│   │   │   ├── MissingFieldsBanner.tsx
│   │   │   └── VisitHistory.tsx
│   │   ├── firebase/
│   │   │   ├── config.ts
│   │   │   └── db.ts
│   │   └── types/
│   │       └── medical.ts
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── .env
└── README.md
```

---

## API Endpoints

### POST /transcribe
- **Input**: `multipart/form-data` with `audio` field (webm/wav blob)
- **Output**: `{ transcript, language_detected, chunk_id }`

### POST /extract
- **Input**: JSON `{ transcript, patient_id, chunk_id }`
- **Output**: Full structured medical record JSON + writes to Firebase

### GET /health
- **Output**: `{ status: "ok", firebase: true/false }`

---

## License

Built for a 9-hour hackathon. MIT License.
