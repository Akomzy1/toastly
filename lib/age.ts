/**
 * Date of birth and the 18+ rule.
 *
 * The database enforces the same rule (migration 0015, enforce_adult) — this
 * exists so the form can say so plainly before a signup is attempted.
 */

export const MINIMUM_AGE = 18;

/** Parses YYYY-MM-DD into a real calendar date, or null. */
export function parseDateOfBirth(raw: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  // Rejects 2001-02-30 and similar, which Date would silently roll over.
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return date;
}

export function ageOn(dob: Date, today: Date = new Date()): number {
  let age = today.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    today.getUTCMonth() < dob.getUTCMonth() ||
    (today.getUTCMonth() === dob.getUTCMonth() && today.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/** A plain-language problem with the date, or null when it's acceptable. */
export function dateOfBirthProblem(raw: string, today: Date = new Date()): string | null {
  if (!raw.trim()) return "Please enter your date of birth.";
  const dob = parseDateOfBirth(raw);
  if (!dob || dob.getUTCFullYear() < 1900 || dob > today) {
    return "That date of birth doesn't look right.";
  }
  if (ageOn(dob, today) < MINIMUM_AGE) {
    return "Toastly is for people aged 18 and over.";
  }
  return null;
}
