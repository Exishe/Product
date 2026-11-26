import { clsx } from "clsx";
import { CalendarRange } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { button, fieldLabel } from "@/features/admin-ui/styles";
import { DateField } from "./date-field";
import { addDays, MAX_DAYS, PRESETS, type Preset, type Range } from "./range";

// Presets as a segmented control of links and a custom range as a plain GET
// form: works without JS. The two date fields show only on «Other dates»
// (its link opens the current range as a custom one), so the control is one
// line until the owner asks for something else.
export async function RangePicker({
  range,
  today,
  basePath = "/admin/dashboard",
  defaultPreset = "today",
  hidden,
}: {
  range: Range;
  today: string;
  /** The page the links and the form go to. */
  basePath?: string;
  /** The preset shown when the address has no range (its link carries no query). */
  defaultPreset?: Preset;
  /** Other query values to keep when a custom range is applied. */
  hidden?: Record<string, string>;
}) {
  const [t, locale] = await Promise.all([getTranslations("dashboard"), getLocale()]);
  const custom = range.preset === "custom";
  const customHref = `${basePath}?${new URLSearchParams({ ...hidden, from: range.from, to: range.to })}`;
  const segment = (on: boolean) =>
    clsx(
      "flex min-h-11 items-center justify-center rounded-[0.625rem] px-2 text-center text-[0.9375rem] leading-tight font-semibold sm:px-3",
      on ? "text-ink bg-white shadow-sm" : "text-staff-label2 hover:text-ink",
    );
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
      <nav aria-label={t("rangeLabel")} className="w-full sm:w-auto">
        <ul className="bg-staff-fill m-0 grid list-none auto-cols-fr grid-flow-col gap-1 rounded-xl p-1">
          {PRESETS.map((p) => (
            <li key={p}>
              <Link
                href={p === defaultPreset ? basePath : `${basePath}?range=${p}`}
                aria-current={range.preset === p ? "page" : undefined}
                className={segment(range.preset === p)}
              >
                {t(`ranges.${p}`)}
              </Link>
            </li>
          ))}
          <li>
            <Link
              href={customHref}
              aria-current={custom ? "page" : undefined}
              className={segment(custom)}
              data-testid="range-custom"
            >
              {/* A phone has room for four words and a calendar, not five words. */}
              <CalendarRange aria-hidden="true" className="size-5 shrink-0 sm:hidden" />
              <span className="max-sm:sr-only">{t("ranges.custom")}</span>
            </Link>
          </li>
        </ul>
      </nav>
      {custom && (
      <form method="get" action={basePath} className="flex flex-wrap items-end gap-2">
        {Object.entries(hidden ?? {}).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
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
      )}
    </div>
  );
}
