import { initializeApp } from "firebase/app";
import { getDatabase, Database } from "firebase/database";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
};

let database: Database | null = null;

try {
  // Only initialize if a real database URL is provided
  if (
    firebaseConfig.databaseURL &&
    firebaseConfig.databaseURL.startsWith("https://")
  ) {
    const app = initializeApp(firebaseConfig);
    database = getDatabase(app);
    console.log("[Firebase] Initialized successfully.");
  } else {
    console.warn(
      "[Firebase] No valid database URL found. Running in offline mode."
    );
  }
} catch (err) {
  console.warn("[Firebase] Initialization failed:", err);
}

export { database };
