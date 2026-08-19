// Unified notification dispatcher: fans out a message across configured channels.
// Channel failures are isolated — one channel down doesn't prevent the others.

import { sendEmail } from "./email";
import { sendSms } from "./sms-provider";

export type NotificationType =
  | "ENQUIRY_RECEIVED"
  | "PAYOUT_APPROVED"
  | "INSPECTION_SCHEDULED"
  | "TEST_DRIVE_REQUESTED"
  | "SYSTEM_ALERT";

export interface NotificationPayload {
  toEmail?: string;
  toPhone?: string;
  subject: string;
  body: string;
  type: NotificationType;
}

export interface DispatchResult {
  email: "sent" | "skipped" | "failed";
  sms: "sent" | "skipped" | "failed";
}

export async function dispatchNotification(
  payload: NotificationPayload,
): Promise<DispatchResult> {
  const result: DispatchResult = { email: "skipped", sms: "skipped" };

  const [emailRes, smsRes] = await Promise.allSettled([
    payload.toEmail
      ? sendEmail(payload.toEmail, payload.subject, payload.body).then(() => "sent")
      : Promise.resolve("skipped"),
    payload.toPhone
      ? sendSms(payload.toPhone, payload.body).then(() => "sent")
      : Promise.resolve("skipped"),
  ]);

  result.email =
    emailRes.status === "fulfilled" ? (emailRes.value as "sent" | "skipped") : "failed";
  result.sms =
    smsRes.status === "fulfilled" ? (smsRes.value as "sent" | "skipped") : "failed";

  if (emailRes.status === "rejected") {
    console.error("[notifications] email failed", emailRes.reason);
  }
  if (smsRes.status === "rejected") {
    console.error("[notifications] sms failed", smsRes.reason);
  }
  return result;
}
