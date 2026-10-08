"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { capture } from "@/lib/analytics";
import { dateOfBirthProblem } from "@/lib/age";
import { getGenderOptions, parseGenderChoice } from "@/lib/gender-options";
import { onLaunchAllowList, paymentsLaunched } from "@/lib/launch";

export type AuthState = { error?: string } | null;

/**
 * Signup.
 *
 * Gender and who you'd like to meet are required here (decided 8 October
 * 2026): they decide who sees whom, and the women's launch offer is granted
 * at go-live by the database (0035). Before launch only the allow-list can
 * sign up; everyone else is on the waitlist. Intent is deliberately NOT collected here: it is a spectrum value
 * gathered during profile setup and must never block signup (CLAUDE.md).
 */
export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();
  const gender = String(formData.get("gender") ?? "");
  const seeking = formData.getAll("seeking").map(String);
  const dateOfBirth = String(formData.get("date_of_birth") ?? "");

  if (!email || !password || !displayName) {
    return { error: "Please fill in your name, email and password." };
  }
  if (password.length < 8) {
    return { error: "Use at least 8 characters for your password." };
  }

  // 18 and over only. The database refuses an under-18 date too (0015).
  const dobProblem = dateOfBirthProblem(dateOfBirth);
  if (dobProblem) return { error: dobProblem };

  // Before launch: test accounts only (lib/launch.ts).
  if (!paymentsLaunched() && !onLaunchAllowList(email)) {
    return { error: "Toastly opens soon. Join the waitlist and we'll tell you when you can create your account." };
  }

  const supabase = createClient();
  const choice = parseGenderChoice(await getGenderOptions(supabase), gender, seeking);
  if (!choice) return { error: "Choose who you are, and who you'd like to meet." };

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // date_of_birth is moved out of the metadata into a private table by
      // the database as soon as the profile exists (0015).
      data: { display_name: displayName, gender: choice.gender, seeking: choice.seeking, date_of_birth: dateOfBirth },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/auth/callback`,
    },
  });

  if (error) return { error: error.message };

  // Funnel step one. No email, no name, no gender — the distinct id is the
  // profile UUID and nothing else goes with it. Awaited before the redirect
  // because redirect() throws to unwind.
  if (data.user?.id) {
    await capture("signup", data.user.id);
  }

  redirect("/verify");
}

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  // Deliberately generic: a distinct "no such account" message would let
  // anyone test whether an email is registered here.
  if (error) return { error: "That email and password don't match an account." };

  revalidatePath("/", "layout");
  redirect("/verify");
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

export type WaitlistState = { ok?: string; error?: string } | null;

/**
 * The waitlist (0037), while sign-up is closed. Email, city and woman or man,
 * through join_waitlist — the table itself can't be read or written by
 * anyone outside the server. Joining twice just updates the entry, and the
 * answer is the same either way, so the form can't be used to test whether
 * an email is already on the list.
 */
export async function joinWaitlist(_prev: WaitlistState, formData: FormData): Promise<WaitlistState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const city = String(formData.get("city") ?? "").trim();
  const gender = String(formData.get("gender") ?? "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) return { error: "Enter your email address." };
  if (city.length < 2 || city.length > 80) return { error: "Enter your city." };
  const supabase = createClient();
  const { error } = await supabase.rpc("join_waitlist", { p_email: email, p_city: city, p_gender: gender });
  if (error) return { error: /gender/i.test(error.message) ? "Choose woman or man." : "That didn't go through. Try again." };
  return { ok: "We'll email you the moment you can create your account." };
}
