import { clsx } from "clsx";
import { Ban, CircleCheck, Clock, Mail, Monitor, MonitorSmartphone, UserPlus } from "lucide-react";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { AdminPage, Section } from "@/features/admin-ui/page";
import { SheetButton } from "@/features/admin-ui/sheet-button";
import { chip, table, textAction } from "@/features/admin-ui/styles";
import { InviteForm } from "@/features/staff/invite-form";
import { parseStaffLogins } from "@/features/staff/logins-model";
import { PairDeviceForm } from "@/features/staff/pair-device-form";
import { CreateLoginForm, StaffLoginList, type StaffLoginRow } from "@/features/staff/staff-logins";
import { revokeMember } from "@/features/staff/actions";
import { requireMember } from "@/lib/auth/require-member";
import { formatDate, formatTime } from "@/lib/format/date";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";

// The station the system creates with every café is called "Kitchen".
const SYSTEM_STATION_NAME = "Kitchen";

export default async function StaffPage() {
  const me = await requireMember(["owner", "manager"]);
  const supabase = await createClient();
  const { data: members } = await supabase
    .from("members")
    .select("id, role, kind, display_name, is_active, last_seen_at")
    .eq("restaurant_id", me.restaurantId)
    .order("created_at");
  // Staff logins (ADR-067). Before the migration reaches a database the list
  // call fails; the section is then left out and the page works as before.
  const [{ data: location }, { data: restaurant }] = await Promise.all([
    supabase
      .from("locations")
      .select("id")
      .eq("restaurant_id", me.restaurantId)
      .order("created_at")
      .limit(1)
      .maybeSingle(),
    supabase.from("restaurants").select("slug").eq("id", me.restaurantId).maybeSingle(),
  ]);
  const loginsResult = location
    ? await supabase.schema("api").rpc("list_staff_logins", { p_location_id: location.id })
    : null;
  const loginsAvailable = !!loginsResult && !loginsResult.error;
  const logins = loginsAvailable ? parseStaffLogins(loginsResult.data) : [];
  const loginIds = new Set(logins.map((l) => l.memberId));
  const { data: stations } = location
    ? await supabase
        .from("stations")
        .select("id, name, is_default, sort")
        .eq("location_id", location.id)
        .order("sort")
        .order("name")
    : { data: [] };
  const t = await getTranslations("staff");
  const h = await headers();
  const baseUrl = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const locale = me.locale as Locale;
  type Member = NonNullable<typeof members>[number];
  const people = (members ?? []).filter((m) => m.kind === "person" && !loginIds.has(m.id));
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
                    className="bg-staff-fill text-ink grid size-10 shrink-0 place-items-center rounded-full text-label font-semibold max-sm:hidden"
                  >
                    {kind === "people" ? initials(m.display_name) : <Monitor className="size-5" />}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="text-name font-semibold break-words">{m.display_name}</span>
                    <span className="text-staff-label2 text-label">{t(`roles.${m.role}`)}</span>
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
                    <button type="submit" className={textAction("danger")}>
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

  const roleLabels = { waiter: t("roles.waiter"), kitchen: t("roles.kitchen") };
  const loginRows: StaffLoginRow[] = logins.map((l) => ({
    memberId: l.memberId,
    username: l.username,
    role: l.role,
    // The default station is just "the kitchen": only a named station is shown next to the role.
    stationName: l.stationName === SYSTEM_STATION_NAME ? null : l.stationName,
    isActive: l.isActive,
    passwordSet: l.passwordSet,
    lastSignIn: l.lastSignInAt
      ? `${formatDate(new Date(l.lastSignInAt), locale)} ${formatTime(new Date(l.lastSignInAt))}`
      : null,
  }));

  const close = t("close");
  // One page, three lists with the same rows (ADR-093): the logins the
  // screens use, the people with their own account, the paired devices. Each
  // create form opens in a sheet; the common one (a new waiter or kitchen
  // login) is the page's one primary button.
  return (
    <AdminPage
      title={t("title")}
      actions={
        loginsAvailable && (
          <NextIntlClientProvider>
            <SheetButton
              kind="primary"
              label={t("addPerson")}
              title={t("logins.createTitle")}
              closeLabel={close}
              icon={<UserPlus aria-hidden="true" />}
              testId="add-person"
            >
              <CreateLoginForm
                stations={(stations ?? []).map((s) => ({
                  id: s.id,
                  name: s.is_default && s.name === SYSTEM_STATION_NAME ? t("roles.kitchen") : s.name,
                }))}
                prefix={restaurant?.slug ?? ""}
                roleLabels={roleLabels}
              />
            </SheetButton>
          </NextIntlClientProvider>
        )
      }
    >
      {loginsAvailable && (
        <Section
          title={t("logins.title")}
          hint={t("logins.intro")}
          id="staff-logins"
          testId="staff-logins"
        >
          <NextIntlClientProvider>
            <StaffLoginList rows={loginRows} roleLabels={roleLabels} />
          </NextIntlClientProvider>
        </Section>
      )}
      <Section
        title={t("people")}
        id="staff-people"
        actions={
          me.role === "owner" && (
            <NextIntlClientProvider>
              <SheetButton label={t("inviteOpen")} title={t("inviteTitle")} closeLabel={close} icon={<Mail aria-hidden="true" />}>
                <InviteForm baseUrl={baseUrl} />
              </SheetButton>
            </NextIntlClientProvider>
          )
        }
      >
        {list(people, "people")}
      </Section>
      <Section
        title={t("devices")}
        id="staff-devices"
        actions={
          <NextIntlClientProvider>
            <SheetButton
              label={t("pairTitle")}
              title={t("pairTitle")}
              closeLabel={close}
              icon={<MonitorSmartphone aria-hidden="true" />}
            >
              <PairDeviceForm pairUrl={`${baseUrl}/pair`} />
            </SheetButton>
          </NextIntlClientProvider>
        }
      >
        {devices.length > 0 ? (
          list(devices, "devices")
        ) : (
          <p className="text-staff-label2 m-0 text-name">{t("noDevices")}</p>
        )}
      </Section>
    </AdminPage>
  );
}

// Up to two letters from the name ("Anna Petrosyan" → "AP", "Karen" → "K"),
// so people are told apart at a glance; works for Armenian and Cyrillic too.
function initials(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  const letters = words.slice(0, 2).map((w) => Array.from(w)[0] ?? "");
  return letters.join("").toLocaleUpperCase();
}
