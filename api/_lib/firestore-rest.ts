import { ApiError } from "./env";
import { getFirebaseProjectId } from "./project-id";

type FirestoreFields = Record<string, unknown>;

export function firestoreString(fields: FirestoreFields | undefined, key: string): string | undefined {
  const field = fields?.[key] as { stringValue?: string } | undefined;
  return field?.stringValue;
}

export function firestoreBoolean(fields: FirestoreFields | undefined, key: string): boolean | undefined {
  const field = fields?.[key] as { booleanValue?: boolean } | undefined;
  return field?.booleanValue;
}

export function firestoreMap(fields: FirestoreFields | undefined, key: string): FirestoreFields | undefined {
  const field = fields?.[key] as { mapValue?: { fields?: FirestoreFields } } | undefined;
  return field?.mapValue?.fields;
}

export async function firestoreGetDocument(collectionPath: string, docId: string, idToken: string) {
  const projectId = getFirebaseProjectId();
  const path = `${collectionPath}/${docId}`;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${idToken}` },
  });

  if (res.status === 404) return null;

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 403 || res.status === 401) {
      throw new ApiError(403, "Missing or insufficient permissions.");
    }
    throw new ApiError(502, `Firestore read failed: ${text.slice(0, 240)}`);
  }

  return (await res.json()) as { fields?: FirestoreFields; name?: string };
}
