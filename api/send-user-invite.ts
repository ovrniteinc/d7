import type { VercelRequest, VercelResponse } from "@vercel/node";
import admin from "firebase-admin";

function initAdmin() {
  if (admin.apps.length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return;
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(raw)),
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  initAdmin();
  if (!admin.apps.length) {
    return res.status(503).json({ error: "Email service not configured" });
  }

  try {
    const token = authHeader.slice(7);
    const decoded = await admin.auth().verifyIdToken(token);
    const db = admin.firestore();

    const adminSnap = await db.collection("profiles").doc(decoded.uid).get();
    const adminProfile = adminSnap.data() as { role?: string; status?: string } | undefined;
    if (!adminProfile || adminProfile.role !== "admin" || adminProfile.status !== "active") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const { email, name, tempPassword, appUrl } = req.body as {
      email?: string;
      name?: string;
      tempPassword?: string;
      appUrl?: string;
    };

    if (!email || !name || !tempPassword) {
      return res.status(400).json({ error: "Missing email, name, or tempPassword" });
    }

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return res.status(503).json({ error: "RESEND_API_KEY not set" });
    }

    const from = process.env.RESEND_FROM_EMAIL || "District 7 <onboarding@resend.dev>";
    const baseUrl = (appUrl || process.env.VITE_APP_URL || "http://localhost:5173").replace(/\/$/, "");
    const loginUrl = `${baseUrl}/login`;
    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email.trim().toLowerCase());
    const safePassword = escapeHtml(tempPassword);

    const html = `
      <div style="font-family:sans-serif;line-height:1.6;color:#111;max-width:560px">
        <p>Hi ${safeName},</p>
        <p>Your District 7 account is ready. Use the credentials below to sign in:</p>
        <div style="background:#f4f4f5;border-radius:12px;padding:16px 20px;margin:20px 0">
          <p style="margin:0 0 8px"><strong>Email:</strong> ${safeEmail}</p>
          <p style="margin:0"><strong>Temporary password:</strong> ${safePassword}</p>
        </div>
        <p><a href="${loginUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">Sign in to District 7</a></p>
        <p style="color:#555;font-size:14px">On your first login you will be asked to set a new password.</p>
        <p style="color:#888;font-size:12px">If you did not expect this email, you can ignore it.</p>
      </div>
    `;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: email.trim().toLowerCase(),
        subject: "Your District 7 account is ready",
        html,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(502).json({ error: text });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
}
