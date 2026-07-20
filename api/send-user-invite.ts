import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ApiError } from "./_lib/env";
import { sendUserInviteCore } from "./_lib/send-user-invite-core";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { email, name, tempPassword, appUrl } = req.body as {
      email?: string;
      name?: string;
      tempPassword?: string;
      appUrl?: string;
    };

    await sendUserInviteCore({
      token: authHeader.slice(7),
      email: email || "",
      name: name || "",
      tempPassword: tempPassword || "",
      appUrl,
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    if (error instanceof ApiError) {
      console.error("[send-user-invite]", error.message);
      return res.status(error.status).json({ error: error.message });
    }
    console.error("[send-user-invite]", error);
    return res.status(500).json({ error: (error as Error).message });
  }
}
