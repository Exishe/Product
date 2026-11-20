"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { STAFF_LOCALE_COOKIE } from "@/i18n/request";
import { safeNext } from "@/lib/auth/safe-next";
import { loginIdentity } from "@/lib/auth/staff-login";
import { createClient } from "@/lib/supabase/server";

export type SignInState = { error: "invalid" | null };

const credentials = z.object({
  login: z.string().max(200),
  password: z.string().min(6).max(200),
});

// The form field is named "email" but takes either an e-mail address or a
// staff username (ADR-067): a value without "@" is a username.
export async function signIn(_prev: SignInState, form: FormData): Promise<SignInState> {
  const parsed = credentials.safeParse({ login: form.get("email"), password: form.get("password") });
  const identity = parsed.success ? loginIdentity(parsed.data.login) : null;
  if (!parsed.success || !identity) return { error: "invalid" };
  if (identity.kind === "email" && !z.email().safeParse(identity.email).success) return { error: "invalid" };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: identity.email,
    password: parsed.data.password,
  });
  if (error || !data.user) return { error: "invalid" };

  // Staff pages read the member's language from a cookie (no locale in the URL).
  const { data: member } = await supabase
    .from("members")
    .select("locale")
    .eq("user_id", data.user.id)
    .eq("is_active", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (member)
    (await cookies()).set(STAFF_LOCALE_COOKIE, member.locale, {
      path: "/",
      sameSite: "lax",
      maxAge: 31536000,
    });

  // A staff login lands on its own screen: the waiter app, or its kitchen station.
  const { data: staff } = await supabase.schema("api").rpc("my_staff_login");
  const home =
    staff && typeof staff === "object" && !Array.isArray(staff)
      ? staff.role === "waiter"
        ? "/waiter"
        : staff.role === "kitchen" && typeof staff.station_id === "string"
          ? `/kitchen/${staff.station_id}`
          : "/admin"
      : "/admin";
  redirect(safeNext(form.get("next"), home));
}

export type SignUpState = { error: "invalid" | "failed" | null };

const signUpInput = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.email(),
  password: z.string().min(8).max(200),
});

export async function signUp(_prev: SignUpState, form: FormData): Promise<SignUpState> {
  const parsed = signUpInput.safeParse({
    name: form.get("name"),
    email: form.get("email"),
    password: form.get("password"),
  });
  if (!parsed.success) return { error: "invalid" };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { display_name: parsed.data.name } },
  });
  // With email confirmation off (pilot), sign-up returns a session at once.
  if (error || !data.session) return { error: "failed" };
  redirect(safeNext(form.get("next"), "/admin/new"));
}
