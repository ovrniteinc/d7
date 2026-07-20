import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ApiError } from "./_lib/env";
import { assertAdminToken } from "./_lib/verify-admin";
import { getAdminAuth } from "./_lib/firebase-admin";

function authErrorMessage(err: unknown): string {
  const e = err as { code?: string; message?: string };
  if (e.code === "auth/insufficient-permission" || /permission/i.test(e.message || "")) {
    return "Service account cannot delete Auth users. In Google Cloud → IAM, grant firebase-adminsdk@… the Firebase Authentication Admin role.";
  }
  return e.message || "Could not delete Firebase Auth user";
}

async function deleteAuthUser(userId: string, email?: string) {
  const auth = getAdminAuth();

  try {
    await auth.deleteUser(userId);
    return;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "auth/user-not-found" && email) {
      try {
        const byEmail = await auth.getUserByEmail(email.trim().toLowerCase());
        await auth.deleteUser(byEmail.uid);
        return;
      } catch (inner) {
        if ((inner as { code?: string }).code === "auth/user-not-found") return;
        throw inner;
      }
    }
    if (code === "auth/user-not-found") return;
    throw new ApiError(502, authErrorMessage(err));
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const token = authHeader.slice(7);
    const decoded = await assertAdminToken(token);
    const { userId, email } = req.body as { userId?: string; email?: string };

    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }
    if (userId === decoded.uid) {
      return res.status(400).json({ error: "Cannot delete yourself" });
    }

    await deleteAuthUser(userId, email);

    return res.status(200).json({ ok: true });
  } catch (error) {
    if (error instanceof ApiError) {
      console.error("[delete-user]", error.message);
      return res.status(error.status).json({ error: error.message });
    }
    console.error("[delete-user]", error);
    return res.status(500).json({ error: (error as Error).message });
  }
}
