import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BrandLink, localeOption } from "@/features/admin-ui/brand";
import { LandingEffects } from "@/features/landing/landing-effects";
import { Showcase, type ShowcasePanel } from "@/features/landing/showcase";
import { qrPath } from "@/features/tables-qr/qr-svg";
import { routing } from "@/i18n/routing";
import { parseServerEnv } from "@/lib/env.server";

// The showcase café «Pativ Demo» (docs/04-operations/showcase-cafe.md), not
// demo-cafe: that one is the CI fixture and is reset by the tests.
const DEMO_MENU = "m/pativ-demo/main";

// The four surfaces in the showcase, each with real screenshots of the
// current build (public/landing/), one set per page language: a 420x688
// phone screen for every surface, plus a 720x688 crop of the kitchen board
// from md up (all at 2x, so 1:1 in the 720x688 stage at xl). The kitchen
// board was shot in the page's language, which a café sets for its kitchen
// (locations.kitchen_locale); a line under the text says so.
const SURFACES = ["menu", "waiter", "kitchen", "admin"] as const;
const WIDE_SURFACES: readonly string[] = ["kitchen"];
const POINTS = ["p1", "p2", "p3"] as const;
const PHONE = { width: 840, height: 1376 };
// The admin list ends 24 px under its last whole dish row, so its picture is
// a little shorter than the screen, by locale; it sits at the top of the same
// 420x688 slot, so the panel keeps its height.
const PHONE_HEIGHT: Partial<Record<(typeof SURFACES)[number], Record<string, number>>> = {
  admin: { hy: 1272, ru: 1310, en: 1348 },
};
const WIDE = { width: 1440, height: 1376 };

// The hero picture: one phone screen of the live demo menu (blue palette,
// 390x780 at 2x), shown whole in a thin phone frame.
const HERO = { width: 780, height: 1560 };

const STEPS = ["step1", "step2", "step3"] as const;
// Three facts the hero doesn't already say: the offline queue, the CSV export
// and the Telegram alerts.
const WHY = ["offline", "export", "telegram"] as const;

// One container for the whole page: 1120 px, 16 px gutters on phones, 32 px from md.
const container = "mx-auto w-full max-w-[1120px] px-4 md:px-8";
const h2 = "m-0 text-[1.375rem] leading-tight font-semibold tracking-[-0.01em] md:text-[1.625rem]";
// Plan features: regular weight in both columns, a short dash before each line.
const planList =
  "text-label m-0 mt-6 flex list-none flex-col gap-2 p-0 leading-normal [&>li]:relative [&>li]:pl-5 [&>li]:before:absolute [&>li]:before:left-0 [&>li]:before:text-slate [&>li]:before:content-['–']";
// From md the two plans share four subgrid rows (name, price, term, button),
// so both 56 px buttons sit on one line right under the price; what follows
// (the terms and the list) flows on its own in the fifth row, top-aligned.
const planColumn =
  "flex flex-col items-start md:row-span-5 md:grid md:grid-rows-subgrid md:content-start md:justify-items-start";
// The plan's terms in one plain sentence under the price.
const planTerms = "text-label m-0 mt-6 max-w-[44ch] leading-normal text-pretty";
const outlineButton =
  "text-ink inline-flex min-h-12 items-center justify-center rounded-full bg-white px-5 text-label font-semibold no-underline shadow-[inset_0_0_0_1px_var(--color-pativ-line)] hover:shadow-[inset_0_0_0_1px_var(--color-pativ-blue)]";
const textLink =
  "text-ink inline-flex min-h-11 items-center text-label font-semibold no-underline underline-offset-4 hover:underline";

// The front door is one white page; the browser bar matches it.
export const viewport: Viewport = { themeColor: "#ffffff" };

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "landing" });
  const title = t("metaTitle");
  const description = t("metaDescription");
  return { title, description, openGraph: { title, description, type: "website", locale } };
}

export default async function LocaleHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("landing");
  const brand = await getTranslations("brand");
  const guest = await getTranslations("guest");

  const demoHref = `/${locale}/${DEMO_MENU}`;
  // Plain links, not client navigation: sign-in, sign-up and pairing have no
  // locale in their URL, so `?lang=` hands them this page's language (the
  // proxy remembers it and redirects to the clean URL; LandingEffects also
  // writes it), and a full page load gives them the right <html lang>.
  const signupHref = `/signup?lang=${locale}`;
  const loginHref = `/login?lang=${locale}`;
  const pairHref = `/pair?lang=${locale}`;
  // From lg the hero carries a QR code of the demo menu, so an owner reading
  // on a laptop can try the guest side on their own phone.
  const demoQr = qrPath(new URL(demoHref, parseServerEnv(process.env).APP_BASE_URL).toString());
  const bold = (chunks: ReactNode) => <strong className="font-semibold">{chunks}</strong>;

  const panels: ShowcasePanel[] = SURFACES.map((s) => ({
    id: s,
    tab: t(`features.${s}.tab`),
    title: t(`features.${s}.title`),
    text: t(`features.${s}.text`),
    points: POINTS.map((k) => t(`features.${s}.${k}`)),
    alt: t(`features.${s}.alt`),
    note: s === "kitchen" ? t("features.kitchen.note") : undefined,
    phone: {
      src: `/landing/show-${s}-${locale}-phone.webp`,
      ...PHONE,
      height: PHONE_HEIGHT[s]?.[locale] ?? PHONE.height,
    },
    wide: WIDE_SURFACES.includes(s) ? { src: `/landing/show-${s}-${locale}.webp`, ...WIDE } : undefined,
    // The dish sheet looks like live UI, so (as the hero) it opens the demo menu.
    link: s === "menu" ? { href: demoHref, label: t("ctaDemo") } : undefined,
  }));

  // The language links: a nav in the header, a plain group again in the footer.
  const languages = (Wrap: "nav" | "div") => (
    <Wrap
      aria-label={guest("language.label")}
      role={Wrap === "div" ? "group" : undefined}
      className="flex items-center"
    >
      {routing.locales.map((l) => (
        <a
          key={l}
          href={`/${l}`}
          lang={l}
          hrefLang={l}
          aria-current={l === locale ? "page" : undefined}
          className={localeOption}
        >
          {guest(`language.${l}`)}
        </a>
      ))}
    </Wrap>
  );

  const signupButton = (
    <a
      href={signupHref}
      className="bg-pativ-blue hover:bg-pativ-blue-deep inline-flex min-h-12 items-center justify-center rounded-full px-5 text-label font-semibold text-white no-underline"
    >
      {t("ctaSignup")}
    </a>
  );

  return (
    <div className="landing-page text-ink relative min-h-dvh bg-white">
      <LandingEffects locale={locale} headerId="landing-header" ctaId="landing-hero-cta" />
      {/* Sticky header. Once the hero's buttons have scrolled away, phones
          swap the language links (also in the footer, and back on scrolling
          up) for a short sign-up pill, so starting is never more than one
          tap away; from sm both always fit. */}
      <header
        id="landing-header"
        className="group data-scrolled:border-hairline sticky top-0 z-20 border-b border-transparent bg-white transition-colors duration-200"
      >
        <div className={`${container} flex h-16 items-center justify-between gap-2`}>
          <BrandLink href={`/${locale}`} name={brand("name")} />
          <div className="flex items-center gap-1 sm:gap-2">
            <a
              href="#pricing"
              className="text-ink text-label hidden min-h-11 items-center px-2 font-semibold no-underline underline-offset-4 hover:underline sm:inline-flex"
            >
              {t("nav.pricing")}
            </a>
            <div className="flex items-center max-sm:group-data-cta:hidden">
              {languages("nav")}
              <span aria-hidden="true" className="bg-hairline mx-1 h-5 w-px" />
            </div>
            <a href={loginHref} className={`${textLink} min-w-11 justify-center px-2`}>
              {t("signIn")}
            </a>
            <a
              href={signupHref}
              className="bg-pativ-blue hover:bg-pativ-blue-deep text-label motion-safe:animate-in motion-safe:fade-in ml-1 hidden min-h-11 items-center rounded-full px-4 font-semibold whitespace-nowrap text-white no-underline group-data-cta:inline-flex motion-safe:duration-200 sm:inline-flex"
            >
              <span className="sm:hidden">{t("nav.signup")}</span>
              <span className="hidden sm:inline">{t("ctaSignup")}</span>
            </a>
          </div>
        </div>
      </header>

      <main>
        {/* Hero: the headline and one phone screen of the real menu, whole and
            on white. The picture opens the live demo. */}
        <section
          className={`${container} grid gap-10 pt-8 pb-14 md:pt-14 md:pb-20 lg:grid-cols-12 lg:items-center lg:gap-8 lg:pt-16`}
        >
          <div className="lg:col-span-6">
            <h1 className="m-0 max-w-[20em] text-[1.875rem] leading-[1.15] font-semibold tracking-[-0.015em] text-balance md:text-[2.25rem] xl:text-[2.5rem]">
              {t("title")}
            </h1>
            <p className="text-slate mt-4 mb-0 max-w-[40ch] text-base leading-normal text-pretty md:mt-5 md:text-[1.0625rem]">
              {t("lead")}
            </p>
            <div id="landing-hero-cta" className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap md:mt-8">
              <a
                href={demoHref}
                className="bg-pativ-blue hover:bg-pativ-blue-deep inline-flex min-h-12 items-center justify-center rounded-full px-5 text-label font-semibold text-white no-underline"
              >
                {t("ctaDemo")}
              </a>
              <a
                href={signupHref}
                className={outlineButton}
              >
                {t("ctaSignup")}
              </a>
            </div>
            <p className="text-slate text-label m-0 mt-4">{t("trial")}</p>
            {/* Laptops only: a phone can't scan its own screen. */}
            <div className="mt-10 hidden items-center gap-5 lg:flex">
              <svg
                viewBox={`0 0 ${demoQr.size} ${demoQr.size}`}
                role="img"
                aria-label={t("qr.alt")}
                shapeRendering="crispEdges"
                className="text-ink size-24 shrink-0 rounded-[12px] shadow-[inset_0_0_0_1px_var(--color-pativ-line)]"
              >
                <path fill="currentColor" d={demoQr.d} />
              </svg>
              <p className="text-ink text-label m-0 max-w-[28ch] leading-normal text-pretty">
                {t("qr.text")}
              </p>
            </div>
          </div>
          <div className="lg:col-span-5 lg:col-start-8">
            <a
              href={demoHref}
              aria-label={t("ctaDemo")}
              className="mx-auto block w-full max-w-[300px] overflow-hidden rounded-[36px] border-[6px] border-[#0f172a] bg-[#0f172a] shadow-[0_24px_48px_-20px_rgb(29_78_216/0.35)] lg:max-w-[320px]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- static webp at 2x, sized below; no image runtime on the landing */}
              <img
                src={`/landing/hero-menu-${locale}.webp`}
                alt={t("heroAlt")}
                width={HERO.width}
                height={HERO.height}
                fetchPriority="high"
                className="block h-auto w-full rounded-[30px]"
              />
            </a>
          </div>
        </section>

        <section aria-labelledby="landing-features" className="bg-pativ-tint">
          <div className={`${container} py-14 md:py-20`}>
            <h2 id="landing-features" className={h2}>
              {t("features.title")}
            </h2>
            <Showcase labelledBy="landing-features" panels={panels} action={signupButton} />
            {/* Proof, as one plain line under a hairline: the pictures are the
                working product, and the demo menu is one tap away. */}
            <p className="border-pativ-line text-label m-0 mt-12 flex flex-col items-start gap-x-4 gap-y-1 border-t pt-6 leading-normal text-pretty sm:flex-row sm:flex-wrap sm:items-center md:mt-16">
              <span>{t("proof.text")}</span>
              <a
                href={demoHref}
                className="text-pativ-blue text-label inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
              >
                {t("proof.link")}
              </a>
            </p>
          </div>
        </section>

        <section aria-labelledby="landing-start">
          <div className={`${container} py-14 md:py-20`}>
            <h2 id="landing-start" className={h2}>
              {t("start.title")}
            </h2>
            <ol className="m-0 mt-8 grid list-none gap-10 p-0 md:mt-12 md:grid-cols-3 md:gap-12">
              {STEPS.map((s, i) => (
                <li key={s} className="flex flex-col">
                  <span aria-hidden="true" className="num bg-pativ-tint text-pativ-blue flex size-9 items-center justify-center rounded-full text-label font-semibold">
                    {i + 1}
                  </span>
                  <h3 className="text-name m-0 mt-4 font-semibold">{t(`start.${s}.title`)}</h3>
                  <p className="text-slate text-label m-0 mt-2 max-w-[36ch] leading-normal text-pretty">
                    {t(`start.${s}.text`)}
                  </p>
                </li>
              ))}
            </ol>
            {/* Why Pativ: three facts under one hairline and their own short
                heading, so on a phone they read as features, not as a fourth
                step; a 17 px lead and line each, under the 22 px heading. */}
            <div className="border-hairline mt-12 border-t pt-8 md:mt-16 md:pt-10">
              <h3 id="landing-why" className="text-name m-0 font-semibold">
                {t("start.why.title")}
              </h3>
              <ul
                aria-labelledby="landing-why"
                className="m-0 mt-5 grid list-none gap-6 p-0 md:mt-6 md:grid-cols-3 md:gap-12"
              >
                {WHY.map((w) => (
                  <li key={w} className="flex flex-col gap-1">
                    <span className="text-label font-semibold">{t(`start.why.${w}.lead`)}</span>
                    <span className="text-slate text-label max-w-[36ch] leading-normal text-pretty">
                      {t(`start.why.${w}.text`)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section id="pricing" aria-labelledby="landing-pricing" className="bg-pativ-tint scroll-mt-16">
          <div className={`${container} py-14 md:py-20`}>
            <h2 id="landing-pricing" className={h2}>
              {t("pricing.title")}
            </h2>
            {/* Two plans side by side, one hairline between them and no boxes. */}
            <div className="mt-8 grid md:mt-12 md:grid-cols-2 md:grid-rows-[repeat(5,auto)]">
              <div className={`${planColumn} pb-10 md:pr-12 md:pb-0`}>
                <h3 className="text-name m-0 font-semibold">{t("pricing.menu.name")}</h3>
                <p className="m-0 mt-2 text-[1.75rem] leading-tight font-semibold tracking-[-0.01em]">
                  {t("pricing.menu.price")}
                </p>
                <p className="text-slate text-label m-0 mt-1">{t("pricing.menu.term")}</p>
                <div className="pt-6">
                  <a href={signupHref} className={outlineButton}>
                    {t("pricing.menu.cta")}
                  </a>
                </div>
                <div>
                  <p className={planTerms}>{t("pricing.menu.note")}</p>
                  <ul className={planList}>
                    <li>{t("pricing.menu.l1")}</li>
                    <li>{t("pricing.menu.l2")}</li>
                    <li>{t("pricing.menu.l3")}</li>
                  </ul>
                </div>
              </div>
              <div
                className={`${planColumn} border-pativ-line border-t pt-10 md:border-t-0 md:border-l md:pt-0 md:pl-12`}
              >
                <h3 className="text-name m-0 font-semibold">{t("pricing.service.name")}</h3>
                <p className="m-0 mt-2 flex flex-wrap items-baseline gap-x-2">
                  <span className="num text-[1.75rem] leading-tight font-semibold tracking-[-0.01em] whitespace-nowrap">
                    {t("pricing.service.price")}
                  </span>
                  <span className="text-name font-semibold">{t("pricing.service.per")}</span>
                </p>
                <p className="text-slate text-label m-0 mt-1">{t("pricing.service.year")}</p>
                <div className="pt-6">{signupButton}</div>
                <div>
                  {/* The two offers as two short lines, each with its own lead. */}
                  <div className="mt-6 flex max-w-[44ch] flex-col gap-2">
                    <p className="text-label m-0 leading-normal text-pretty">
                      {t.rich("pricing.service.offer", { b: bold })}
                    </p>
                    <p className="text-label m-0 leading-normal text-pretty">
                      {t.rich("pricing.service.founding", { b: bold })}
                    </p>
                  </div>
                  <p className="text-label m-0 mt-6 leading-normal">{t("pricing.service.includes")}</p>
                  <ul className={`${planList} mt-2!`}>
                    <li>{t("pricing.service.l1")}</li>
                    <li>{t("pricing.service.l2")}</li>
                    <li>{t("pricing.service.l3")}</li>
                  </ul>
                  <p className="text-slate text-label m-0 mt-6 max-w-[44ch] leading-normal text-pretty">
                    {t("pricing.service.perks")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-hairline border-t">
        <div className={`${container} flex flex-col gap-4 py-8 md:py-10`}>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <BrandLink href={`/${locale}`} name={brand("name")} />
            {/* Below sm the five links are a 2-column grid of 44 px rows, left
                aligned (the fifth, alone on its row, takes both columns so it
                never wraps); from sm one inline row. */}
            <nav
              aria-label={t("footer.nav")}
              className="-mx-2 grid grid-cols-2 gap-x-4 sm:flex sm:flex-wrap sm:gap-x-0"
            >
              <a href={demoHref} className={`${textLink} px-2`}>
                {t("footer.demo")}
              </a>
              <a href="#pricing" className={`${textLink} px-2`}>
                {t("nav.pricing")}
              </a>
              <a href={signupHref} className={`${textLink} px-2`}>
                {t("ctaSignup")}
              </a>
              <a href={loginHref} className={`${textLink} px-2`}>
                {t("signIn")}
              </a>
              <a href={pairHref} className={`${textLink} col-span-2 px-2`}>
                {t("footer.pair")}
              </a>
            </nav>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
            <p className="text-slate text-label m-0">{t("footer.copyright")}</p>
            <div className="-mr-3">{languages("div")}</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
