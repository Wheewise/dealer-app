type LeadSignals = {
  hasMessage: boolean;
  messageLength: number;
  hasEmail: boolean;
  isAuthenticated: boolean;
  phoneLooksValid: boolean;
};

export function scoreLead(s: LeadSignals): number {
  let score = 0;
  if (s.phoneLooksValid) score += 20;
  if (s.hasMessage) score += 15;
  if (s.messageLength >= 80) score += 15;
  if (s.hasEmail) score += 15;
  if (s.isAuthenticated) score += 35;
  return Math.min(score, 100);
}
