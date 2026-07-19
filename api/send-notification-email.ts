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
    await admin.auth().verifyIdToken(token);

    const { notificationId, appUrl } = req.body as { notificationId?: string; appUrl?: string };
    if (!notificationId) {
      return res.status(400).json({ error: "Missing notificationId" });
    }

    const db = admin.firestore();
    const notifSnap = await db.collection("notifications").doc(notificationId).get();
    if (!notifSnap.exists) {
      return res.status(404).json({ error: "Notification not found" });
    }

    const notif = notifSnap.data() as {
      user_id: string;
      type: string;
      title: string;
      body: string;
      link: string | null;
    };

    const profileSnap = await db.collection("profiles").doc(notif.user_id).get();
    if (!profileSnap.exists) {
      return res.status(404).json({ error: "Recipient not found" });
    }

    const profile = profileSnap.data() as {
      email: string;
      notif_prefs?: Record<string, boolean>;
    };

    if (profile.notif_prefs?.[notif.type] === false) {
      return res.status(200).json({ skipped: true });
    }

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return res.status(503).json({ error: "RESEND_API_KEY not set" });
    }

    const from = process.env.RESEND_FROM_EMAIL || "District 7 <onboarding@resend.dev>";
    const baseUrl = appUrl || process.env.VITE_APP_URL || "http://localhost:5173";
    const link = notif.link ? `${baseUrl.replace(/\/$/, "")}${notif.link}` : baseUrl;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: profile.email,
        subject: notif.title,
        html: `<div style="font-family:sans-serif;line-height:1.5;color:#111"><p>${notif.body}</p><p><a href="${link}">Open in District 7</a></p></div>`,
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
