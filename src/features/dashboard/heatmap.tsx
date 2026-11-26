import { clsx } from "clsx";
import { FadeScroll } from "@/features/admin-ui/fade-scroll";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { heatGrid, heatLevel, type Heatmap } from "./insights-model";

const pad = (h: number) => `${String(h % 24).padStart(2, "0")}:00`;

// Ink at five strengths: a single-hue scale that reads in greyscale and needs
// no legend colours. Level 0 (no orders) is the plain staff fill.
const LEVEL = ["bg-staff-fill", "bg-ink/15", "bg-ink/35", "bg-ink/60", "bg-ink"] as const;

// 2024-01-01 was a Monday: weekday names in the viewer's language, ISO order.
function weekdays(locale: Locale): string[] {
  const f = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  return Array.from({ length: 7 }, (_, i) => f.format(new Date(Date.UTC(2024, 0, 1 + i))));
}

// Average orders per weekday and hour (ADR-057): a real table, so screen
// readers get rows and columns; each cell's number is in its text, visually
// hidden, and in its title for a pointer. Plain HTML, no chart library.
export async function SalesHeatmap({ map, locale }: { map: Heatmap; locale: Locale }) {
  const t = await getTranslations("insights.heatmap");
  const grid = heatGrid(map);
  const days = weekdays(locale);
  const fmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const span = (dow: number, hour: number) => ({
    day: days[dow - 1] ?? "",
    from: pad(hour),
    to: pad(hour + 1),
  });

  return (
    <section
      aria-labelledby="heatmap-title"
      className="flex min-w-0 flex-col gap-4"
      data-testid="sales-heatmap"
    >
      <div className="border-staff-sep flex flex-col gap-1 border-b pb-3">
        <h2 id="heatmap-title" className="m-0 text-heading font-semibold">
          {t("title")}
        </h2>
        <p className="text-staff-label2 m-0 text-label">{t("hint", { weeks: map.weeks })}</p>
      </div>

      {grid.hours.length === 0 ? (
        <p className="text-staff-label2 m-0 text-[1.0625rem]">{t("empty")}</p>
      ) : (
        <>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[1.0625rem]">
            {grid.busiest && (
              <li data-testid="heatmap-busiest">
                {t("busiest", {
                  ...span(grid.busiest.dow, grid.busiest.hour),
                  avg: fmt.format(grid.busiest.avg),
                })}
              </li>
            )}
            {/* A quietest hour of "about 0" says nothing: then it is left out. */}
            {grid.quietest && fmt.format(grid.quietest.avg) !== fmt.format(0) && (
              <li className="text-staff-label2">
                {t("quietest", {
                  ...span(grid.quietest.dow, grid.quietest.hour),
                  avg: fmt.format(grid.quietest.avg),
                })}
              </li>
            )}
          </ul>
          {/* On a phone the grid scrolls sideways; the right edge fades while
              more hours are hidden there. */}
          <FadeScroll className="relative -mx-1 overflow-x-auto px-1 pb-1">
            <table className="num w-full border-separate border-spacing-[3px] text-meta">
              <caption className="sr-only">{t("hint", { weeks: map.weeks })}</caption>
              <thead>
                <tr>
                  <th scope="col" className="sr-only">
                    {t("colDay")}
                  </th>
                  {grid.hours.map((h, i) => (
                    <th
                      key={h}
                      scope="col"
                      className="text-staff-label2 min-w-5 p-0 text-center font-semibold"
                      aria-label={pad(h)}
                    >
                      {i % 2 === 0 ? String(h).padStart(2, "0") : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.rows.map((row, d) => (
                  <tr key={d}>
                    <th
                      scope="row"
                      className="text-staff-label2 pr-1.5 text-left text-meta font-semibold whitespace-nowrap"
                    >
                      {days[d]}
                    </th>
                    {row.map((v, i) => {
                      const label = t("cell", { ...span(d + 1, grid.hours[i] ?? 0), avg: fmt.format(v) });
                      return (
                        <td
                          key={i}
                          title={label}
                          className={clsx("h-7 min-w-5 rounded-[4px] p-0", LEVEL[heatLevel(v, grid.max)])}
                        >
                          <span className="sr-only">{label}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </FadeScroll>
          <div aria-hidden="true" className="text-staff-label2 flex items-center gap-1.5 text-meta">
            {t("less")}
            {LEVEL.map((c) => (
              <span key={c} className={clsx("size-4 rounded-[3px]", c)} />
            ))}
            {t("more")}
          </div>
        </>
      )}
    </section>
  );
}
