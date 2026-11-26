import { clsx } from "clsx";
import { ChevronDown, ChevronRight, Info } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { textAction } from "@/features/admin-ui/styles";
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

      {/* The basis note is a status line, not a box: an icon, the words and
          the one thing to do about it, with clear space before the quadrants. */}
      {any && basis !== "margin" && (
        <div className="mb-3 flex max-w-3xl flex-col gap-0.5" data-testid="matrix-basis">
          <p className="text-staff-label2 m-0 flex items-start gap-2 text-body">
            <Info aria-hidden="true" className="mt-0.5 size-[1.125rem] shrink-0" />
            <span>{t(matrix.owner ? (basis === "mixed" ? "basisMixed" : "basisPrice") : "basisManager")}</span>
          </p>
          {matrix.owner && (
            <Link href="/admin/menu" className={textAction("ink", "-ml-2 w-fit self-start")}>
              {t("addCosts")}
              <ChevronRight aria-hidden="true" />
            </Link>
          )}
        </div>
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
            <DishRow key={d.id} d={d} locale={locale} t={t} first />
          ))}
        </ol>
      )}
      {/* The rest opens in place: the summary is a text action that gives
          way to the remaining rows. */}
      {dishes.length > SHOWN && (
        <details className="group -mt-3">
          <summary
            className={textAction("ink", "-ml-2 w-fit list-none group-open:hidden [&::-webkit-details-marker]:hidden")}
          >
            {t("more", { count: dishes.length - SHOWN })}
            <ChevronDown aria-hidden="true" />
          </summary>
          <ol className="m-0 flex list-none flex-col p-0">
            {dishes.slice(SHOWN).map((d) => (
              <DishRow key={d.id} d={d} locale={locale} t={t} />
            ))}
          </ol>
        </details>
      )}
    </li>
  );
}

function DishRow({
  d,
  locale,
  t,
  first,
}: {
  d: ReturnType<typeof byQuadrant>[Quadrant][number];
  locale: Locale;
  t: T;
  first?: boolean;
}) {
  return (
    <li className={clsx("border-staff-sep flex items-baseline gap-3 border-t py-2", first && "first:border-0")}>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-semibold break-words" lang={dishNameLocale(d.name, locale)}>
          {dishName(d.name, locale)}
        </span>
        <span className="text-staff-label2 text-label break-words">{dishName(d.section, locale)}</span>
      </span>
      <span className="num flex shrink-0 flex-col items-end text-[0.9375rem]">
        <span>{t("sold", { count: d.qty, qty: formatInteger(d.qty, locale) })}</span>
        <span className="text-staff-label2">
          {d.basis === "margin" ? t("perPortion", { amount: formatAmd(d.margin, locale) }) : formatAmd(d.price, locale)}
        </span>
      </span>
    </li>
  );
}

// The matrix in one line, for the Reports page: how many dishes sit in each
// quadrant and the way to the full analysis, so the matrix itself lives on
// one page only (Menu analysis).
export async function MenuMatrixSummary({ matrix, href }: { matrix: Matrix; href: string }) {
  const t = await getTranslations("insights.matrix");
  const groups = byQuadrant(matrix);
  const any = QUADRANTS.some((q) => groups[q].length > 0);
  return (
    <section aria-labelledby="matrix-title" className="flex min-w-0 flex-col gap-3" data-testid="menu-matrix">
      <div className="border-staff-sep flex flex-col gap-1 border-b pb-3">
        <h2 id="matrix-title" className="m-0 text-heading font-semibold">
          {t("title")}
        </h2>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        {any ? (
          <ul className="m-0 flex list-none flex-wrap items-center gap-x-5 gap-y-2 p-0">
            {QUADRANTS.map((q) => (
              <li key={q} className="flex items-center gap-2 text-body" data-testid={`quadrant-${q}`}>
                <QuadrantMark q={q} />
                <span>{t(`${q}.name`)}</span>
                <span className="num font-semibold">{groups[q].length}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-staff-label2 m-0 text-body">{t("noSales")}</p>
        )}
        <Link href={href} className={textAction("ink", "-mx-2")}>
          {t("open")}
          <ChevronRight aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
