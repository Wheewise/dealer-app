import { Stars } from "@/components/brand/Stars";
import { scoreToStars, scoreLabel } from "@/lib/trust-score";

type Props = {
  businessName: string;
  city: string;
  phone: string;
  bannerUrl: string | null;
  logoUrl: string | null;
  accent: string;
  gstVerified: boolean;
  trustScore: number;
  memberSinceYear: number;
  vehiclesInStock: number;
  waLink: string | null;
};

export function ShowcaseHero({
  businessName,
  city,
  phone,
  bannerUrl,
  logoUrl,
  accent,
  gstVerified,
  trustScore,
  memberSinceYear,
  vehiclesInStock,
  waLink,
}: Props) {
  return (
    <section className="bg-brand-ink relative overflow-hidden">
      <div
        className="relative h-[260px] w-full sm:h-[360px]"
        style={{ backgroundColor: bannerUrl ? undefined : accent }}
      >
        {bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bannerUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(135deg, ${accent} 0%, #1a1a1a 100%)`,
            }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/20" />
      </div>

      <div className="mx-auto -mt-32 max-w-6xl px-4 pb-10 sm:-mt-40 sm:px-6 sm:pb-14">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:gap-8">
          <div className="border-border-default bg-background relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl border-2 shadow-2xl sm:h-32 sm:w-32">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={businessName}
                className="h-full w-full object-cover"
              />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center text-4xl font-black text-white sm:text-5xl"
                style={{ backgroundColor: accent }}
              >
                {businessName[0]}
              </div>
            )}
          </div>

          <div className="flex-1 text-white">
            <div className="flex flex-wrap items-center gap-2">
              {gstVerified ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/95 px-2.5 py-1 text-[11px] font-bold tracking-wide text-white uppercase">
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  GST Verified
                </span>
              ) : null}
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-white/90 uppercase backdrop-blur">
                Member since {memberSinceYear}
              </span>
            </div>

            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-5xl">
              {businessName}
            </h1>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/85">
              <span className="inline-flex items-center gap-1.5">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                {city}
              </span>
              <div className="inline-flex items-center gap-2">
                <Stars stars={scoreToStars(trustScore)} />
                <span className="text-xs text-white/70">
                  {scoreLabel(trustScore)} · {trustScore}/100
                </span>
              </div>
              <span className="text-xs text-white/70">
                {vehiclesInStock} {vehiclesInStock === 1 ? "vehicle" : "vehicles"} in
                stock
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 sm:flex-col sm:gap-2.5">
            {waLink ? (
              <a
                href={waLink}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-emerald-600 hover:shadow-emerald-500/30"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                </svg>
                WhatsApp
              </a>
            ) : null}
            <a
              href={`tel:${phone}`}
              className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:shadow-xl"
              style={{ backgroundColor: accent }}
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                />
              </svg>
              Call
            </a>
            <a
              href="#inventory"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/30 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
            >
              Browse inventory ↓
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
