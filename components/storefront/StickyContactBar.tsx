"use client";

type Props = {
  phone: string;
  waLink: string | null;
  accent: string;
};

export function StickyContactBar({ phone, waLink, accent }: Props) {
  return (
    <div className="border-border-default bg-background/95 fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 gap-2 border-t p-2 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur sm:hidden">
      {waLink ? (
        <a
          href={waLink}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center justify-center gap-1.5 rounded-full bg-emerald-500 px-3 py-2.5 text-xs font-semibold text-white"
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347" />
          </svg>
          WhatsApp
        </a>
      ) : (
        <span />
      )}
      <a
        href={`tel:${phone}`}
        className="inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2.5 text-xs font-semibold text-white"
        style={{ backgroundColor: accent }}
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        href="#contact"
        className="inline-flex items-center justify-center gap-1.5 rounded-full border border-zinc-900 px-3 py-2.5 text-xs font-semibold dark:border-zinc-100"
      >
        Enquire
      </a>
    </div>
  );
}
