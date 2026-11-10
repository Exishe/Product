import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { ChannelCard, type ChannelView } from "@/features/notifications/channel-card";
import { PushSubscribe } from "@/features/notifications/push-subscribe";
import { TelegramConnect } from "@/features/notifications/telegram-connect";
import { requireMember } from "@/lib/auth/require-member";
import { parseServerEnv } from "@/lib/env.server";
import { createClient } from "@/lib/supabase/server";

// Screen 14 (screens.md): connect Telegram, choose alerts per chat, and phone
// notifications for owners without Telegram (ADR-035, ADR-040).
export default async function TelegramPage() {
  const me = await requireMember(["owner", "manager"]);
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  const [{ data: status }, { data: rows }] = await Promise.all([
    supabase.schema("api").rpc("telegram_status", { p_restaurant_id: me.restaurantId }),
    supabase
      .from("notification_channels")
      .select("id, kind, title, locale, events, created_by, audience")
      .eq("restaurant_id", me.restaurantId)
      .eq("is_active", true)
      .order("created_at"),
  ]);
  const env = parseServerEnv(process.env);
  const t = await getTranslations("telegram");
  // Before the migrations or the bot token are in place, status is missing: not ready.
  const botReady = (status as { bot_ready?: boolean } | null)?.bot_ready === true;

  // Telegram chats are shared by the café's admins; phone notifications are
  // each person's own. Waiter and guest channels (ADR-049) are not shown here.
  const channels: ChannelView[] = (rows ?? [])
    .filter(
      (c) =>
        c.kind === "telegram" || (c.kind === "web_push" && c.audience === "owner" && c.created_by === userId),
    )
    .map((c) => ({
      id: c.id,
      kind: c.kind as ChannelView["kind"],
      title: c.title,
      locale: c.locale,
      events: c.events,
    }));
  const chats = channels.filter((c) => c.kind === "telegram");
  const mine = channels.filter((c) => c.kind === "web_push");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <header className="flex flex-col gap-2">
        <h1 className="display-face text-display-38">{t("title")}</h1>
        <p className="text-muted">{t("intro")}</p>
      </header>
      <NextIntlClientProvider>
        {!botReady && (
          <p
            role="status"
            className="rounded-input border-apricot border bg-white p-3"
            data-testid="bot-not-ready"
          >
            {t("botNotReady")}
          </p>
        )}
        <TelegramConnect botReady={botReady} botUsername={env.TELEGRAM_BOT_USERNAME ?? null} />
        <section className="flex flex-col gap-3" aria-labelledby="chats-title">
          <h2 id="chats-title" className="text-xl font-semibold">
            {t("chats")}
          </h2>
          {chats.length === 0 ? (
            <p className="text-muted" data-testid="no-chats">
              {t("noChats")}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {chats.map((c) => (
                <ChannelCard key={c.id} channel={c} />
              ))}
            </ul>
          )}
        </section>
        <PushSubscribe vapidPublicKey={env.VAPID_PUBLIC_KEY ?? null} />
        {mine.length > 0 && (
          <ul className="flex flex-col gap-3">
            {mine.map((c) => (
              <ChannelCard key={c.id} channel={c} />
            ))}
          </ul>
        )}
      </NextIntlClientProvider>
    </main>
  );
}
