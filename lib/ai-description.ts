type VehicleInput = {
  vehicleType: string;
  make: string;
  model: string;
  year: number;
  fuelType: string;
  transmission?: string | null;
  odometerKm: number;
  askingPrice: number;
  city: string;
};

const mockDescriptions = [
  "✨ Single-owner, meticulously maintained {{make}} {{model}}. Only {{odometer}} km driven — barely run-in! {{fuel}} engine delivers fantastic mileage. Priced at just ₹{{price}}, this is a steal for a {{year}} model. All papers clear, ready to drive home today. Available in {{city}}. 🚗💨",
  "🔥 Hot deal alert! {{year}} {{make}} {{model}} in pristine condition. Smooth {{transmission}} gearbox, {{fuel}}-powered efficiency, and just {{odometer}} km on the odo. Doctor-driven, no accidents, full service history available. Asking ₹{{price}} — first to see will buy! Located in {{city}}. 🏆",
  "🏁 Looking for a reliable {{fuel}} {{vehicleType}}? This {{year}} {{make}} {{model}} checks all boxes. {{odometer}} km, {{transmission}} transmission, spotless interior. Perfect for city commutes and weekend getaways. Price ₹{{price}} (negotiable for serious buyers). Come inspect in {{city}}! 🔑",
  "💎 Premium {{year}} {{make}} {{model}} — the one you've been waiting for. Only {{odometer}} km, {{fuel}} variant, {{transmission}} gearbox. No scratches, no repairs, just pure driving joy. Well-maintained with complete service records. Yours for ₹{{price}}. Based in {{city}}, test drive welcome! ⚡",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function formatPrice(n: number): string {
  if (n >= 100000) return `${(n / 100000).toFixed(1)} lakh`;
  return `${(n / 1000).toFixed(0)}k`;
}

function fillTemplate(template: string, input: VehicleInput): string {
  return template
    .replace(/\{\{make\}\}/g, input.make)
    .replace(/\{\{model\}\}/g, input.model)
    .replace(/\{\{year\}\}/g, String(input.year))
    .replace(/\{\{fuel\}\}/g, input.fuelType[0] + input.fuelType.slice(1).toLowerCase())
    .replace(
      /\{\{transmission\}\}/g,
      input.transmission
        ? input.transmission[0] + input.transmission.slice(1).toLowerCase()
        : "manual",
    )
    .replace(/\{\{odometer\}\}/g, input.odometerKm.toLocaleString("en-IN"))
    .replace(/\{\{price\}\}/g, formatPrice(input.askingPrice))
    .replace(/\{\{city\}\}/g, input.city)
    .replace(/\{\{vehicleType\}\}/g, input.vehicleType.toLowerCase());
}

export async function generateDescription(input: VehicleInput): Promise<string> {
  // Use OpenAI-compatible API if key is set
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    try {
      const prompt = `Write a short, enthusiastic, Hinglish-friendly marketing description for a used vehicle listing in India. Keep it under 200 characters. Include emojis. Vehicle: ${input.year} ${input.make} ${input.model}, ${input.fuelType}, ${input.transmission ?? "manual"}, ${input.odometerKm.toLocaleString("en-IN")} km, priced at ₹${input.askingPrice.toLocaleString("en-IN")}, located in ${input.city}.`;

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 200,
          temperature: 0.8,
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          choices: Array<{ message: { content: string } }>;
        };
        return data.choices[0]?.message?.content?.trim() ?? fallback(input);
      }
    } catch {
      // fall through to mock
    }
  }

  // Anthropic
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    try {
      const prompt = `Write a short, enthusiastic, Hinglish-friendly marketing description for a used vehicle listing in India. Keep it under 200 characters. Include emojis. Vehicle: ${input.year} ${input.make} ${input.model}, ${input.fuelType}, ${input.transmission ?? "manual"}, ${input.odometerKm.toLocaleString("en-IN")} km, priced at ₹${input.askingPrice.toLocaleString("en-IN")}, located in ${input.city}.`;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 200,
          temperature: 0.8,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          content: Array<{ text: string }>;
        };
        return data.content[0]?.text?.trim() ?? fallback(input);
      }
    } catch {
      // fall through to mock
    }
  }

  return fallback(input);
}

function fallback(input: VehicleInput): string {
  return fillTemplate(pick(mockDescriptions), input);
}

/**
 * Returns the human-supplied description if it's substantive (≥20 chars),
 * otherwise auto-generates one. The 20-char floor matches what dealers
 * actually type vs. placeholder values like "good condition".
 */
export async function ensureDescription(
  raw: string | null | undefined,
  vehicle: VehicleInput,
): Promise<string> {
  const trimmed = (raw ?? "").trim();
  if (trimmed.length >= 20) return trimmed;
  return generateDescription(vehicle);
}
