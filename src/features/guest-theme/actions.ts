"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/auth/require-member";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import { GUEST_THEMES } from "./themes";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const input = z.object({
  theme: z.enum(GUEST_THEMES),
  brandColor: hex.nullable(),
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

const brandInput = z
  .object({
    colors: z
      .object({
        header: hex.optional(),
        accent: hex.optional(),
        highlight: hex.optional(),
        line: hex.optional(),
        page: hex.optional(),
      })
      .strict()
      .optional(),
    heading_font: z.string().max(60).optional(),
    body_font: z.string().max(60).optional(),
    script_font: z.string().max(60).optional(),
    plate: z.enum(["porcelain", "dark", "none"]).optional(),
    wordmark: z.string().max(300).optional(),
    wordmark_dark: z.string().max(300).optional(),
  })
  .strict()
  .nullable();

// The brand profile (ADR-058): api.set_brand checks the role, the font list
// and the wordmarks' folder. null removes the brand.
export async function saveBrand(value: unknown): Promise<{ ok: boolean }> {
  const me = await requireMember(["owner", "manager"]);
  const parsed = brandInput.safeParse(value);
  if (!parsed.success) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase
    .schema("api")
    .rpc("set_brand", { p_restaurant_id: me.restaurantId, p_brand: parsed.data as Json });
  if (error) return { ok: false };
  revalidatePath("/admin/look");
  return { ok: true };
}

// A section's cover photo, saved at once (covers are read live, no republish).
// api.set_section_cover checks the role through the section's café.
export async function saveSectionCover(categoryId: string, path: string | null): Promise<{ ok: boolean }> {
  await requireMember(["owner", "manager"]);
  if (!z.uuid().safeParse(categoryId).success || (path !== null && path.length > 300)) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase
    .schema("api")
    .rpc("set_section_cover", { p_category_id: categoryId, p_path: path as string });
  if (error) return { ok: false };
  revalidatePath("/admin/look");
  return { ok: true };
}
