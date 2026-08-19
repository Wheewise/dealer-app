"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

const TYPE_CHIPS = [
  { label: "All", value: null, enabled: true },
  { label: "Cars", value: "CAR", enabled: true },
  { label: "Bikes", value: "BIKE", enabled: true },
  { label: "Scooters", value: "SCOOTER", enabled: false },
  { label: "Autos", value: "AUTO", enabled: false },
  { label: "Commercial", value: "COMMERCIAL", enabled: false },
] as const;

const FUEL_OPTIONS = [
  { label: "Petrol", value: "PETROL" },
  { label: "Diesel", value: "DIESEL" },
  { label: "Electric", value: "ELECTRIC" },
  { label: "CNG", value: "CNG" },
  { label: "Hybrid", value: "HYBRID" },
] as const;

const CONDITION_OPTIONS = [
  { label: "A (Excellent)", value: "A" },
  { label: "B (Good)", value: "B" },
  { label: "C (Fair)", value: "C" },
] as const;

const SORT_OPTIONS = [
  { label: "Newest first", value: "newest" },
  { label: "Price: Low to High", value: "price_asc" },
  { label: "Price: High to Low", value: "price_desc" },
  { label: "Year: Newest first", value: "year_desc" },
] as const;

const ADVANCED_FILTER_KEYS = [
  "minPrice",
  "maxPrice",
  "yearMin",
  "yearMax",
  "fuel",
  "condition",
  "city",
] as const;

function SkeletonGrid() {
  return (
    <div
      className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4"
      aria-hidden="true"
    >
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="animate-pulse overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
          <div className="aspect-[4/3] bg-zinc-800" />
          <div className="space-y-2 p-4">
            <div className="h-4 w-3/4 rounded bg-zinc-800" />
            <div className="h-3 w-1/2 rounded bg-zinc-800" />
            <div className="h-5 w-1/3 rounded bg-zinc-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function BrowseControls({
  cities,
  yearOptions,
  total,
  children,
}: {
  cities: string[];
  yearOptions: number[];
  total: number;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const currentSearch = searchParams.get("search") ?? "";
  const [searchText, setSearchText] = useState(currentSearch);
  // Re-sync the input when the URL's search param changes from elsewhere
  // (back/forward nav, a chip reset) — setState-during-render is the
  // React-recommended way to adjust state in response to a prop change,
  // rather than an effect that would cause an extra render pass.
  const [syncedSearch, setSyncedSearch] = useState(currentSearch);
  if (currentSearch !== syncedSearch) {
    setSyncedSearch(currentSearch);
    setSearchText(currentSearch);
  }

  const navigate = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      params.delete("page");
      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  // Debounce free-text search into the URL — real-time-feeling without a
  // request per keystroke.
  useEffect(() => {
    if (searchText === currentSearch) return;
    const t = setTimeout(() => {
      navigate((params) => {
        if (searchText.trim()) params.set("search", searchText.trim());
        else params.delete("search");
      });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);

  const activeType = searchParams.get("type");
  const activeSort = searchParams.get("sort") ?? "newest";
  const activeFuels = new Set((searchParams.get("fuel") ?? "").split(",").filter(Boolean));
  const activeConditions = new Set(
    (searchParams.get("condition") ?? "").split(",").filter(Boolean),
  );

  const [draftMinPrice, setDraftMinPrice] = useState(searchParams.get("minPrice") ?? "");
  const [draftMaxPrice, setDraftMaxPrice] = useState(searchParams.get("maxPrice") ?? "");
  const [draftYearMin, setDraftYearMin] = useState(searchParams.get("yearMin") ?? "");
  const [draftYearMax, setDraftYearMax] = useState(searchParams.get("yearMax") ?? "");
  const [draftFuels, setDraftFuels] = useState<Set<string>>(activeFuels);
  const [draftConditions, setDraftConditions] = useState<Set<string>>(activeConditions);
  const [draftCity, setDraftCity] = useState(searchParams.get("city") ?? "");

  function openDrawer() {
    // Seed drafts from the current URL each time it's opened so the panel
    // never shows stale edits from a previous, cancelled session.
    setDraftMinPrice(searchParams.get("minPrice") ?? "");
    setDraftMaxPrice(searchParams.get("maxPrice") ?? "");
    setDraftYearMin(searchParams.get("yearMin") ?? "");
    setDraftYearMax(searchParams.get("yearMax") ?? "");
    setDraftFuels(new Set(activeFuels));
    setDraftConditions(new Set(activeConditions));
    setDraftCity(searchParams.get("city") ?? "");
    setDrawerOpen(true);
  }

  function applyDrawer() {
    navigate((params) => {
      if (draftMinPrice) params.set("minPrice", draftMinPrice);
      else params.delete("minPrice");
      if (draftMaxPrice) params.set("maxPrice", draftMaxPrice);
      else params.delete("maxPrice");
      if (draftYearMin) params.set("yearMin", draftYearMin);
      else params.delete("yearMin");
      if (draftYearMax) params.set("yearMax", draftYearMax);
      else params.delete("yearMax");
      if (draftFuels.size > 0) params.set("fuel", [...draftFuels].join(","));
      else params.delete("fuel");
      if (draftConditions.size > 0) params.set("condition", [...draftConditions].join(","));
      else params.delete("condition");
      if (draftCity) params.set("city", draftCity);
      else params.delete("city");
    });
    setDrawerOpen(false);
  }

  function resetDrawer() {
    setDraftMinPrice("");
    setDraftMaxPrice("");
    setDraftYearMin("");
    setDraftYearMax("");
    setDraftFuels(new Set());
    setDraftConditions(new Set());
    setDraftCity("");
  }

  const advancedActiveCount = ADVANCED_FILTER_KEYS.filter((k) => searchParams.get(k)).length;
  const hasAnyFilters = Boolean(
    currentSearch || activeType || advancedActiveCount > 0 || activeSort !== "newest",
  );

  function clearAll() {
    startTransition(() => {
      router.push(pathname, { scroll: false });
    });
  }

  function toggleDraftSet(set: Set<string>, setter: (s: Set<string>) => void, value: string) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  }

  return (
    <div>
      {/* Search bar */}
      <div className="relative mt-6">
        <input
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search by make, model or location..."
          className="block w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 pr-10 text-sm text-white placeholder-zinc-500 outline-none focus:border-red-600/50 focus:ring-2 focus:ring-red-600/20"
        />
        {searchText ? (
          <button
            type="button"
            onClick={() => setSearchText("")}
            aria-label="Clear search"
            className="absolute top-1/2 right-3 -translate-y-1/2 text-zinc-500 hover:text-white"
          >
            ✕
          </button>
        ) : null}
      </div>

      {/* Type chips — horizontally scrollable on mobile */}
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap">
        {TYPE_CHIPS.map((chip) => {
          const active = (activeType ?? null) === chip.value;
          if (!chip.enabled) {
            return (
              <span
                key={chip.label}
                title="Coming soon"
                className="shrink-0 cursor-not-allowed rounded-full border border-zinc-800 px-4 py-1.5 text-sm whitespace-nowrap text-zinc-600"
              >
                {chip.label}
              </span>
            );
          }
          return (
            <button
              key={chip.label}
              type="button"
              onClick={() =>
                navigate((params) => {
                  if (chip.value) params.set("type", chip.value);
                  else params.delete("type");
                })
              }
              className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
                active
                  ? "border-red-600 bg-red-600 text-white"
                  : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700 hover:text-white"
              }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* Filters / Sort / results row */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openDrawer}
            className="inline-flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:border-zinc-700"
          >
            {isPending ? (
              <span
                className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-600 border-t-white"
                aria-hidden="true"
              />
            ) : null}
            Filters
            {advancedActiveCount > 0 ? (
              <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {advancedActiveCount}
              </span>
            ) : null}
          </button>

          <select
            value={activeSort}
            onChange={(e) =>
              navigate((params) => {
                if (e.target.value === "newest") params.delete("sort");
                else params.set("sort", e.target.value);
              })
            }
            className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-red-600/50"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="text-sm text-zinc-500">
          {isPending ? (
            <span className="text-zinc-400">Searching…</span>
          ) : (
            <>
              {total === 0 && currentSearch ? (
                <span>No vehicles found for &quot;{currentSearch}&quot;</span>
              ) : (
                <span>Showing {total} vehicle{total === 1 ? "" : "s"}</span>
              )}
              {hasAnyFilters ? (
                <button
                  type="button"
                  onClick={clearAll}
                  className="ml-3 font-medium text-red-500 hover:text-red-400"
                >
                  Clear filters
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* Results */}
      <section className="py-8">{isPending ? <SkeletonGrid /> : children}</section>

      {/* Filter drawer — bottom sheet on mobile, centered panel on desktop */}
      {drawerOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl border-t border-zinc-800 bg-zinc-950 p-5 sm:max-w-md sm:rounded-2xl sm:border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Filters</h2>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close filters"
                className="text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="mt-4">
              <h3 className="text-sm font-semibold text-white">Price range (₹)</h3>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  placeholder="Min"
                  value={draftMinPrice}
                  onChange={(e) => setDraftMinPrice(e.target.value)}
                  className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-red-600/50"
                />
                <span className="text-zinc-500">–</span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  placeholder="Max"
                  value={draftMaxPrice}
                  onChange={(e) => setDraftMaxPrice(e.target.value)}
                  className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-red-600/50"
                />
              </div>
            </div>

            <div className="mt-5">
              <h3 className="text-sm font-semibold text-white">Year</h3>
              <div className="mt-2 flex items-center gap-2">
                <select
                  value={draftYearMin}
                  onChange={(e) => setDraftYearMin(e.target.value)}
                  className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-red-600/50"
                >
                  <option value="">From</option>
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <span className="text-zinc-500">–</span>
                <select
                  value={draftYearMax}
                  onChange={(e) => setDraftYearMax(e.target.value)}
                  className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-red-600/50"
                >
                  <option value="">To</option>
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-5">
              <h3 className="text-sm font-semibold text-white">Fuel type</h3>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {FUEL_OPTIONS.map((f) => (
                  <label
                    key={f.value}
                    className="flex items-center gap-2 text-sm text-zinc-300"
                  >
                    <input
                      type="checkbox"
                      checked={draftFuels.has(f.value)}
                      onChange={() => toggleDraftSet(draftFuels, setDraftFuels, f.value)}
                      className="accent-red-600"
                    />
                    {f.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <h3 className="text-sm font-semibold text-white">Condition</h3>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {CONDITION_OPTIONS.map((c) => (
                  <label
                    key={c.value}
                    className="flex items-center gap-2 text-sm text-zinc-300"
                  >
                    <input
                      type="checkbox"
                      checked={draftConditions.has(c.value)}
                      onChange={() =>
                        toggleDraftSet(draftConditions, setDraftConditions, c.value)
                      }
                      className="accent-red-600"
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            </div>

            {cities.length > 0 ? (
              <div className="mt-5">
                <h3 className="text-sm font-semibold text-white">Location</h3>
                <select
                  value={draftCity}
                  onChange={(e) => setDraftCity(e.target.value)}
                  className="mt-2 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-red-600/50"
                >
                  <option value="">All cities</option>
                  {cities.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={resetDrawer}
                className="flex-1 rounded-md border border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-900"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={applyDrawer}
                className="flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Apply filters
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
