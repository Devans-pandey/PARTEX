import { ref, onValue, query, orderByChild } from "firebase/database";
import { database } from "./config";
import type { VisitRecord, PatientSummary, Problem, ProblemVisit, ConversationTurn } from "../types/medical";

/**
 * Subscribe to all visits for a given patient ID (legacy schema).
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
 * Now reads from both problems/ (new) and visits/ (legacy) schemas.
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
      let latestDate: string | null = null;
      let latestUrgency: "low" | "medium" | "high" | null = null;
      let latestName: string | null = null;
      let totalVisits = 0;

      // Check problems (new schema)
      const problems = patientData.problems;
      if (problems) {
        for (const prob of Object.values(problems) as any[]) {
          const visits = prob.visits;
          if (!visits) continue;

          const visitArray = Object.values(visits) as any[];
          totalVisits += visitArray.length;

          for (const v of visitArray) {
            const date = v.processed_at;
            if (date && (!latestDate || date > latestDate)) {
              latestDate = date;
              const ext = v.extracted || {};
              latestUrgency = ext.urgency || null;
              if (ext.patient_name) latestName = ext.patient_name;
            }
          }
        }
      }

      // Check legacy visits
      const legacyVisits = patientData.visits;
      if (legacyVisits) {
        const visitArray = Object.values(legacyVisits) as any[];
        totalVisits += visitArray.length;

        for (const v of visitArray) {
          const date = v.processed_at;
          if (date && (!latestDate || date > latestDate)) {
            latestDate = date;
            latestUrgency = v.urgency || null;
            if (v.patient_name) latestName = v.patient_name;
          }
        }
      }

      patients.push({
        patient_id: patientId,
        patient_name: latestName,
        last_visit_date: latestDate,
        last_urgency: latestUrgency,
        visit_count: totalVisits,
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

/**
 * Subscribe to all problems for a given patient.
 * Reads from /patients/{id}/problems/ and returns structured Problem objects.
 */
export function subscribeToProblems(
  patientId: string,
  callback: (problems: Problem[]) => void
): () => void {
  if (!database) {
    callback([]);
    return () => {};
  }

  const problemsRef = ref(database, `patients/${patientId}/problems`);

  const unsubscribe = onValue(problemsRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      callback([]);
      return;
    }

    const problems: Problem[] = [];

    for (const [probId, probData] of Object.entries(data as Record<string, any>)) {
      const visits = probData.visits || {};
      const visitArray = Object.values(visits) as any[];
      const visitCount = visitArray.length;

      // Find latest visit
      let latestVisit: any = null;
      for (const v of visitArray) {
        if (!latestVisit || (v.processed_at && v.processed_at > (latestVisit.processed_at || ""))) {
          latestVisit = v;
        }
      }

      const latestExtracted = latestVisit?.extracted || {};

      problems.push({
        problem_id: probId,
        label: probData.label || "Unknown",
        created_at: probData.created_at || "",
        status: probData.status || "active",
        visit_count: visitCount,
        last_visit_date: latestVisit?.processed_at || "",
        last_urgency: latestExtracted.urgency || null,
        last_symptoms: latestExtracted.symptoms || [],
        last_diagnosis: latestExtracted.diagnosis || null,
      });
    }

    // Sort by last visit date (most recent first)
    problems.sort((a, b) => {
      if (!a.last_visit_date) return 1;
      if (!b.last_visit_date) return -1;
      return b.last_visit_date.localeCompare(a.last_visit_date);
    });

    callback(problems);
  });

  return unsubscribe;
}

/**
 * Subscribe to all visits within a specific problem.
 */
export function subscribeToProblemVisits(
  patientId: string,
  problemId: string,
  callback: (visits: ProblemVisit[]) => void
): () => void {
  if (!database) {
    callback([]);
    return () => {};
  }

  const visitsRef = ref(
    database,
    `patients/${patientId}/problems/${problemId}/visits`
  );

  const unsubscribe = onValue(visitsRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      callback([]);
      return;
    }

    const visits: ProblemVisit[] = [];

    for (const [visitId, visitData] of Object.entries(data as Record<string, any>)) {
      // Normalize turns
      const rawTurns = visitData.turns || [];
      const turns: ConversationTurn[] = (Array.isArray(rawTurns) ? rawTurns : Object.values(rawTurns)).map(
        (t: any, i: number) => ({
          id: t.id || `turn_${i}`,
          speaker: t.speaker || "patient",
          transcript: t.transcript || t.text || "",
          timestamp: t.timestamp || visitData.processed_at || "",
        })
      );

      visits.push({
        visit_id: visitId,
        raw_transcript: visitData.raw_transcript || "",
        turns,
        extracted: visitData.extracted || {},
        processed_at: visitData.processed_at || "",
      });
    }

    // Sort newest first
    visits.sort((a, b) => b.processed_at.localeCompare(a.processed_at));

    callback(visits);
  });

  return unsubscribe;
}
