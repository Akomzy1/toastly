"use client";

import * as React from "react";
import { Input } from "@/components/ui/field";

/**
 * Diaspora city picker — built against design/prototype/city-picker.slim.html.
 *
 * Search-as-you-type over a fixed list, grouped by country. Rows are 52px and
 * the clear control is a 44px square, per the prototype.
 *
 * Behaviour is unchanged from the select this replaces: the chosen city is
 * still what the per-city pool opening keys off, a closed city still falls
 * back to the back-home pool, and the row says so before you pick it.
 *
 * Deviation, flagged: the prototype's pool line uses #003F37, which is not a
 * step in the approved ramp. Using green-550, the nearest approved value.
 */

export type PickerCity = {
  slug: string;
  label: string;
  country: string;
  region: string | null;
  active: boolean;
};

export function CityPicker({
  cities,
  name = "diaspora_city",
  defaultValue,
}: {
  cities: PickerCity[];
  name?: string;
  defaultValue?: string | null;
}) {
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<string | null>(
    defaultValue ?? null,
  );

  const chosen = cities.find((c) => c.slug === selected) ?? null;

  // Array.from rather than spreading the Map iterator: this tsconfig targets
  // below ES2015 for iterables, so [...map.entries()] is a compile error.
  const groups = React.useMemo<[string, PickerCity[]][]>(() => {
    const q = query.trim().toLowerCase();
    const out = new Map<string, PickerCity[]>();
    for (const c of cities) {
      if (q && !`${c.label} ${c.region ?? ""}`.toLowerCase().includes(q)) continue;
      const list = out.get(c.country) ?? [];
      list.push(c);
      out.set(c.country, list);
    }
    return Array.from(out.entries());
  }, [cities, query]);

  const total = groups.reduce((n, [, list]) => n + list.length, 0);

  return (
    <div className="grid gap-3.5">
      <input type="hidden" name={name} value={chosen?.slug ?? ""} />

      <label className="grid gap-[7px] font-sans text-nav font-medium text-ink-900">
        City
        <span className="relative block">
          <span
            aria-hidden="true"
            className="absolute left-[14px] top-1/2 grid -translate-y-1/2 place-items-center"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="6.4" stroke="#828184" strokeWidth="1.6" />
              <path d="m16 16 4 4" stroke="#828184" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </span>
          <Input
            type="text"
            value={chosen ? `${chosen.label}, ${chosen.country}` : query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
            }}
            placeholder="Search metro areas"
            className="min-h-12 pl-10 pr-[42px]"
          />
          {chosen || query ? (
            <button
              type="button"
              aria-label="Clear city"
              onClick={() => {
                setQuery("");
                setSelected(null);
              }}
              className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center border-0 bg-transparent text-ui text-grey-600"
            >
              ✕
            </button>
          ) : null}
        </span>
      </label>

      {!chosen ? (
        <div className="grid gap-3">
          <p className="text-nav text-grey-600">
            {query.trim()
              ? `${total} ${total === 1 ? "metro matches" : "metros match"} “${query.trim()}”`
              : "Pick the metro area you live in. It sets which matching pool you see."}
          </p>

          <div className="overflow-hidden rounded-[14px] border border-ink-900/[.12] bg-white">
            {groups.map(([country, list]) => (
              <React.Fragment key={country}>
                <p className="border-b border-ink-900/[.07] bg-paper px-[14px] pb-2 pt-3 text-chip font-semibold uppercase tracking-[0.12em] text-grey-600">
                  {country}
                </p>
                {list.map((c) => (
                  <button
                    key={c.slug}
                    type="button"
                    onClick={() => {
                      setSelected(c.slug);
                      setQuery("");
                    }}
                    className="flex min-h-[52px] w-full items-center gap-2.5 border-0 border-b border-ink-900/[.07] bg-transparent px-[14px] py-3 text-left hover:bg-paper"
                  >
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="text-ui font-semibold text-ink-900">
                        {c.label}
                      </span>
                      {c.region ? (
                        <span className="text-chip text-grey-400">{c.region}</span>
                      ) : null}
                    </span>
                    {!c.active ? (
                      <span className="flex-shrink-0 rounded-sm border border-gold-600/30 bg-gold-50 px-[9px] py-[5px] text-chip font-semibold text-gold-800">
                        Pool not open
                      </span>
                    ) : null}
                  </button>
                ))}
              </React.Fragment>
            ))}

            {total === 0 ? (
              <p className="px-[14px] py-[18px] text-nav leading-relaxed text-grey-600">
                No metro on the list matches that. The United States, United
                Kingdom and Canada are seeded first; more countries are added as
                their pools open.
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="grid gap-3.5">
          <div className="grid gap-2 rounded-[14px] border border-green-500/[.32] bg-green-50 px-[15px] py-4">
            <div className="flex items-center gap-2.5">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="7" stroke="#00695C" strokeWidth="1.3" />
                <path d="m5 8.2 2 2 4-4.4" stroke="#00695C" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <p className="text-nav font-semibold text-green-550">
                {chosen.label}, {chosen.country}
              </p>
            </div>
            <p className="text-nav leading-relaxed text-green-550">
              {chosen.active
                ? `Your feed will draw from members in ${chosen.label} and from the back-home pool in Nigeria.`
                : `The ${chosen.label} pool isn't open yet, so your feed draws from the back-home pool in Nigeria until it is.`}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setQuery("");
            }}
            className="min-h-11 border-0 bg-transparent p-2.5 text-nav font-semibold text-green-500 underline underline-offset-4"
          >
            Choose a different city
          </button>
        </div>
      )}
    </div>
  );
}
