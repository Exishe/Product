import { clsx } from "clsx";
import { CircleAlert, CircleCheck, MailWarning, ScanText, WifiOff } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { AdminPage, Notice } from "@/features/admin-ui/page";
import { button, chip, input, table } from "@/features/admin-ui/styles";
import { setPlan } from "@/features/platform/actions";
import { parseCafes, parseProblems } from "@/features/platform/model";
import { requirePlatformAdmin } from "@/features/platform/require-admin.server";
import { formatDate, formatTime } from "@/lib/format/date";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";

type Search = { saved?: string; error?: string };

// Screens 16 and 17: every café with its plan and health, and what failed to
// reach a café. Reads only through api.platform_* (platform admins only).
export default async function PlatformPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const api = supabase.schema("api");
  const [cafesRes, problemsRes, t, locale, search] = await Promise.all([
    api.rpc("platform_cafes"),
    api.rpc("platform_problems"),
    getTranslations("platform"),
    getLocale() as Promise<Locale>,
    searchParams,
  ]);
  if (cafesRes.error) throw new Error(`platform_cafes failed: ${cafesRes.error.message}`);
  if (problemsRes.error) throw new Error(`platform_problems failed: ${problemsRes.error.message}`);
  const cafes = parseCafes(cafesRes.data);
  const problems = parseProblems(problemsRes.data);
  const billing = await getTranslations("billing.planName");
  const when = (iso: string | null) =>
    iso ? `${formatDate(new Date(iso), locale)} ${formatTime(new Date(iso))}` : t("never");

  return (
    <div className="admin-shell bg-staff-bg text-ink min-h-dvh">
      <AdminPage title={t("title")} width="xl">
        {search.error && (
          <Notice tone="alert" role="alert" icon={<CircleAlert aria-hidden="true" />}>
            <p className="m-0 font-semibold">{t("error")}</p>
          </Notice>
        )}

        {/* Many columns: the table scrolls sideways inside its card on narrow screens. */}
        <div className={clsx(table.wrap, "overflow-x-auto")}>
          <table className={clsx(table.table, "min-w-[68rem]")}>
            <thead className={table.head}>
              <tr>
                <th scope="col" className={table.th}>
                  {t("cafe")}
                </th>
                <th scope="col" className={table.th}>
                  {t("plan")}
                </th>
                <th scope="col" className={table.th}>
                  {t("trialEnds")}
                </th>
                <th scope="col" className={table.th}>
                  {t("lastOrder")}
                </th>
                <th scope="col" className={clsx(table.th, "text-right")}>
                  {t("devices")}
                </th>
                <th scope="col" className={clsx(table.th, "text-right")}>
                  {t("ordersPerDay")} / {t("qrShare")}
                </th>
                <th scope="col" className={table.th}>
                  {t("changePlan")}
                </th>
              </tr>
            </thead>
            <tbody>
              {cafes.map((c) => (
                <tr key={c.location_id} data-testid="platform-cafe" data-slug={c.slug} className={table.row}>
                  <td className={clsx(table.td, "align-top")}>
                    <span className="flex min-w-0 flex-col">
                      <span className="font-semibold break-words">{c.restaurant_name}</span>
                      <span className="text-staff-label2 text-[0.8125rem]">
                        {c.location_name} · {c.slug}
                      </span>
                    </span>
                  </td>
                  <td className={clsx(table.td, "align-top")}>
                    <span className="flex flex-col items-start gap-1">
                      <span className="font-semibold">
                        {c.plan === "menu" || c.plan === "service" ? billing(c.plan) : (c.plan ?? "—")}
                      </span>
                      {c.status && (
                        <span className={clsx(chip.base, STATUS_TONE[c.status])}>
                          {t(`statuses.${c.status}`)}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className={clsx(table.td, "num align-top")}>
                    {c.trial_ends_at ? formatDate(new Date(c.trial_ends_at), locale) : "—"}
                  </td>
                  <td className={clsx(table.td, "num align-top")}>{when(c.last_order_at)}</td>
                  <td className={clsx(table.td, "num text-right align-top")}>{c.devices_online}</td>
                  <td className={clsx(table.td, "num text-right align-top")}>
                    {c.orders_per_open_day ?? "—"} / {c.qr_share_pct === null ? "—" : `${c.qr_share_pct} %`}
                  </td>
                  <td className={clsx(table.td, "align-top")}>
                    <form action={setPlan} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="locationId" value={c.location_id} />
                      <label className="flex flex-col gap-1">
                        <span className="text-staff-label2 text-[0.8125rem] font-semibold">{t("plan")}</span>
                        <select
                          name="plan"
                          defaultValue={c.plan ?? "service"}
                          className={clsx(input, "h-11 w-auto")}
                        >
                          <option value="menu">{billing("menu")}</option>
                          <option value="service">{billing("service")}</option>
                        </select>
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-staff-label2 text-[0.8125rem] font-semibold">
                          {t("status")}
                        </span>
                        <select
                          name="status"
                          defaultValue={c.status ?? "trialing"}
                          className={clsx(input, "h-11 w-auto")}
                        >
                          {(["trialing", "active", "past_due", "canceled"] as const).map((s) => (
                            <option key={s} value={s}>
                              {t(`statuses.${s}`)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button type="submit" className={button("primary", "min-h-11 text-[0.9375rem]")}>
                        {t("save")}
                      </button>
                      {search.saved === c.location_id && (
                        <span
                          role="status"
                          className="text-ink flex min-h-11 items-center gap-1 font-semibold underline underline-offset-4"
                        >
                          <CircleCheck aria-hidden="true" className="size-4" />
                          {t("saved")}
                        </span>
                      )}
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="flex flex-col gap-3" aria-labelledby="problems">
          <h2 id="problems" className="m-0 px-1 text-[1.5rem] font-bold">
            {t("problems")}
          </h2>
          <div className="grid items-start gap-3 lg:grid-cols-3">
            <ProblemList
              testId="dead-letters"
              title={t("deadLetters")}
              empty={t("none")}
              icon={<MailWarning aria-hidden="true" />}
            >
              {problems.dead_letters.map((m) => (
                <li key={m.id} className="border-staff-sep flex flex-col border-t py-2 first:border-0">
                  <span className="font-semibold break-words">
                    {m.restaurant_name} · {m.event} · {t("attempts", { count: m.attempts })}
                  </span>
                  <span className="text-staff-label2 text-[0.9375rem] break-words">
                    {when(m.created_at)} · {m.last_error ?? t("noError")}
                  </span>
                </li>
              ))}
            </ProblemList>
            <ProblemList
              testId="failed-imports"
              title={t("failedImports")}
              empty={t("none")}
              icon={<ScanText aria-hidden="true" />}
            >
              {problems.failed_imports.map((i) => (
                <li key={i.id} className="border-staff-sep flex flex-col border-t py-2 first:border-0">
                  <span className="font-semibold break-words">{i.restaurant_name}</span>
                  <span className="text-staff-label2 text-[0.9375rem] break-words">
                    {when(i.created_at)} · {i.error ?? t("noError")}
                  </span>
                </li>
              ))}
            </ProblemList>
            <ProblemList
              testId="offline-devices"
              title={t("offlineDevices")}
              empty={t("none")}
              icon={<WifiOff aria-hidden="true" />}
            >
              {problems.offline_devices.map((d) => (
                <li key={d.id} className="border-staff-sep flex flex-col border-t py-2 first:border-0">
                  <span className="font-semibold break-words">
                    {d.restaurant_name} · {d.display_name}
                  </span>
                  <span className="text-staff-label2 text-[0.9375rem]">{when(d.last_seen_at)}</span>
                </li>
              ))}
            </ProblemList>
          </div>
        </section>
      </AdminPage>
    </div>
  );
}

const STATUS_TONE = {
  trialing: chip.ok,
  active: chip.ok,
  past_due: chip.wait,
  canceled: chip.alert,
} as const;

function ProblemList({
  title,
  empty,
  testId,
  icon,
  children,
}: {
  title: string;
  empty: string;
  testId: string;
  icon: React.ReactNode;
  children: React.ReactNode[];
}) {
  return (
    <div data-testid={testId} className="flex flex-col gap-2 rounded-2xl bg-white p-4 sm:p-5">
      <h3 className="[&>svg]:text-staff-label2 m-0 flex items-center gap-2 text-[1.125rem] font-bold [&>svg]:size-5 [&>svg]:shrink-0">
        {icon}
        {title}
        {children.length > 0 && (
          <span className={clsx(chip.base, chip.alert, "num ml-auto")}>{children.length}</span>
        )}
      </h3>
      {children.length === 0 ? (
        <p className="text-staff-label2 m-0 flex items-center gap-2">
          <CircleCheck aria-hidden="true" className="text-tarragon size-4" />
          {empty}
        </p>
      ) : (
        <ul className="m-0 list-none p-0">{children}</ul>
      )}
    </div>
  );
}
