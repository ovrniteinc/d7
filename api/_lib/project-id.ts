import { getEnv } from "./env";
import { loadServiceAccount } from "./service-account";

export function getFirebaseProjectId(): string {
  const fromEnv = getEnv("VITE_FIREBASE_PROJECT_ID") || getEnv("FIREBASE_PROJECT_ID");
  if (fromEnv) return fromEnv;

  try {
    const sa = loadServiceAccount();
    if (sa.project_id) return sa.project_id;
  } catch {
    // fall through
  }

  throw new Error("Firebase project ID not configured (set VITE_FIREBASE_PROJECT_ID)");
}
