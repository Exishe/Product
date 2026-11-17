"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/auth/require-member";
import { createClient } from "@/lib/supabase/server";
import { GUEST_THEMES } from "./themes";

const input = z.object({
  theme: z.enum(GUEST_THEMES),
  brandColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable(),
  logoPath: z.string().max(300).nullable(),
});
export type AppearanceInput = z.infer<typeof input>;

// «Հյուրի էջի տեսքը» (ADR-052): one call saves theme, brand colour and logo;
// api.set_guest_appearance checks the role and the café's own logo folder.
export async function saveAppearance(value: AppearanceInput): Promise<{ ok: boolean }> {
  const me = await requireMember(["owner", "manager"]);
  const parsed = input.safeParse(value);
  if (!parsed.success) return { ok: false };
  const supabase = await createClient();
  // The generated types don't mark nullable arguments; null clears colour or logo.
  const { error } = await supabase.schema("api").rpc("set_guest_appearance", {
    p_restaurant_id: me.restaurantId,
    p_theme: parsed.data.theme,
    p_brand_color: parsed.data.brandColor as string,
    p_logo_path: parsed.data.logoPath as string,
  });
  if (error) return { ok: false };
  revalidatePath("/admin/look");
  return { ok: true };
}
