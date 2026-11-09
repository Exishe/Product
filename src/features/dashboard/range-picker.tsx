import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { addDays, MAX_DAYS, PRESETS, type Range } from "./range";

// Presets as links and a custom range as a plain GET form: works without JS.
export async function RangePicker({ range, today }: { range: Range; today: string }) {
  const t = await getTranslations("dashboard");
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
      <nav aria-label={t("rangeLabel")}>
        <ul className="rounded-input bg-mist flex flex-wrap gap-1 p-1">
          {PRESETS.map((p) => (
            <li key={p}>
              <Link
                href={p === "today" ? "/admin/dashboard" : `/admin/dashboard?range=${p}`}
                aria-current={range.preset === p ? "page" : undefined}
                className={`rounded-chip flex min-h-11 items-center px-3 font-semibold ${
                  range.preset === p ? "text-ink bg-white shadow-sm" : "text-muted hover:text-ink"
                }`}
              >
                {t(`ranges.${p}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <form method="get" action="/admin/dashboard" className="flex flex-wrap items-end gap-2">
        <label className="text-muted flex flex-col text-sm font-semibold">
          {t("from")}
          <input
            type="date"
            name="from"
            defaultValue={range.from}
            min={addDays(today, -(MAX_DAYS * 4))}
            max={today}
            className="num rounded-input border-line-strong text-ink h-11 border bg-white px-2 text-base"
          />
        </label>
        <label className="text-muted flex flex-col text-sm font-semibold">
          {t("to")}
          <input
            type="date"
            name="to"
            defaultValue={range.to}
            max={today}
            className="num rounded-input border-line-strong text-ink h-11 border bg-white px-2 text-base"
          />
        </label>
        <button
          type="submit"
          className="rounded-input border-line-strong h-11 border bg-white px-4 font-semibold"
        >
          {t("apply")}
        </button>
      </form>
    </div>
  );
}
