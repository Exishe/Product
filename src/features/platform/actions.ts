"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "./require-admin.server";

const input = z.object({
  locationId: z.uuid(),
  plan: z.enum(["menu", "service"]),
  status: z.enum(["trialing", "active", "past_due", "canceled"]),
});

export async function setPlan(form: FormData): Promise<void> {
  await requirePlatformAdmin();
  const parsed = input.safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect("/platform?error=1");
  const supabase = await createClient();
  const { error } = await supabase.schema("api").rpc("platform_set_plan", {
    p_location_id: parsed.data.locationId,
    p_plan: parsed.data.plan,
    p_status: parsed.data.status,
  });
  redirect(error ? "/platform?error=1" : `/platform?saved=${parsed.data.locationId}`);
}
