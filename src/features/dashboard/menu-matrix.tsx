import { clsx } from "clsx";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { formatAmd, formatInteger } from "@/lib/format/money";
import type { Locale } from "@/i18n/routing";
import { byQuadrant, matrixBasis, QUADRANTS, type Matrix, type Quadrant } from "./insights-model";
import { dishName, dishNameLocale } from "./model";

const SHOWN = 6;

// The menu engineering matrix (ADR-057) as four plain cards in the classic
// 2 × 2 order: ordered often on top, earning more on the left. Each card says
// what to do with its dishes; names, units and margin carry the detail.
export async function MenuMatrix({ matrix, locale }: { matrix: Matrix; locale: Locale }) {
  const t = await getTranslations("insights.matrix");
  const groups = byQuadrant(matrix);
  const basis = matrixBasis(matrix);
  const any = QUADRANTS.some((q) => groups[q].length > 0);

  return (
    <section aria-labelledby="matrix-title" className="flex min-w-0 flex-col gap-3" data-testid="menu-matrix">
      <div className="border-staff-sep flex flex-col gap-1 border-b pb-3">
        <h2 id="matrix-title" className="m-0 text-heading font-semibold">
          {t("title")}
        </h2>
        <p className="text-staff-label2 m-0 max-w-prose text-label">{t("hint")}</p>
      </div>

      {any && basis !== "margin" && (
        <p
          className="bg-amber-tint m-0 flex max-w-3xl flex-col gap-1 rounded-2xl px-4 py-3 text-[1.0625rem]"
          data-testid="matrix-basis"
        >
          <span>{t(matrix.owner ? (basis === "mixed" ? "basisMixed" : "basisPrice") : "basisManager")}</span>
          {matrix.owner && (
            <Link href="/admin/menu" className="text-ink w-fit font-semibold underline underline-offset-4">
              {t("addCosts")}
            </Link>
          )}
        </p>
      )}

      {!any ? (
        <p className="text-staff-label2 m-0 py-2 text-name">
          {t("noSales")}
        </p>
      ) : (
        <ul className="m-0 grid list-none gap-x-8 gap-y-8 p-0 md:grid-cols-2">
          {QUADRANTS.map((q) => (
            <QuadrantCard key={q} q={q} dishes={groups[q]} locale={locale} t={t} />
          ))}
        </ul>
      )}
    </section>
  );
}

type T = Awaited<ReturnType<typeof getTranslations<"insights.matrix">>>;

// One mark per quadrant: a small 2 × 2 square with its own cell filled, so
// the card's place in the matrix shows without relying on colour.
function QuadrantMark({ q }: { q: Quadrant }) {
  const at = QUADRANTS.indexOf(q);
  return (
    <span aria-hidden="true" className="grid size-6 shrink-0 grid-cols-2 gap-0.5">
      {QUADRANTS.map((_, i) => (
        <span key={i} className={clsx("rounded-[3px]", i === at ? "bg-ink" : "bg-staff-fill")} />
      ))}
    </span>
  );
}

function QuadrantCard({
  q,
  dishes,
  locale,
  t,
}: {
  q: Quadrant;
  dishes: ReturnType<typeof byQuadrant>[Quadrant];
  locale: Locale;
  t: T;
}) {
  const shown = dishes.slice(0, SHOWN);
  return (
    <li
      className="flex min-w-0 flex-col gap-3"
      data-testid={`quadrant-${q}`}
      aria-labelledby={`q-${q}`}
    >
      <div className="flex items-start gap-3">
        <QuadrantMark q={q} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 id={`q-${q}`} className="m-0 text-name leading-tight font-semibold">
            {t(`${q}.name`)}
            <span className="text-staff-label2 num font-semibold"> · {dishes.length}</span>
          </h3>
          <p className="m-0 text-[0.9375rem] font-semibold">{t(`${q}.title`)}</p>
          <p className="text-staff-label2 m-0 text-[0.9375rem]">{t(`${q}.action`)}</p>
        </div>
      </div>
      {dishes.length === 0 ? (
        <p className="text-staff-label2 m-0 text-[0.9375rem]">{t("none")}</p>
      ) : (
        <ol className="m-0 flex list-none flex-col p-0">
          {shown.map((d) => (
            <li
              key={d.id}
              className="border-staff-sep flex items-baseline gap-3 border-t py-2 first:border-0"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold break-words" lang={dishNameLocale(d.name, locale)}>
                  {dishName(d.name, locale)}
                </span>
                <span className="text-staff-label2 text-label break-words">
                  {dishName(d.section, locale)}
                </span>
              </span>
              <span className="num flex shrink-0 flex-col items-end text-[0.9375rem]">
                <span>{t("sold", { count: d.qty, qty: formatInteger(d.qty, locale) })}</span>
                <span className="text-staff-label2">
                  {d.basis === "margin"
                    ? t("perPortion", { amount: formatAmd(d.margin, locale) })
                    : formatAmd(d.price, locale)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
      {dishes.length > SHOWN && (
        <p className="text-staff-label2 m-0 text-[0.9375rem]">
          {t("more", { count: dishes.length - SHOWN })}
        </p>
      )}
    </li>
  );
}
