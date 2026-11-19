import { CircleCheck, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { AdminPage, Notice, Section } from "@/features/admin-ui/page";
import { PlanBanner } from "@/features/billing/plan-banner";
import { deltaPercent, parseDashboard, type Dashboard } from "@/features/dashboard/model";
import { businessDate } from "@/features/dashboard/range";
import { requireMember } from "@/lib/auth/require-member";
import { formatDate, formatTime } from "@/lib/format/date";
import { formatAmd, formatInteger } from "@/lib/format/money";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";

type Todo = { key: string; href: string; text: string };

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
  const [t, d] = await Promise.all([getTranslations("admin.home"), getTranslations("dashboard")]);

  const today = location ? businessDate(new Date(), location.timezone, location.business_day_starts) : null;
  const count = { count: "exact", head: true } as const;
  const [sales, noPhoto, tables, devices, stops, version, lastItem, lastCat] = await Promise.all([
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
          .select("published_at")
          .eq("id", location.published_menu_version_id)
          .single()
      : Promise.resolve({ data: null }),
    supabase
      .from("items")
      .select("updated_at")
      .eq("restaurant_id", rid)
      .order("updated_at", { ascending: false })
      .limit(1),
    supabase
      .from("categories")
      .select("updated_at")
      .eq("restaurant_id", rid)
      .order("updated_at", { ascending: false })
      .limit(1),
  ]);

  let data: Dashboard | null = null;
  try {
    data = sales.error ? null : parseDashboard(sales.data);
  } catch {
    data = null;
  }

  const publishedAt = version.data?.published_at ? Date.parse(version.data.published_at) : null;
  const lastEdit = Math.max(
    ...[lastItem.data?.[0]?.updated_at, lastCat.data?.[0]?.updated_at].map((x) => (x ? Date.parse(x) : 0)),
  );
  const todos: Todo[] = [];
  if (publishedAt === null) todos.push({ key: "publish", href: "/admin/menu", text: t("notPublished") });
  else if (lastEdit > publishedAt)
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
            className="text-ink inline-flex min-h-11 items-center gap-0.5 text-[0.9375rem] font-semibold underline underline-offset-4"
          >
            {t("allSales")}
            <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
        }
      >
        {data ? (
          <dl className="num m-0 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
            <div className="col-span-2 flex flex-col gap-0.5 sm:col-span-1">
              <dt className="text-staff-label2 text-[0.9375rem] font-semibold">{d("revenue")}</dt>
              <dd className="m-0 text-[1.75rem] leading-tight font-bold" data-testid="home-revenue">
                {formatAmd(data.summary.revenue, locale)}
              </dd>
              <dd className="text-staff-label2 m-0 text-[0.9375rem]">
                {delta === null
                  ? d("noCompare")
                  : `${delta === 0 ? d("deltaSame") : d(delta > 0 ? "deltaUp" : "deltaDown", { pct: Math.abs(delta) })} ${d("compareToday")}`}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-staff-label2 text-[0.9375rem] font-semibold">{d("orders")}</dt>
              <dd className="m-0 text-[1.75rem] leading-tight font-bold">
                {formatInteger(data.summary.orders, locale)}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-staff-label2 text-[0.9375rem] font-semibold">{d("openTables")}</dt>
              <dd className="m-0 text-[1.75rem] leading-tight font-bold">
                {formatInteger(data.open_tables.count, locale)}
              </dd>
              {data.open_tables.count > 0 && (
                <dd className="text-staff-label2 m-0 text-[0.9375rem]">
                  {formatAmd(data.open_tables.total, locale)}
                </dd>
              )}
            </div>
          </dl>
        ) : (
          <p className="text-staff-label2 m-0 text-[1.0625rem]">{t("noSales")}</p>
        )}
      </Section>

      <Section title={t("todo")} id="home-todo" testId="home-todo" bare>
        {todos.length === 0 ? (
          <Notice tone="info" icon={<CircleCheck aria-hidden="true" />}>
            <p className="m-0">{t("allSet")}</p>
          </Notice>
        ) : (
          <ul className="m-0 flex list-none flex-col overflow-hidden rounded-2xl bg-white p-0">
            {todos.map((todo) => (
              <li key={todo.key} className="border-staff-sep border-t first:border-0">
                <Link
                  href={todo.href}
                  data-testid={`todo-${todo.key}`}
                  className="flex min-h-14 items-center gap-3 px-4 py-3 text-[1.0625rem]"
                >
                  <span className="min-w-0 flex-1 break-words">{todo.text}</span>
                  <ChevronRight aria-hidden="true" className="text-staff-label2 size-5 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </AdminPage>
  );
}
