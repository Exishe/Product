import { NextIntlClientProvider } from "next-intl";
import { ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { clsx } from "clsx";
import { AdminPage, Section, SettingsItem, SettingsList } from "@/features/admin-ui/page";
import { AlertSettingsForm } from "@/features/alerts/alert-settings";
import { SoundSettingsForm, type StaffSounds } from "@/features/sounds/sound-settings";
import { soundOr, DEFAULT_CALL_SOUND, DEFAULT_ORDER_SOUND } from "@/lib/sounds/library";
import { AttentionPanel, type AttentionTodo } from "@/features/alerts/attention-panel";
import { parseAlerts, type AlertSettings, type TableAlert } from "@/features/alerts/model";
import { VenueControls, type VenueState } from "@/features/availability/venue-controls";
import { PlanBanner } from "@/features/billing/plan-banner";
import { deltaPercent, parseDashboard, type Dashboard } from "@/features/dashboard/model";
import { businessDate } from "@/features/dashboard/range";
import { RewardsForm } from "@/features/game-rewards/rewards-form";
import { settingsFromRow, type RewardSettings } from "@/features/game-rewards/model";
import { PromoManager } from "@/features/promos/promo-manager";
import { promoFromRow, type Promo } from "@/features/promos/model";
import { menuHasChanges } from "@/features/menu/publish-state";
import { textAction } from "@/features/admin-ui/styles";
import { requireMember } from "@/lib/auth/require-member";
import { formatDate, formatTime } from "@/lib/format/date";
import { formatAmd, formatInteger } from "@/lib/format/money";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locale } from "@/i18n/routing";

type Todo = AttentionTodo;

const kpi =
  "border-staff-sep flex min-w-0 flex-col gap-0.5 sm:border-l sm:px-6 sm:first:border-l-0 sm:first:pl-0";
const kpiLabel = "text-staff-label2 text-label font-semibold";
const kpiFigure = "m-0 text-large leading-tight font-bold";

// Admin home: how today is going and what still needs doing, instead of a
// second copy of the sidebar. Every row links to the page where the owner acts.
export default async function AdminHome() {
  const member = await requireMember(["owner", "manager"]);
  const supabase = await createClient();
  const rid = member.restaurantId;
  const [{ data: restaurant }, { data: location }] = await Promise.all([
    supabase.from("restaurants").select("name").eq("id", rid).single(),
    supabase
      .from("locations")
      .select("id, timezone, business_day_starts, published_menu_version_id")
      .eq("restaurant_id", rid)
      .order("created_at")
      .limit(1)
      .maybeSingle(),
  ]);
  const locale = member.locale as Locale;
  const [t, d, s] = await Promise.all([
    getTranslations("admin.home"),
    getTranslations("dashboard"),
    getTranslations("sounds"),
  ]);

  const today = location ? businessDate(new Date(), location.timezone, location.business_day_starts) : null;
  const count = { count: "exact", head: true } as const;
  const [sales, noPhoto, tables, devices, stops, version, items, cats, groups] = await Promise.all([
    location && today
      ? supabase
          .schema("api")
          .rpc("sales_dashboard", { p_location_id: location.id, p_from: today, p_to: today })
      : Promise.resolve({ data: null, error: true }),
    supabase
      .from("items")
      .select("id", count)
      .eq("restaurant_id", rid)
      .eq("is_active", true)
      .is("image_path", null),
    supabase.from("tables").select("id", count).eq("restaurant_id", rid).eq("is_active", true),
    supabase
      .from("members")
      .select("id", count)
      .eq("restaurant_id", rid)
      .eq("kind", "device")
      .eq("is_active", true),
    location
      ? supabase
          .from("stop_list")
          .select("item_id", count)
          .eq("location_id", location.id)
          .or(`until.is.null,until.gt.${new Date().toISOString()}`)
      : Promise.resolve({ count: 0 }),
    location?.published_menu_version_id
      ? supabase
          .from("menu_versions")
          .select("published_at, item_count")
          .eq("id", location.published_menu_version_id)
          .single()
      : Promise.resolve({ data: null }),
    // The same rows the menu editor checks, so both pages agree on
    // "unpublished changes" (menuHasChanges).
    supabase.from("items").select("updated_at, is_active").eq("restaurant_id", rid),
    supabase.from("categories").select("updated_at").eq("restaurant_id", rid),
    supabase.from("modifier_groups").select("updated_at").eq("restaurant_id", rid),
  ]);

  // Pause and closed-kitchen state (ADR-068). Read on its own so the page still
  // works before the migration has reached this database: no columns, no section.
  let venue: VenueState | null = null;
  if (location) {
    const { data: v, error } = await supabase
      .from("locations")
      .select("ordering_paused, ordering_paused_until, kitchen_closed_until")
      .eq("id", location.id)
      .maybeSingle();
    if (v && !error)
      venue = {
        paused: v.ordering_paused,
        pausedUntil: v.ordering_paused_until,
        closedUntil: v.kitchen_closed_until,
      };
  }

  // Problem tables (ADR-071): the limits and the live list. Read on their own, so
  // a database without the migration shows no panel and no settings.
  let alertSettings: AlertSettings | null = null;
  let alerts: TableAlert[] | null = null;
  if (location) {
    const loose = supabase as unknown as SupabaseClient;
    const [{ data: a, error: aError }, list] = await Promise.all([
      loose
        .from("locations")
        .select("overdue_minutes, repeat_call_threshold")
        .eq("id", location.id)
        .maybeSingle(),
      loose.schema("api").rpc("table_alerts", { p_location_id: location.id }),
    ]);
    if (a && !aError && !list.error) {
      alertSettings = { overdueMinutes: a.overdue_minutes, repeatCalls: a.repeat_call_threshold };
      alerts = parseAlerts(list.data);
    }
  }

  // Staff sounds (ADR-088): read on their own, so a database without the migration hides the section.
  let staffSounds: StaffSounds | null = null;
  if (location) {
    const { data: row, error } = await (supabase as unknown as SupabaseClient)
      .from("locations")
      .select("order_sound, call_sound")
      .eq("id", location.id)
      .maybeSingle();
    if (row && !error)
      staffSounds = {
        orderSound: soundOr(row.order_sound, DEFAULT_ORDER_SOUND),
        callSound: soundOr(row.call_sound, DEFAULT_CALL_SOUND),
      };
  }

  // Promotions (ADR-070): also read on its own, so a database without the table hides the section.
  let promos: Promo[] | null = null;
  if (location) {
    const { data: rows, error } = await supabase
      .from("promos")
      .select("id, title, body, badge, is_on, starts_at, ends_at")
      .eq("location_id", location.id)
      .order("created_at")
      .order("id");
    if (rows && !error) promos = rows.map(promoFromRow);
  }

  // Game rewards (ADR-075): no row means off; an error (no table yet) hides the section.
  let rewards: RewardSettings | null = null;
  if (location) {
    const { data: row, error } = await (supabase as unknown as SupabaseClient)
      .from("game_reward_settings")
      .select("game_rewards_on, reward_kind, reward_level, reward_percent, reward_text, reward_game")
      .eq("location_id", location.id)
      .maybeSingle();
    if (!error) rewards = settingsFromRow(row);
  }

  let data: Dashboard | null = null;
  try {
    data = sales.error ? null : parseDashboard(sales.data);
  } catch {
    data = null;
  }

  const publishedAt = version.data?.published_at ?? null;
  const todos: Todo[] = [];
  if (publishedAt === null) todos.push({ key: "publish", href: "/admin/menu", text: t("notPublished") });
  else if (
    menuHasChanges({
      publishedAt,
      publishedItemCount: version.data?.item_count,
      categories: cats.data,
      items: items.data,
      groups: groups.data,
    })
  )
    todos.push({ key: "publish", href: "/admin/menu", text: t("unpublished") });
  if ((tables.count ?? 0) === 0) todos.push({ key: "tables", href: "/admin/tables", text: t("noTables") });
  if ((devices.count ?? 0) === 0) todos.push({ key: "devices", href: "/admin/staff", text: t("noDevices") });
  if ((noPhoto.count ?? 0) > 0)
    todos.push({ key: "photos", href: "/admin/menu", text: t("noPhotos", { count: noPhoto.count ?? 0 }) });
  if ((stops.count ?? 0) > 0)
    todos.push({ key: "stops", href: "/admin/menu", text: t("stopList", { count: stops.count ?? 0 }) });

  const delta = data ? deltaPercent(data.summary.revenue, data.compare.revenue) : null;
  const subtitle = (
    <p className="num m-0">
      {t("welcome", { name: member.displayName })}
      {location &&
        ` · ${t("date", {
          date: formatDate(new Date(), locale, location.timezone),
          time: formatTime(new Date(), location.timezone),
        })}`}
    </p>
  );

  return (
    <AdminPage title={restaurant?.name} subtitle={subtitle} width="md">
      {member.role === "owner" && <PlanBanner restaurantId={rid} locale={locale} />}

      <Section
        title={t("today")}
        id="home-today"
        testId="home-today"
        actions={
          <Link
            href="/admin/dashboard"
            className={textAction("ink")}
          >
            {t("allSales")}
            <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
        }
      >
        {data ? (
          // The same KPI row as Sales and Reports: figures on the page, 15 px
          // labels, a hairline between the figures from 640 px.
          <dl className="num m-0 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 sm:gap-x-0">
            <div className={clsx(kpi, "col-span-2 sm:col-span-1")}>
              <dt className={kpiLabel}>{d("revenue")}</dt>
              <dd className={clsx(kpiFigure, "xl:text-figure")} data-testid="home-revenue">
                {formatAmd(data.summary.revenue, locale)}
              </dd>
              <dd className="text-staff-label2 m-0 text-label">
                {delta === null
                  ? d("noCompare")
                  : `${delta === 0 ? d("deltaSame") : d(delta > 0 ? "deltaUp" : "deltaDown", { pct: Math.abs(delta) })} ${d("compareToday")}`}
              </dd>
            </div>
            <div className={kpi}>
              <dt className={kpiLabel}>{d("orders")}</dt>
              <dd className={clsx(kpiFigure, "xl:text-figure")}>{formatInteger(data.summary.orders, locale)}</dd>
            </div>
            <div className={kpi}>
              <dt className={kpiLabel}>{d("openTables")}</dt>
              <dd className={clsx(kpiFigure, "xl:text-figure")}>{formatInteger(data.open_tables.count, locale)}</dd>
              {data.open_tables.count > 0 && (
                <dd className="text-staff-label2 m-0 text-label">
                  {formatAmd(data.open_tables.total, locale)}
                </dd>
              )}
            </div>
          </dl>
        ) : (
          <p className="text-staff-label2 m-0 text-name">{t("noSales")}</p>
        )}
      </Section>

      <NextIntlClientProvider>
        {/* One attention list (setup to-dos and live problem tables). It is
            always there, so the owner learns where to look. */}
        <Section title={t("attention")} id="home-attention" testId="home-attention">
          <AttentionPanel
            locationId={location && alerts ? location.id : null}
            initial={alerts ?? []}
            todos={todos}
            allClear={t("allClear")}
          />
        </Section>

        {location && venue && (
          <Section title={t("ordering")} hint={t("orderingHint")} id="home-ordering" testId="home-ordering">
            <VenueControls initial={venue} timeZone={location.timezone} />
          </Section>
        )}

        {location && promos && (
          <Section title={t("promos")} hint={t("promosHint")} id="home-promos" testId="home-promos">
            <PromoManager initial={promos} timeZone={location.timezone} />
          </Section>
        )}

        {location && (alertSettings || staffSounds || rewards) && (
          <Section title={t("settings")} id="home-settings" bare>
            <SettingsList>
              {alertSettings && (
                <SettingsItem
                  title={t("alertSettings")}
                  value={t("alertsValue", {
                    minutes: alertSettings.overdueMinutes,
                    calls: alertSettings.repeatCalls,
                  })}
                  hint={t("alertSettingsHint")}
                  testId="home-alerts"
                >
                  <AlertSettingsForm initial={alertSettings} />
                </SettingsItem>
              )}
              {staffSounds && (
                <SettingsItem
                  title={t("sounds")}
                  value={t("soundsValue", {
                    order: s(`names.${staffSounds.orderSound}`),
                    call: s(`names.${staffSounds.callSound}`),
                  })}
                  hint={t("soundsHint")}
                  testId="home-sounds"
                >
                  <SoundSettingsForm initial={staffSounds} />
                </SettingsItem>
              )}
              {rewards && (
                <SettingsItem
                  title={t("rewards")}
                  value={rewards.on ? t("rewardsOn") : t("rewardsOff")}
                  hint={t("rewardsHint")}
                  testId="home-rewards"
                >
                  <RewardsForm initial={rewards} />
                </SettingsItem>
              )}
            </SettingsList>
          </Section>
        )}
      </NextIntlClientProvider>
    </AdminPage>
  );
}
