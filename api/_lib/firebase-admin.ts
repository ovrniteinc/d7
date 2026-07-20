import admin from "firebase-admin";
import { loadServiceAccount } from "./service-account";

export function ensureAdminInitialized(): admin.app.App {
  if (admin.apps.length) return admin.app();

  const parsed = loadServiceAccount();
  admin.initializeApp({
    credential: admin.credential.cert(parsed),
    projectId: parsed.project_id,
  });

  return admin.app();
}

export function getAdminDb() {
  ensureAdminInitialized();
  return admin.firestore();
}

export function getAdminAuth() {
  ensureAdminInitialized();
  return admin.auth();
}

export async function verifyAuthToken(token: string) {
  ensureAdminInitialized();
  return getAdminAuth().verifyIdToken(token);
}
