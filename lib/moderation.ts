// Simple content moderation for Wheewise MVP
// In a real application, this would call a Cloudflare Worker AI model or an external API like Perspective API.

const BAD_WORDS = new Set([
  "spam",
  "scam",
  "fake",
  "fraud",
  "buy followers",
  // Add more as needed
]);

const SENSITIVE_PATTERNS = [
  // Basic phone number detection (just an example, since some users might put phone numbers in descriptions)
  // We might want to allow this for dealers, but block for general community posts.
  /\b\d{10}\b/,
];

export interface ModerationResult {
  isApproved: boolean;
  reason?: string;
  flaggedWords?: string[];
}

export async function moderateContent(text: string): Promise<ModerationResult> {
  if (!text) return { isApproved: true };

  const lowerText = text.toLowerCase();
  const flaggedWords: string[] = [];

  for (const word of Array.from(BAD_WORDS)) {
    if (lowerText.includes(word)) {
      flaggedWords.push(word);
    }
  }

  if (flaggedWords.length > 0) {
    return {
      isApproved: false,
      reason: "Contains inappropriate language or spam.",
      flaggedWords,
    };
  }

  // Check for sensitive patterns
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(text)) {
      return {
        isApproved: false,
        reason:
          "Contains potentially sensitive information (e.g., phone numbers outside of designated fields).",
      };
    }
  }

  return { isApproved: true };
}
