"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { capture } from "@/lib/analytics";
import { dateOfBirthProblem } from "@/lib/age";

export type AuthState = { error?: string } | null;

/**
 * Signup.
 *
 * `gender` is collected here because the women's launch offer is granted at
 * signup as a real entitlement (handled by the DB trigger, not by client
 * code). Intent is deliberately NOT collected here: it is a spectrum value
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

  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // date_of_birth is moved out of the metadata into a private table by
      // the database as soon as the profile exists (0015).
      data: { display_name: displayName, gender: gender || null, date_of_birth: dateOfBirth },
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
