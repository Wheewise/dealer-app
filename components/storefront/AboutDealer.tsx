type Props = {
  businessName: string;
  city: string;
  phone: string;
  whatsapp: string | null;
  bio: string | null;
  memberSinceYear: number;
  accent: string;
};

export function AboutDealer({
  businessName,
  city,
  phone,
  whatsapp,
  bio,
  memberSinceYear,
  accent,
}: Props) {
  const body =
    bio?.trim() ||
    `${businessName} has been listing pre-owned vehicles on Wheewise since ${memberSinceYear}, serving buyers in and around ${city}. Every vehicle goes through standard documentation and ownership checks before being put up for sale.`;

  const chips = [
    { label: "Based in", value: city },
    { label: "Phone", value: phone },
    whatsapp ? { label: "WhatsApp", value: whatsapp } : null,
    { label: "Since", value: String(memberSinceYear) },
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="grid gap-8 sm:grid-cols-[1fr_2fr] sm:gap-12">
        <div>
          <div
            className="inline-block rounded-full px-3 py-1 text-[11px] font-bold tracking-widest text-white uppercase"
            style={{ backgroundColor: accent }}
          >
            About the dealership
          </div>
          <h2 className="mt-3 text-3xl leading-tight font-bold tracking-tight">
            Meet {businessName}
          </h2>
        </div>

        <div>
          <p className="text-base leading-relaxed text-zinc-700 sm:text-lg dark:text-zinc-300">
            {body}
          </p>

          <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {chips.map((c) => (
              <div key={c.label} className="border-border-default rounded-lg border p-3">
                <dt className="text-[10px] font-semibold tracking-widest text-zinc-500 uppercase">
                  {c.label}
                </dt>
                <dd className="mt-1 text-sm font-semibold">{c.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
