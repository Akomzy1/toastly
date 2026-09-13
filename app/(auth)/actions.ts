"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

  if (!email || !password || !displayName) {
    return { error: "Please fill in your name, email and password." };
  }
  if (password.length < 8) {
    return { error: "Use at least 8 characters for your password." };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName, gender: gender || null },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/auth/callback`,
    },
  });

  if (error) return { error: error.message };

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
