import { ApiError, getEnv, requireEnv } from "./env";

export interface ResendEmailInput {
  to: string;
  subject: string;
  html: string;
}

export function getResendFromAddress() {
  return getEnv("RESEND_FROM_EMAIL") || "District 7 <onboarding@resend.dev>";
}

export function getAppBaseUrl(appUrl?: string) {
  return (appUrl || getEnv("VITE_APP_URL") || "http://localhost:5173").replace(/\/$/, "");
}

function parseResendError(raw: string): string {
  try {
    const json = JSON.parse(raw) as { message?: string; error?: string; name?: string };
    const message = json.message || json.error || raw;

    if (/only send testing emails to your own email/i.test(message)) {
      return `${message} — With Resend's test sender (onboarding@resend.dev), invites only go to your Resend account email. Verify a domain at resend.com/domains and set RESEND_FROM_EMAIL to e.g. District 7 <notifications@yourdomain.com>.`;
    }

    if (/domain is not verified/i.test(message) || /not verified/i.test(message)) {
      return `${message} — Verify your sending domain in Resend and set RESEND_FROM_EMAIL to an address on that domain.`;
    }

    return message;
  } catch {
    return raw || "Unknown Resend error";
  }
}

export async function sendResendEmail(input: ResendEmailInput) {
  const resendKey = requireEnv("RESEND_API_KEY");
  const from = getResendFromAddress();

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: input.to.trim().toLowerCase(),
      subject: input.subject,
      html: input.html,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(502, parseResendError(text));
  }
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
