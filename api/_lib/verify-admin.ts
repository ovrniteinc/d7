import type { DecodedIdToken } from "firebase-admin/auth";
import { ApiError } from "./env";
import { firestoreGetDocument, firestoreString } from "./firestore-rest";
import { getAdminAuth } from "./firebase-admin";

/** Verify caller is an active admin using Firestore REST + the user's ID token (no Admin Firestore IAM needed). */
export async function assertAdminToken(idToken: string): Promise<DecodedIdToken> {
  const decoded = await getAdminAuth().verifyIdToken(idToken);

  const doc = await firestoreGetDocument("profiles", decoded.uid, idToken);
  if (!doc?.fields) {
    throw new ApiError(403, "Admin access required");
  }

  const role = firestoreString(doc.fields, "role");
  const status = firestoreString(doc.fields, "status");

  if (role !== "admin" || status !== "active") {
    throw new ApiError(403, "Admin access required");
  }

  return decoded;
}
