import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const fromAddr = process.env.RESEND_FROM ?? "Wheewise <leads@wheewise.in>";

export const resend = apiKey ? new Resend(apiKey) : null;

export async function sendEmail(to: string, subject: string, text: string) {
  if (!resend) return;
  try {
    await resend.emails.send({
      from: fromAddr,
      to,
      subject,
      text,
    });
  } catch (error) {
    console.error("Failed to send email:", error);
  }
}

export async function sendLeadNotification({
  to,
  dealerName,
  vehicle,
  buyerName,
  buyerPhone,
  buyerEmail,
  message,
  dashboardUrl,
}: {
  to: string;
  dealerName: string;
  vehicle: string;
  buyerName: string;
  buyerPhone: string;
  buyerEmail?: string | null;
  message?: string | null;
  dashboardUrl: string;
}) {
  if (!resend) return;
  const text = [
    `Hi ${dealerName},`,
    "",
    `New enquiry on your ${vehicle}:`,
    "",
    `Name: ${buyerName}`,
    `Phone: ${buyerPhone}`,
    buyerEmail ? `Email: ${buyerEmail}` : null,
    message ? `\nMessage:\n${message}` : null,
    "",
    `View in dashboard: ${dashboardUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    await resend.emails.send({
      from: fromAddr,
      to,
      subject: `New lead — ${vehicle}`,
      text,
    });
  } catch {
    // log later
  }
}
