import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ApiError } from "./_lib/env";
import {
  firestoreGetDocument,
  firestoreMap,
  firestoreString,
} from "./_lib/firestore-rest";
import { verifyAuthToken } from "./_lib/firebase-admin";
import { getAppBaseUrl, sendResendEmail } from "./_lib/resend";

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
    await verifyAuthToken(token);

    const { notificationId, appUrl } = req.body as { notificationId?: string; appUrl?: string };
    if (!notificationId) {
      return res.status(400).json({ error: "Missing notificationId" });
    }

    const notifDoc = await firestoreGetDocument("notifications", notificationId, token);
    if (!notifDoc?.fields) {
      return res.status(404).json({ error: "Notification not found" });
    }

    const recipientId = firestoreString(notifDoc.fields, "user_id");
    const notifType = firestoreString(notifDoc.fields, "type");
    const title = firestoreString(notifDoc.fields, "title");
    const body = firestoreString(notifDoc.fields, "body");
    const link = firestoreString(notifDoc.fields, "link");

    if (!recipientId || !title || !body) {
      return res.status(404).json({ error: "Notification not found" });
    }

    const profileDoc = await firestoreGetDocument("profiles", recipientId, token);
    if (!profileDoc?.fields) {
      return res.status(404).json({ error: "Recipient not found" });
    }

    const email = firestoreString(profileDoc.fields, "email");
    if (!email) {
      return res.status(404).json({ error: "Recipient not found" });
    }

    const prefs = firestoreMap(profileDoc.fields, "notif_prefs");
    if (notifType && prefs) {
      const prefField = prefs[notifType] as { booleanValue?: boolean } | undefined;
      if (prefField?.booleanValue === false) {
        return res.status(200).json({ skipped: true });
      }
    }

    const baseUrl = getAppBaseUrl(appUrl);
    const href = link ? `${baseUrl}${link}` : baseUrl;

    await sendResendEmail({
      to: email,
      subject: title,
      html: `<div style="font-family:sans-serif;line-height:1.5;color:#111"><p>${body}</p><p><a href="${href}">Open in District 7</a></p></div>`,
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    if (error instanceof ApiError) {
      console.error("[send-notification-email]", error.message);
      return res.status(error.status).json({ error: error.message });
    }
    console.error("[send-notification-email]", error);
    return res.status(500).json({ error: (error as Error).message });
  }
}
