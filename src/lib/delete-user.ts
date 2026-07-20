import { auth } from "./firebase";

async function parseApiError(response: Response): Promise<string> {
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  if (data?.error) return data.error;
  return `Failed to delete Auth user (HTTP ${response.status})`;
}

/** Deletes the Firebase Auth account (call before removing Firestore profile). */
export async function deleteTeamUserAuth(userId: string, email?: string) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");

  const token = await user.getIdToken();
  const response = await fetch("/api/delete-user", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ userId, email }),
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }
}
