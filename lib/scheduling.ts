/**
 * Time-zone-aware Gist scheduling (Prompt 11).
 *
 * The Diaspora page already promises this in public copy: "Gist sessions are
 * offered at times that are reasonable at both ends — not 3am in Lagos
 * because it suited Houston. Your match sees your local time, you see theirs,
 * and the app suggests the overlap."
 *
 * This module is the whole of that promise and nothing more. It proposes
 * windows. It does not book, does not remind on its own behalf, and does not
 * message anyone — CLAUDE.md's rule that agents belong in the infrastructure,
 * never in the intimacy.
 *
 * The 18-minute box and extend-once rule are untouched; see lib/gist.ts.
 *
 * No dependency: Intl carries the whole time-zone database already.
 */

/** Waking hours, local to each side. Deliberately generous at both ends. */
export const WAKING_START_HOUR = 8;
export const WAKING_END_HOUR = 22;

/** Fallback when a member has not set a zone. Never a gate — see below. */
export const DEFAULT_TIME_ZONE = "Africa/Lagos";

/**
 * The local hour (0–23) an instant falls on in a given zone.
 *
 * Returns null for a zone Intl rejects, so one bad value stored years ago
 * cannot throw inside a page render.
 */
export function localHour(instant: Date, timeZone: string): number | null {
  try {
    const hour = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      hour12: false,
    }).format(instant);
    const n = Number(hour);
    return Number.isFinite(n) ? n % 24 : null;
  } catch {
    return null;
  }
}

/** "14:30" in that zone, for showing both clocks side by side. */
export function localTime(instant: Date, timeZone: string): string | null {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(instant);
  } catch {
    return null;
  }
}

/** "Fri 19 Sep" in that zone — a window can land on different days per side. */
export function localDay(instant: Date, timeZone: string): string | null {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone,
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(instant);
  } catch {
    return null;
  }
}

export type BothClocks = {
  instant: string;
  yours: { time: string; day: string; zone: string } | null;
  theirs: { time: string; day: string; zone: string } | null;
};

/**
 * One instant, rendered in both members' zones.
 *
 * Either side may be null: a member who has not set a zone simply sees one
 * clock. Scheduling still works — it is a display gap, not a blocker.
 */
export function bothClocks(
  instant: Date,
  yourZone: string | null,
  theirZone: string | null,
): BothClocks {
  const side = (zone: string | null) => {
    if (!zone) return null;
    const time = localTime(instant, zone);
    const day = localDay(instant, zone);
    return time && day ? { time, day, zone } : null;
  };
  return {
    instant: instant.toISOString(),
    yours: side(yourZone),
    theirs: side(theirZone),
  };
}

export function isWakingHour(instant: Date, timeZone: string): boolean {
  const h = localHour(instant, timeZone);
  // An unreadable zone must not silently rule a slot out.
  if (h === null) return true;
  return h >= WAKING_START_HOUR && h < WAKING_END_HOUR;
}

/**
 * Whether a proposed instant is civil at both ends.
 *
 * This is the check that stops a 3am slot being offered silently. It is
 * advisory: nothing here prevents two people deliberately agreeing on an
 * odd hour, it only stops the app proposing one.
 */
export function suitsBoth(
  instant: Date,
  yourZone: string | null,
  theirZone: string | null,
): boolean {
  return (
    isWakingHour(instant, yourZone ?? DEFAULT_TIME_ZONE) &&
    isWakingHour(instant, theirZone ?? DEFAULT_TIME_ZONE)
  );
}

export type Window = { start: Date; end: Date };

/**
 * Hour-long windows on a given day that fall inside waking hours on both
 * sides, scanned in UTC so neither zone is privileged.
 *
 * `from` lets the caller exclude slots already in the past.
 */
export function overlapWindows(
  day: Date,
  yourZone: string | null,
  theirZone: string | null,
  from: Date = new Date(),
): Window[] {
  const windows: Window[] = [];
  const base = new Date(
    Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 0, 0, 0, 0),
  );

  for (let h = 0; h < 24; h++) {
    const start = new Date(base.getTime() + h * 3_600_000);
    if (start < from) continue;
    if (!suitsBoth(start, yourZone, theirZone)) continue;
    windows.push({ start, end: new Date(start.getTime() + 3_600_000) });
  }
  return windows;
}

/**
 * The next day with any mutual waking-hours window, searched up to `maxDays`
 * ahead.
 *
 * Returns null when there genuinely is none, so the UI can say so and offer
 * another day rather than presenting an empty list with no explanation.
 * Some zone pairs (Lagos and Auckland, say) have no 08:00–22:00 overlap at
 * all — that is a real answer and must be said out loud.
 */
export function nextAvailableDay(
  yourZone: string | null,
  theirZone: string | null,
  from: Date = new Date(),
  maxDays = 14,
): { day: Date; windows: Window[] } | null {
  for (let i = 0; i < maxDays; i++) {
    const day = new Date(from.getTime() + i * 86_400_000);
    const windows = overlapWindows(day, yourZone, theirZone, from);
    if (windows.length > 0) return { day, windows };
  }
  return null;
}

/**
 * The zones offered in settings.
 *
 * A fixed list, not a detected value: reading the browser's zone during
 * render disagrees with what the server rendered and breaks hydration. It
 * covers Nigeria plus the diaspora cities seeded in 0010; a member elsewhere
 * leaves it blank and sees one clock.
 */
export const TIME_ZONES = [
  { value: "Africa/Lagos", label: "Lagos (WAT)" },
  { value: "Europe/London", label: "London" },
  { value: "America/New_York", label: "New York / Toronto (Eastern)" },
  { value: "America/Chicago", label: "Houston / Chicago (Central)" },
  { value: "America/Denver", label: "Denver (Mountain)" },
  { value: "America/Los_Angeles", label: "Los Angeles / Vancouver (Pacific)" },
  { value: "America/Edmonton", label: "Calgary / Edmonton" },
  { value: "America/Winnipeg", label: "Winnipeg" },
  { value: "Europe/Dublin", label: "Dublin" },
  { value: "Europe/Berlin", label: "Berlin / Rome / Madrid" },
  { value: "Asia/Dubai", label: "Dubai" },
] as const;

/** True when the two members are far enough apart for two clocks to matter. */
export function needsTwoClocks(
  yourZone: string | null,
  theirZone: string | null,
): boolean {
  return Boolean(yourZone && theirZone && yourZone !== theirZone);
}
