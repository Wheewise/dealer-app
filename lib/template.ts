import { prisma } from "./db";

export async function renderTemplate(
  name: string,
  vars: Record<string, string>,
): Promise<{ subject: string; body: string } | null> {
  const template = await prisma.notificationTemplate.findUnique({
    where: { name },
  });
  if (!template) return null;

  let subject = template.subject;
  let body = template.body;
  for (const [key, value] of Object.entries(vars)) {
    const re = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    subject = subject.replace(re, value);
    body = body.replace(re, value);
  }

  return { subject, body };
}

export const DEFAULT_TEMPLATES = {
  "lead-notification": {
    subject: "New enquiry on {{vehicle}}",
    body: "Hi {{dealerName}},\n\nYou received a new enquiry from {{buyerName}} ({{buyerPhone}}) about {{vehicle}}.\n\nMessage: {{message}}\n\nLogin to your dashboard to respond.",
    type: "EMAIL" as const,
  },
  "welcome-dealer": {
    subject: "Welcome to Wheewise, {{dealerName}}!",
    body: "Hi {{dealerName}},\n\nWelcome to Wheewise! Your showroom is live at {{storeUrl}}.\n\nStart adding your inventory to get enquiries from buyers across India.",
    type: "EMAIL" as const,
  },
  "otp-message": {
    subject: "Your OTP is {{otp}}",
    body: "{{otp}} is your OTP for logging into Wheewise. Valid for 5 minutes. Do not share with anyone.",
    type: "SMS" as const,
  },
};
