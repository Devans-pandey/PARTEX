import { ref, onValue, query, orderByChild } from "firebase/database";
import { database } from "./config";
import type { VisitRecord } from "../types/medical";

/**
 * Subscribe to all visits for a given patient ID.
 * Calls `callback` with a sorted array (newest first) whenever data changes.
 * Returns an unsubscribe function.
 */
export function subscribeToVisits(
  patientId: string,
  callback: (visits: VisitRecord[]) => void
): () => void {
  // If Firebase is not initialized, return a no-op unsubscribe
  if (!database) {
    console.warn("[db] Firebase not available — skipping subscription.");
    callback([]);
    return () => {};
  }

  const visitsRef = query(
    ref(database, `patients/${patientId}/visits`),
    orderByChild("processed_at")
  );

  const unsubscribe = onValue(visitsRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      callback([]);
      return;
    }
    const visits: VisitRecord[] = Object.values(data);
    // Sort newest first
    visits.sort(
      (a, b) =>
        new Date(b.processed_at).getTime() - new Date(a.processed_at).getTime()
    );
    callback(visits);
  });

  return unsubscribe;
}
