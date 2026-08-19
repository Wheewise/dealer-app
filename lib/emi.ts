export interface EmiInput {
  principal: number;
  annualRate: number;
  tenureMonths: number;
}

export interface EmiResult {
  monthlyEmi: number;
  totalInterest: number;
  totalPayable: number;
}

export function calculateEmi({
  principal,
  annualRate,
  tenureMonths,
}: EmiInput): EmiResult {
  const n = tenureMonths;

  if (annualRate === 0 || principal === 0) {
    const monthlyEmi = Math.round(principal / n);
    return {
      monthlyEmi,
      totalInterest: 0,
      totalPayable: monthlyEmi * n,
    };
  }

  const monthlyRate = annualRate / 12 / 100;

  const emi =
    (principal * monthlyRate * Math.pow(1 + monthlyRate, n)) /
    (Math.pow(1 + monthlyRate, n) - 1);

  const monthlyEmi = Math.round(emi);
  const totalPayable = monthlyEmi * n;
  const totalInterest = totalPayable - principal;

  return {
    monthlyEmi,
    totalInterest,
    totalPayable,
  };
}
