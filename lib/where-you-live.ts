import type { SupabaseClient } from "@supabase/supabase-js";
import type { PickerCity } from "@/components/app/city-picker";
import { COUNTRY_NAME, LIVE_COUNTRIES } from "@/lib/countries";

/** Every diaspora city, closed ones included, shaped for the city picker. */
export async function loadCities(supabase: SupabaseClient): Promise<PickerCity[]> {
  const { data } = await supabase.from("diaspora_cities").select("slug, label, country_code, active").order("label");
  return (data ?? []).map((c) => ({
    slug: c.slug,
    label: c.label,
    country: COUNTRY_NAME[c.country_code] ?? c.country_code,
    region: null,
    active: c.active,
  }));
}

/** "+234 803 *** 4417" — enough to recognise, never the whole number. */
export function maskPhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  const code =
    LIVE_COUNTRIES.map((c) => c.callingCode)
      .filter((c) => digits.startsWith(c))
      .sort((a, b) => b.length - a.length)[0] ?? digits.slice(0, digits.length - 10);
  const rest = digits.slice(code.length);
  return `+${code} ${rest.slice(0, 3)} *** ${rest.slice(-4)}`;
}

/** "3 April" — the settings screens' date style. */
export function dayMonth(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
}
