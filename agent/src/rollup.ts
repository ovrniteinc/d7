import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
  addDoc,
  type Firestore,
} from "firebase/firestore";

export async function rollupAppUsage(db: Firestore, usageId: string) {
  const usageSnap = await getDoc(doc(db, "app_usage", usageId));
  if (!usageSnap.exists()) return;

  const usage = usageSnap.data() as {
    user_id: string;
    started_at: string;
    ended_at: string | null;
    duration_seconds: number | null;
    category: string;
  };

  if (!usage.ended_at || !usage.duration_seconds) return;

  const dateStr = usage.started_at.slice(0, 10);
  const category = usage.category || "neutral";
  const seconds = usage.duration_seconds;

  const activitySnap = await getDocs(
    query(
      collection(db, "sessions_activity"),
      where("user_id", "==", usage.user_id),
      where("activity_date", "==", dateStr),
    ),
  );

  const row = activitySnap.docs[0];
  const rowData = row?.data() as
    | { focus_seconds?: number; idle_seconds?: number; distraction_seconds?: number }
    | undefined;

  const focus = (rowData?.focus_seconds || 0) + (category === "work" ? seconds : 0);
  const idle = rowData?.idle_seconds || 0;
  const distraction =
    (rowData?.distraction_seconds || 0) + (category === "distraction" ? seconds : 0);
  const tracked = focus + idle + distraction;
  const score = tracked > 0 ? Math.round((focus / tracked) * 100) : 0;
  const now = new Date().toISOString();

  if (row) {
    await updateDoc(doc(db, "sessions_activity", row.id), {
      focus_seconds: focus,
      distraction_seconds: distraction,
      productivity_score: score,
      updated_at: now,
    });
    return;
  }

  await addDoc(collection(db, "sessions_activity"), {
    user_id: usage.user_id,
    activity_date: dateStr,
    focus_seconds: focus,
    idle_seconds: 0,
    distraction_seconds: distraction,
    productivity_score: score,
    updated_at: now,
  });
}
