import { clsx } from "clsx";
import { Ban, CircleCheck, Clock, Monitor, UserRound } from "lucide-react";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { AdminPage, Section } from "@/features/admin-ui/page";
import { button, chip, table } from "@/features/admin-ui/styles";
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
  type Member = NonNullable<typeof members>[number];
  const people = (members ?? []).filter((m) => m.kind === "person");
  const devices = (members ?? []).filter((m) => m.kind === "device");

  // Status as a chip with an icon and a word, never colour alone.
  const status = (m: Member) => {
    if (!m.is_active)
      return (
        <span className={clsx(chip.base, chip.alert)}>
          <Ban aria-hidden="true" />
          {t("inactive")}
        </span>
      );
    if (m.kind === "person")
      return (
        <span className={clsx(chip.base, chip.ok)}>
          <CircleCheck aria-hidden="true" />
          {t("active")}
        </span>
      );
    return (
      <span className={clsx(chip.base, chip.plain, "num")}>
        <Clock aria-hidden="true" />
        {m.last_seen_at
          ? t("lastSeen", {
              time: `${formatDate(new Date(m.last_seen_at), locale)} ${formatTime(new Date(m.last_seen_at))}`,
            })
          : t("neverSeen")}
      </span>
    );
  };

  // People and devices as a small data table: name and role, status, action.
  const list = (rows: Member[], kind: "people" | "devices") => (
    <div className={table.wrap}>
      <table className={table.table}>
        <thead className={table.head}>
          <tr>
            <th scope="col" className={table.th}>
              {t("colName")}
            </th>
            <th scope="col" className={clsx(table.th, "max-sm:hidden")}>
              {t("colStatus")}
            </th>
            <th scope="col" className={clsx(table.th, "w-0 text-right")}>
              <span className="sr-only">{t("colAction")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id} className={table.row} data-testid="member-row">
              <td className={table.td}>
                <span className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="bg-staff-fill text-staff-label2 grid size-10 shrink-0 place-items-center rounded-full max-sm:hidden"
                  >
                    {kind === "people" ? <UserRound className="size-5" /> : <Monitor className="size-5" />}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[1.0625rem] font-semibold break-words">{m.display_name}</span>
                    <span className="text-staff-label2 text-[0.9375rem]">{t(`roles.${m.role}`)}</span>
                    {/* On phones the status sits under the name; the column needs the width. */}
                    <span className="mt-1.5 sm:hidden">{status(m)}</span>
                  </span>
                </span>
              </td>
              <td className={clsx(table.td, "max-sm:hidden")}>{status(m)}</td>
              <td className={clsx(table.td, "text-right")}>
                {m.is_active && m.role !== "owner" && (me.role === "owner" || m.kind === "device") && (
                  <form action={revokeMember}>
                    <input type="hidden" name="memberId" value={m.id} />
                    <button type="submit" className={button("danger", "min-h-11 px-3 text-[0.9375rem]")}>
                      {t("revoke")}
                    </button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <AdminPage title={t("title")}>
      <Section title={t("people")} id="staff-people" bare>
        {list(people, "people")}
      </Section>
      <Section title={t("devices")} id="staff-devices" bare>
        {devices.length > 0 ? (
          list(devices, "devices")
        ) : (
          <p className="text-staff-label2 m-0 rounded-2xl bg-white px-4 py-5">{t("noDevices")}</p>
        )}
      </Section>
      <NextIntlClientProvider>
        <div className="grid items-start gap-4 md:grid-cols-2">
          <PairDeviceForm pairUrl={`${baseUrl}/pair`} />
          {me.role === "owner" && <InviteForm baseUrl={baseUrl} />}
        </div>
      </NextIntlClientProvider>
    </AdminPage>
  );
}
