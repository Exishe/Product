import { clsx } from "clsx";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { button, fieldLabel } from "@/features/admin-ui/styles";
import { DateField } from "./date-field";
import { addDays, MAX_DAYS, PRESETS, type Range } from "./range";

// Presets as a segmented control of links and a custom range as a plain GET
// form: works without JS.
export async function RangePicker({ range, today }: { range: Range; today: string }) {
  const [t, locale] = await Promise.all([getTranslations("dashboard"), getLocale()]);
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
      <nav aria-label={t("rangeLabel")} className="w-full sm:w-auto">
        <ul className="bg-staff-fill m-0 grid list-none auto-cols-fr grid-flow-col gap-1 rounded-xl p-1">
          {PRESETS.map((p) => (
            <li key={p}>
              <Link
                href={p === "today" ? "/admin/dashboard" : `/admin/dashboard?range=${p}`}
                aria-current={range.preset === p ? "page" : undefined}
                className={clsx(
                  "flex min-h-11 items-center justify-center rounded-[0.625rem] px-3 text-center text-[0.9375rem] font-semibold",
                  range.preset === p ? "text-ink bg-white shadow-sm" : "text-staff-label2",
                )}
              >
                {t(`ranges.${p}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <form method="get" action="/admin/dashboard" className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className={fieldLabel}>{t("from")}</span>
          <DateField
            name="from"
            value={range.from}
            min={addDays(today, -(MAX_DAYS * 4))}
            max={today}
            locale={locale}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={fieldLabel}>{t("to")}</span>
          <DateField name="to" value={range.to} max={today} locale={locale} />
        </label>
        <button type="submit" className={button("secondary", "min-h-11 text-[0.9375rem]")}>
          {t("apply")}
        </button>
      </form>
    </div>
  );
}
