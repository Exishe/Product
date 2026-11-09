"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMember } from "@/lib/auth/require-member";
import { createClient } from "@/lib/supabase/server";

export type PairingState = { code: string | null; error: boolean };
export type InviteState = { token: string | null; error: boolean };

const pairingInput = z.object({
  role: z.enum(["kitchen", "waiter"]),
  label: z.string().trim().min(1).max(60),
});

export async function createPairing(_prev: PairingState, form: FormData): Promise<PairingState> {
  const member = await requireMember(["owner", "manager"]);
  const parsed = pairingInput.safeParse({ role: form.get("role"), label: form.get("label") });
  if (!parsed.success) return { code: null, error: true };
  const supabase = await createClient();
  const { data: location } = await supabase
    .from("locations")
    .select("id")
    .eq("restaurant_id", member.restaurantId)
    .order("created_at")
    .limit(1)
    .single();
  if (!location) return { code: null, error: true };
  const { data, error } = await supabase.schema("api").rpc("create_device_pairing", {
    p_location_id: location.id,
    p_role: parsed.data.role,
    p_label: parsed.data.label,
  });
  if (error || !data) return { code: null, error: true };
  revalidatePath("/admin/staff");
  return { code: data, error: false };
}

export async function createInvite(_prev: InviteState, form: FormData): Promise<InviteState> {
  const member = await requireMember(["owner"]);
  const role = z.enum(["manager", "waiter"]).safeParse(form.get("role"));
  if (!role.success) return { token: null, error: true };
  const supabase = await createClient();
  const { data, error } = await supabase.schema("api").rpc("create_invitation", {
    p_restaurant_id: member.restaurantId,
    p_role: role.data,
  });
  if (error || !data) return { token: null, error: true };
  return { token: data, error: false };
}

export async function revokeMember(form: FormData): Promise<void> {
  await requireMember(["owner", "manager"]);
  const id = z.uuid().parse(form.get("memberId"));
  const supabase = await createClient();
  await supabase.schema("api").rpc("revoke_member", { p_member_id: id });
  revalidatePath("/admin/staff");
}

export type AcceptInviteState = {
  error: "invitation_invalid" | "already_member" | "invitation_email_mismatch" | "failed" | null;
};

export async function acceptInvite(_prev: AcceptInviteState, form: FormData): Promise<AcceptInviteState> {
  const parsed = z
    .object({ token: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/), name: z.string().trim().min(1).max(80) })
    .safeParse({ token: form.get("token"), name: form.get("name") });
  if (!parsed.success) return { error: "failed" };
  const supabase = await createClient();
  const { data: memberId, error } = await supabase
    .schema("api")
    .rpc("accept_invitation", { p_token: parsed.data.token, p_display_name: parsed.data.name });
  if (error || !memberId) {
    const known = ["invitation_invalid", "already_member", "invitation_email_mismatch"] as const;
    const code = known.find((k) => error?.message === k);
    return { error: code ?? "failed" };
  }
  const { data: member } = await supabase.from("members").select("role").eq("id", memberId).single();
  redirect(member?.role === "waiter" ? "/waiter" : "/admin");
}
