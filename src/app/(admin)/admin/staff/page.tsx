import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { InviteForm } from "@/features/staff/invite-form";
import { PairDeviceForm } from "@/features/staff/pair-device-form";
import { revokeMember } from "@/features/staff/actions";
import { requireMember } from "@/lib/auth/require-member";
import { formatDate, formatTime } from "@/lib/format/date";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";

export default async function StaffPage() {
  const me = await requireMember(["owner", "manager"]);
  const supabase = await createClient();
  const { data: members } = await supabase
    .from("members")
    .select("id, role, kind, display_name, is_active, last_seen_at")
    .eq("restaurant_id", me.restaurantId)
    .order("created_at");
  const t = await getTranslations("staff");
  const h = await headers();
  const baseUrl = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const locale = me.locale as Locale;
  const people = (members ?? []).filter((m) => m.kind === "person");
  const devices = (members ?? []).filter((m) => m.kind === "device");

  const row = (m: NonNullable<typeof members>[number]) => (
    <li key={m.id} className="flex min-h-14 items-center justify-between gap-3 border-b border-line py-2" data-testid="member-row">
      <div className="flex flex-col">
        <span className="font-semibold">{m.display_name}</span>
        <span className="text-sm text-muted">
          {t(`roles.${m.role}`)}
          {" · "}
          {!m.is_active
            ? t("inactive")
            : m.kind === "device"
              ? m.last_seen_at
                ? t("lastSeen", { time: `${formatDate(new Date(m.last_seen_at), locale)} ${formatTime(new Date(m.last_seen_at))}` })
                : t("neverSeen")
              : null}
        </span>
      </div>
      {m.is_active && m.role !== "owner" && (me.role === "owner" || m.kind === "device") && (
        <form action={revokeMember}>
          <input type="hidden" name="memberId" value={m.id} />
          <button type="submit" className="h-12 rounded-input border border-pomegranate px-4 font-semibold text-pomegranate">
            {t("revoke")}
          </button>
        </form>
      )}
    </li>
  );

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <h1 className="display-face text-display-38">{t("title")}</h1>
      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">{t("people")}</h2>
        <ul>{people.map(row)}</ul>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">{t("devices")}</h2>
        <ul>{devices.map(row)}</ul>
      </section>
      <NextIntlClientProvider>
        <div className="grid gap-4 md:grid-cols-2">
          <PairDeviceForm pairUrl={`${baseUrl}/pair`} />
          {me.role === "owner" && <InviteForm baseUrl={baseUrl} />}
        </div>
      </NextIntlClientProvider>
    </main>
  );
}
