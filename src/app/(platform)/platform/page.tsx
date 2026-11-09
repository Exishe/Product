import { getLocale, getTranslations } from "next-intl/server";
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
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6">
      <h1 className="display-face text-display-38 leading-tight">{t("title")}</h1>
      {search.error && (
        <p role="alert" className="rounded-sheet bg-pom-tint text-pomegranate px-4 py-3 font-semibold">
          {t("error")}
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {cafes.map((c) => (
          <li
            key={c.location_id}
            data-testid="platform-cafe"
            data-slug={c.slug}
            className="rounded-sheet border-line flex flex-col gap-3 border bg-white p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xl font-semibold break-words">
                {c.restaurant_name}{" "}
                <span className="text-muted text-base font-normal">· {c.location_name}</span>
              </h2>
              <span className="text-muted text-sm">{c.slug}</span>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
              <Fact
                label={t("plan")}
                value={c.plan === "menu" || c.plan === "service" ? billing(c.plan) : (c.plan ?? "")}
              />
              <Fact label={t("status")} value={c.status ? t(`statuses.${c.status}`) : ""} />
              <Fact
                label={t("trialEnds")}
                value={c.trial_ends_at ? formatDate(new Date(c.trial_ends_at), locale) : "—"}
              />
              <Fact label={t("lastOrder")} value={when(c.last_order_at)} />
              <Fact label={t("devices")} value={String(c.devices_online)} />
              <Fact
                label={`${t("ordersPerDay")} / ${t("qrShare")}`}
                value={`${c.orders_per_open_day ?? "—"} / ${c.qr_share_pct === null ? "—" : `${c.qr_share_pct} %`}`}
              />
            </dl>
            <form action={setPlan} className="border-line flex flex-wrap items-end gap-2 border-t pt-3">
              <input type="hidden" name="locationId" value={c.location_id} />
              <label className="text-muted flex flex-col text-sm font-semibold">
                {t("plan")}
                <select
                  name="plan"
                  defaultValue={c.plan ?? "service"}
                  className="rounded-input border-line-strong text-ink h-11 border bg-white px-2 text-base"
                >
                  <option value="menu">{billing("menu")}</option>
                  <option value="service">{billing("service")}</option>
                </select>
              </label>
              <label className="text-muted flex flex-col text-sm font-semibold">
                {t("status")}
                <select
                  name="status"
                  defaultValue={c.status ?? "trialing"}
                  className="rounded-input border-line-strong text-ink h-11 border bg-white px-2 text-base"
                >
                  {(["trialing", "active", "past_due", "canceled"] as const).map((s) => (
                    <option key={s} value={s}>
                      {t(`statuses.${s}`)}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="rounded-input bg-tarragon h-11 px-4 font-semibold text-white">
                {t("save")}
              </button>
              {search.saved === c.location_id && (
                <span role="status" className="text-tarragon self-center font-semibold">
                  {t("saved")}
                </span>
              )}
            </form>
          </li>
        ))}
      </ul>

      <section className="flex flex-col gap-4" aria-labelledby="problems">
        <h2 id="problems" className="display-face text-3xl">
          {t("problems")}
        </h2>
        <ProblemList testId="dead-letters" title={t("deadLetters")} empty={t("none")}>
          {problems.dead_letters.map((m) => (
            <li key={m.id} className="border-line flex flex-col border-t py-2 first:border-0">
              <span className="font-semibold">
                {m.restaurant_name} · {m.event} · {t("attempts", { count: m.attempts })}
              </span>
              <span className="text-muted text-sm break-words">
                {when(m.created_at)} · {m.last_error ?? t("noError")}
              </span>
            </li>
          ))}
        </ProblemList>
        <ProblemList testId="failed-imports" title={t("failedImports")} empty={t("none")}>
          {problems.failed_imports.map((i) => (
            <li key={i.id} className="border-line flex flex-col border-t py-2 first:border-0">
              <span className="font-semibold">{i.restaurant_name}</span>
              <span className="text-muted text-sm break-words">
                {when(i.created_at)} · {i.error ?? t("noError")}
              </span>
            </li>
          ))}
        </ProblemList>
        <ProblemList testId="offline-devices" title={t("offlineDevices")} empty={t("none")}>
          {problems.offline_devices.map((d) => (
            <li key={d.id} className="border-line flex flex-col border-t py-2 first:border-0">
              <span className="font-semibold">
                {d.restaurant_name} · {d.display_name}
              </span>
              <span className="text-muted text-sm">{when(d.last_seen_at)}</span>
            </li>
          ))}
        </ProblemList>
      </section>
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-muted">{label}</dt>
      <dd className="num font-semibold break-words">{value}</dd>
    </div>
  );
}

function ProblemList({
  title,
  empty,
  testId,
  children,
}: {
  title: string;
  empty: string;
  testId: string;
  children: React.ReactNode[];
}) {
  return (
    <div data-testid={testId} className="rounded-sheet border-line flex flex-col gap-2 border bg-white p-4">
      <h3 className="text-lg font-semibold">{title}</h3>
      {children.length === 0 ? <p className="text-muted">{empty}</p> : <ul>{children}</ul>}
    </div>
  );
}
