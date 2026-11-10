"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/auth/require-member";
import { createClient } from "@/lib/supabase/server";
import { ALERT_EVENTS } from "./events";
import { isPushServiceEndpoint } from "./web-push";

const PAGE = "/admin/telegram";

export type LinkState = {
  code: string | null;
  expiresAt: string | null;
  error: "rate_limited" | "failed" | null;
};

export async function createTelegramLink(): Promise<LinkState> {
  const member = await requireMember(["owner", "manager"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("api")
    .rpc("create_telegram_link", { p_restaurant_id: member.restaurantId });
  if (error || !data)
    return {
      code: null,
      expiresAt: null,
      error: error?.message === "rate_limited" ? "rate_limited" : "failed",
    };
  const parsed = z.object({ code: z.string(), expires_at: z.string() }).safeParse(data);
  if (!parsed.success) return { code: null, expiresAt: null, error: "failed" };
  return { code: parsed.data.code, expiresAt: parsed.data.expires_at, error: null };
}

export type ChannelState = { saved: boolean; tested: boolean; error: "rate_limited" | "failed" | null };

const channelForm = z.object({
  intent: z.enum(["save", "test", "disconnect"]),
  channelId: z.uuid(),
  locale: z.enum(["hy", "ru", "en"]),
  events: z.array(z.enum(ALERT_EVENTS)),
});

// One form per channel: save the settings, send a test, or switch it off.
export async function updateChannel(_prev: ChannelState, form: FormData): Promise<ChannelState> {
  await requireMember(["owner", "manager"]);
  const parsed = channelForm.safeParse({
    intent: form.get("intent"),
    channelId: form.get("channelId"),
    locale: form.get("locale"),
    events: form.getAll("events"),
  });
  if (!parsed.success) return { saved: false, tested: false, error: "failed" };
  const { intent, channelId, locale, events } = parsed.data;
  const api = (await createClient()).schema("api");

  if (intent === "test") {
    const { error } = await api.rpc("send_test_notification", { p_channel_id: channelId });
    if (error)
      return {
        saved: false,
        tested: false,
        error: error.message === "rate_limited" ? "rate_limited" : "failed",
      };
    return { saved: false, tested: true, error: null };
  }
  const { error } = await api.rpc("update_notification_channel", {
    p_channel_id: channelId,
    p_events: events,
    p_locale: locale,
    p_is_active: intent === "save",
  });
  if (error) return { saved: false, tested: false, error: "failed" };
  revalidatePath(PAGE);
  return { saved: true, tested: false, error: null };
}

const subscription = z.object({
  endpoint: z.url().max(1000).refine(isPushServiceEndpoint),
  p256dh: z.string().regex(/^[A-Za-z0-9_-]{86,88}={0,2}$/),
  auth: z.string().regex(/^[A-Za-z0-9_-]{22,24}={0,2}$/),
});

// Called by the push toggle with the browser's PushSubscription.toJSON().
export async function savePushSubscription(
  input: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent: string,
): Promise<boolean> {
  const member = await requireMember(["owner", "manager"]);
  const parsed = subscription.safeParse({
    endpoint: input?.endpoint,
    p256dh: input?.keys?.p256dh,
    auth: input?.keys?.auth,
  });
  if (!parsed.success) return false;
  const { error } = await (await createClient()).schema("api").rpc("save_push_subscription", {
    p_restaurant_id: member.restaurantId,
    p_endpoint: parsed.data.endpoint,
    p_p256dh: parsed.data.p256dh,
    p_auth: parsed.data.auth,
    p_user_agent: typeof userAgent === "string" ? userAgent.slice(0, 300) : undefined,
  });
  revalidatePath(PAGE);
  return !error;
}

export async function deletePushSubscription(endpoint: string): Promise<boolean> {
  await requireMember(["owner", "manager"]);
  const parsed = z.url().safeParse(endpoint);
  if (!parsed.success) return false;
  const { error } = await (
    await createClient()
  )
    .schema("api")
    .rpc("delete_push_subscription", { p_endpoint: parsed.data });
  revalidatePath(PAGE);
  return !error;
}

export async function isPushSubscribed(endpoint: string): Promise<boolean> {
  await requireMember(["owner", "manager"]);
  const parsed = z.url().safeParse(endpoint);
  if (!parsed.success) return false;
  const { data } = await (
    await createClient()
  )
    .schema("api")
    .rpc("push_subscription_exists", { p_endpoint: parsed.data });
  return data === true;
}
