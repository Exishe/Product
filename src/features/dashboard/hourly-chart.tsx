import type { HourRow } from "./model";

export type HourlyText = {
  title: string;
  seriesNow: string;
  seriesBefore: string;
  tip: (row: HourRow, from: string, to: string) => string;
  showTable: string;
  colHour: string;
  colNow: string;
  colBefore: string;
};

const pad = (h: number) => `${String(h % 24).padStart(2, "0")}:00`;

// Orders per hour as columns (tarragon), with the comparison period as a grey
// level mark in each column. Plain HTML, no chart library and no client JS:
// the native tooltip and the table below carry the exact numbers.
export function HourlyChart({ rows, text }: { rows: readonly HourRow[]; text: HourlyText }) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.orders, r.compare_orders)));
  const top = niceCeil(max);
  const ticks = [top, Math.round(top / 2), 0];
  const labelEvery = rows.length > 12 ? 3 : rows.length > 8 ? 2 : 1;

  return (
    <figure className="flex flex-col gap-3" aria-labelledby="hourly-title">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 id="hourly-title" className="text-xl font-semibold">
          {text.title}
        </h2>
        <ul className="text-muted flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <li className="flex items-center gap-2">
            <span aria-hidden className="bg-tarragon inline-block h-3 w-3 rounded-[3px]" />
            {text.seriesNow}
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden className="bg-line-strong inline-block h-0.5 w-4" />
            {text.seriesBefore}
          </li>
        </ul>
      </figcaption>

      <div className="grid grid-cols-[auto_1fr] gap-x-2" aria-hidden>
        <div className="num text-muted flex h-44 flex-col justify-between text-right text-xs">
          {ticks.map((v, i) => (
            <span key={i} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">
              {v}
            </span>
          ))}
        </div>
        <div className="border-line relative h-44 border-b">
          <div className="border-mist absolute inset-x-0 top-0 border-t" />
          <div className="border-mist absolute inset-x-0 top-1/2 border-t" />
          <div className="absolute inset-0 flex">
            {rows.map((r) => (
              <div
                key={r.hour}
                title={text.tip(r, pad(r.hour), pad(r.hour + 1))}
                data-testid="hour-column"
                className="group hover:bg-mist/60 relative flex h-full flex-1 items-end justify-center px-px"
              >
                <div
                  className="bg-tarragon w-full max-w-6 rounded-t-[4px]"
                  style={{ height: `${(r.orders / top) * 100}%` }}
                />
                {r.compare_orders > 0 && (
                  <div
                    className="bg-line-strong absolute inset-x-1 h-0.5 rounded-full ring-2 ring-white"
                    style={{ bottom: `calc(${(r.compare_orders / top) * 100}% - 1px)` }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
        <span />
        <div className="num text-muted flex pt-1 text-xs">
          {rows.map((r, i) => (
            <span key={r.hour} className="flex-1 text-center">
              {i % labelEvery === 0 ? String(r.hour).padStart(2, "0") : ""}
            </span>
          ))}
        </div>
      </div>

      <details className="text-sm">
        <summary className="text-tarragon inline-flex min-h-11 cursor-pointer items-center font-semibold">
          {text.showTable}
        </summary>
        <table className="num mt-2 w-full max-w-md text-left">
          <thead className="text-muted">
            <tr>
              <th className="py-1 font-semibold">{text.colHour}</th>
              <th className="py-1 text-right font-semibold">{text.colNow}</th>
              <th className="py-1 text-right font-semibold">{text.colBefore}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.hour} className="border-line border-t">
                <td className="py-1">
                  {pad(r.hour)}–{pad(r.hour + 1)}
                </td>
                <td className="py-1 text-right">{r.orders}</td>
                <td className="py-1 text-right">{r.compare_orders}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

// A round, even top for the axis, so the half-way tick is a whole number too.
function niceCeil(n: number): number {
  for (const step of [2, 4, 6, 10, 20, 40, 60, 100, 200, 400, 600, 1000]) if (n <= step) return step;
  return Math.ceil(n / 1000) * 1000;
}
