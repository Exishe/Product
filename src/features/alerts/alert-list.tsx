import { Ban, BellRing, Hourglass } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { dishName, type TableAlert } from "./model";

// One line per problem table: which table, what is wrong, for how long.
export function AlertList({ alerts, dark = false }: { alerts: TableAlert[]; dark?: boolean }) {
  const t = useTranslations("alerts");
  const locale = useLocale();
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0" data-testid="alert-list">
      {alerts.map((a) => {
        const Icon = a.reason === "calls" ? BellRing : a.reason === "cant_make" ? Ban : Hourglass;
        return (
          <li
            key={`${a.reason}:${a.id}`}
            data-testid="alert-row"
            className={
              dark
                ? "bg-amber-tint text-amber-text flex min-h-11 items-start gap-2 rounded-xl px-3 py-2 text-[0.9375rem] leading-snug font-semibold"
                : "bg-amber-tint text-ink flex min-h-11 items-start gap-3 rounded-xl px-3 py-2.5 text-[1.0625rem] leading-snug"
            }
          >
            <Icon aria-hidden="true" className="text-amber-text mt-0.5 size-5 shrink-0" />
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
              <strong className="font-semibold">
                {a.table ? t("table", { table: a.table }) : t("noTable", { number: a.number ?? 0 })}
              </strong>
              {" · "}
              {a.reason === "calls"
                ? t("calls", { count: a.presses ?? 0, minutes: a.minutes })
                : a.reason === "cant_make"
                  ? t("cantMake", { dish: dishName(a.dish, locale) })
                  : t("slow", { minutes: a.minutes })}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
