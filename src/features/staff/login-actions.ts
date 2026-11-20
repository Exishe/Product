"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/auth/require-member";
import { SUFFIX_PATTERN, passwordProblem } from "@/lib/auth/staff-login";
import { generatePassword } from "@/lib/auth/staff-password";
import { createClient } from "@/lib/supabase/server";

// Staff logins (ADR-067). The password is made here (OS CSPRNG) or typed by the
// owner, goes to the database over TLS in the call and is stored only as a
// bcrypt hash. It is returned to the page once and never logged or kept.
export type LoginError = "username_taken" | "invalid_username" | "weak_password" | "failed";

export type CreateLoginState = {
  username: string | null;
  password: string | null; // only when we generated it
  error: LoginError | null;
};
export type SetPasswordState = { password: string | null; saved: boolean; error: LoginError | null };

function errorOf(message: string | undefined): LoginError {
  const known = ["username_taken", "invalid_username", "weak_password"] as const;
  return known.find((k) => message?.includes(k)) ?? "failed";
}

// The typed password, or a generated one when the field is empty.
function choosePassword(raw: FormDataEntryValue | null): { password: string; typed: boolean } | LoginError {
  const typed = typeof raw === "string" ? raw : "";
  if (typed === "") return { password: generatePassword(), typed: false };
  return passwordProblem(typed) ? "weak_password" : { password: typed, typed: true };
}

export async function createStaffLogin(_prev: CreateLoginState, form: FormData): Promise<CreateLoginState> {
  const member = await requireMember(["owner", "manager"]);
  const role = z.enum(["waiter", "kitchen"]).safeParse(form.get("role"));
  if (!role.success) return { username: null, password: null, error: "failed" };
  const ending = String(form.get("ending") ?? "")
    .trim()
    .toLowerCase();
  if (ending !== "" && !SUFFIX_PATTERN.test(ending))
    return { username: null, password: null, error: "invalid_username" };
  const station = z.uuid().safeParse(form.get("stationId"));
  const chosen = choosePassword(form.get("password"));
  if (typeof chosen === "string") return { username: null, password: null, error: chosen };

  const supabase = await createClient();
  const { data: location } = await supabase
    .from("locations")
    .select("id")
    .eq("restaurant_id", member.restaurantId)
    .order("created_at")
    .limit(1)
    .single();
  if (!location) return { username: null, password: null, error: "failed" };
  const { data, error } = await supabase.schema("api").rpc("create_staff_login", {
    p_location_id: location.id,
    p_role: role.data,
    p_password: chosen.password,
    p_suffix: ending === "" ? undefined : ending,
    p_station_id: role.data === "kitchen" && station.success ? station.data : undefined,
  });
  if (
    error ||
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    typeof data.username !== "string"
  ) {
    return { username: null, password: null, error: errorOf(error?.message) };
  }
  revalidatePath("/admin/staff");
  return { username: data.username, password: chosen.typed ? null : chosen.password, error: null };
}

export async function setStaffPassword(_prev: SetPasswordState, form: FormData): Promise<SetPasswordState> {
  await requireMember(["owner", "manager"]);
  const id = z.uuid().safeParse(form.get("memberId"));
  if (!id.success) return { password: null, saved: false, error: "failed" };
  const chosen = choosePassword(form.get("password"));
  if (typeof chosen === "string") return { password: null, saved: false, error: chosen };
  const supabase = await createClient();
  const { error } = await supabase
    .schema("api")
    .rpc("set_staff_password", { p_member_id: id.data, p_password: chosen.password });
  if (error) return { password: null, saved: false, error: errorOf(error.message) };
  revalidatePath("/admin/staff");
  return { password: chosen.typed ? null : chosen.password, saved: true, error: null };
}

export async function setStaffLoginActive(form: FormData): Promise<void> {
  await requireMember(["owner", "manager"]);
  const id = z.uuid().parse(form.get("memberId"));
  const active = form.get("active") === "true";
  const supabase = await createClient();
  await supabase.schema("api").rpc("set_staff_login_active", { p_member_id: id, p_active: active });
  revalidatePath("/admin/staff");
}
