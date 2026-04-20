import { ref, onValue, query, orderByChild } from "firebase/database";
import { database } from "./config";
import type { VisitRecord, PatientSummary } from "../types/medical";

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

/**
 * Subscribe to all patients in Firebase.
 * Reads /patients/ root and extracts summary data for each patient.
 * Calls `callback` with an array of PatientSummary whenever data changes.
 */
export function subscribeToAllPatients(
  callback: (patients: PatientSummary[]) => void
): () => void {
  if (!database) {
    console.warn("[db] Firebase not available — skipping patient subscription.");
    callback([]);
    return () => {};
  }

  const patientsRef = ref(database, "patients");

  const unsubscribe = onValue(patientsRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      callback([]);
      return;
    }

    const patients: PatientSummary[] = [];

    for (const [patientId, patientData] of Object.entries(data as Record<string, any>)) {
      const visits = patientData.visits;
      if (!visits) {
        patients.push({
          patient_id: patientId,
          patient_name: null,
          last_visit_date: null,
          last_urgency: null,
          visit_count: 0,
        });
        continue;
      }

      const visitArray: VisitRecord[] = Object.values(visits);
      visitArray.sort(
        (a, b) =>
          new Date(b.processed_at).getTime() - new Date(a.processed_at).getTime()
      );

      const latest = visitArray[0];
      patients.push({
        patient_id: patientId,
        patient_name: latest?.patient_name || null,
        last_visit_date: latest?.processed_at || null,
        last_urgency: latest?.urgency || null,
        visit_count: visitArray.length,
      });
    }

    // Sort by most recent visit first
    patients.sort((a, b) => {
      if (!a.last_visit_date) return 1;
      if (!b.last_visit_date) return -1;
      return new Date(b.last_visit_date).getTime() - new Date(a.last_visit_date).getTime();
    });

    callback(patients);
  });

  return unsubscribe;
}
