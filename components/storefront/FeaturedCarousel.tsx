"use client";

import { useCallback, useRef, useState } from "react";
import {
  PremiumListingCard,
  type PremiumListingCardData,
} from "@/components/storefront/PremiumListingCard";

type Props = {
  listings: PremiumListingCardData[];
  accent: string;
  fallbackHeadline?: string;
  isLoggedIn: boolean;
};

export function FeaturedCarousel({ listings, accent, fallbackHeadline, isLoggedIn }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const onScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  }, []);

  const scrollBy = (dx: number) => {
    scrollerRef.current?.scrollBy({ left: dx, behavior: "smooth" });
  };

  if (listings.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <div
            className="inline-block rounded-full px-3 py-1 text-[11px] font-bold tracking-widest text-white uppercase"
            style={{ backgroundColor: accent }}
          >
            {fallbackHeadline ?? "Featured"}
          </div>
          <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            Showroom highlights
          </h2>
        </div>
        <div className="hidden gap-2 sm:flex">
          <button
            type="button"
            onClick={() => scrollBy(-360)}
            disabled={atStart}
            className="border-border-default flex h-10 w-10 items-center justify-center rounded-full border bg-white transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            aria-label="Scroll left"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => scrollBy(360)}
            disabled={atEnd}
            className="border-border-default flex h-10 w-10 items-center justify-center rounded-full border bg-white transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            aria-label="Scroll right"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>
      </div>

      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {listings.map((l) => (
          <div key={l.id} className="snap-start">
            <PremiumListingCard
              listing={l}
              accent={accent}
              size="featured"
              isLoggedIn={isLoggedIn}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
