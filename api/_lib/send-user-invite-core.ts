import { assertAdminToken } from "./verify-admin";
import { escapeHtml, getAppBaseUrl, sendResendEmail } from "./resend";

export async function sendUserInviteCore(input: {
  token: string;
  email: string;
  name: string;
  tempPassword: string;
  appUrl?: string;
}) {
  await assertAdminToken(input.token);

  if (!input.email?.trim() || !input.name?.trim() || !input.tempPassword) {
    throw new Error("Missing email, name, or tempPassword");
  }

  const baseUrl = getAppBaseUrl(input.appUrl);
  const loginUrl = `${baseUrl}/login`;
  const safeName = escapeHtml(input.name);
  const safeEmail = escapeHtml(input.email.trim().toLowerCase());
  const safePassword = escapeHtml(input.tempPassword);

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

  await sendResendEmail({
    to: input.email,
    subject: "Your District 7 account is ready",
    html,
  });

  return { ok: true as const };
}
