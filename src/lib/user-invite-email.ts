import { auth } from "./firebase";

async function parseApiError(response: Response): Promise<string> {
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  if (data?.error) return data.error;

  if (response.status === 404) {
    return "Email API not found. Restart the dev server (npm run dev) so /api routes load locally.";
  }

  return `Failed to send invite email (HTTP ${response.status})`;
}

export async function sendUserInviteEmail(input: {
  email: string;
  name: string;
  tempPassword: string;
}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");

  const token = await user.getIdToken();
  const appUrl = import.meta.env.VITE_APP_URL || window.location.origin;

  const response = await fetch("/api/send-user-invite", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      email: input.email,
      name: input.name,
      tempPassword: input.tempPassword,
      appUrl,
    }),
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }
}
