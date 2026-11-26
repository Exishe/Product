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
const WIDE = { width: 1440, height: 1376 };

// The hero picture: the live demo menu at 390 px (2x), down to just above the
// hairline that opens the second dish, so it ends on white under the price.
const HERO = { width: 780, height: 1418 };

const STEPS = ["step1", "step2", "step3"] as const;
// Three facts the hero doesn't already say: the offline queue, the CSV export
// and the Telegram alerts.
const WHY = ["offline", "export", "telegram"] as const;

// One container for the whole page: 1120 px, 16 px gutters on phones, 32 px from md.
const container = "mx-auto w-full max-w-[1120px] px-4 md:px-8";
const h2 = "display-face m-0 text-large leading-tight font-normal! md:text-[2rem]";
// Plan features: regular weight in both columns, a short dash before each line.
const planList =
  "text-name m-0 mt-6 flex list-none flex-col gap-2 p-0 leading-normal [&>li]:relative [&>li]:pl-5 [&>li]:before:absolute [&>li]:before:left-0 [&>li]:before:text-slate [&>li]:before:content-['–']";
// From md the two plans share four subgrid rows (name, price, term, button),
// so both 56 px buttons sit on one line right under the price; what follows
// (the terms and the list) flows on its own in the fifth row, top-aligned.
const planColumn =
  "flex flex-col items-start md:row-span-5 md:grid md:grid-rows-subgrid md:content-start md:justify-items-start";
// The plan's terms in one plain sentence under the price.
const planTerms = "text-name m-0 mt-8 max-w-[44ch] leading-normal text-pretty";
const outlineButton =
  "text-ink inline-flex min-h-14 items-center justify-center rounded-full bg-white px-6 text-base font-semibold no-underline shadow-[inset_0_0_0_1px_var(--color-staff-field)]";
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
    phone: { src: `/landing/show-${s}-${locale}-phone.webp`, ...PHONE },
    wide: WIDE_SURFACES.includes(s) ? { src: `/landing/show-${s}-${locale}.webp`, ...WIDE } : undefined,
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
      className="bg-ink inline-flex min-h-14 items-center justify-center rounded-full px-6 text-base font-semibold text-white no-underline"
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
              className="bg-ink text-label motion-safe:animate-in motion-safe:fade-in ml-1 hidden min-h-11 items-center rounded-full px-4 font-semibold whitespace-nowrap text-white no-underline group-data-cta:inline-flex motion-safe:duration-200 sm:inline-flex"
            >
              <span className="sm:hidden">{t("nav.signup")}</span>
              <span className="hidden sm:inline">{t("ctaSignup")}</span>
            </a>
          </div>
        </div>
      </header>

      <main>
        {/* Hero: the headline and the real menu, which overlaps the band below
            so the two read as one page. The picture opens the live demo. */}
        <section
          className={`${container} grid gap-10 pt-8 md:pt-16 lg:grid-cols-12 lg:items-center lg:gap-8 lg:pt-20`}
        >
          <div className="lg:col-span-6 lg:pb-24">
            <h1 className="display-face m-0 max-w-[18em] text-[2.5rem] leading-[1.05] font-normal! tracking-[-0.02em] text-balance md:text-[3.5rem] xl:text-[4rem]">
              {t("title")}
            </h1>
            <p className="text-slate mt-5 mb-0 max-w-[34ch] text-lg leading-normal text-pretty md:mt-8 md:text-xl">
              {t("lead")}
            </p>
            <div id="landing-hero-cta" className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap md:mt-10">
              <a
                href={demoHref}
                className="bg-ink inline-flex min-h-14 items-center justify-center rounded-full px-6 text-base font-semibold text-white no-underline"
              >
                {t("ctaDemo")}
              </a>
              <a
                href={signupHref}
                className="text-ink inline-flex min-h-14 items-center justify-center rounded-full bg-white px-6 text-base font-semibold no-underline shadow-[inset_0_0_0_1px_var(--color-staff-field)]"
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
                className="text-ink size-28 shrink-0 rounded-[12px] shadow-[inset_0_0_0_1px_var(--color-hairline)]"
              >
                <path fill="currentColor" d={demoQr.d} />
              </svg>
              <p className="text-ink text-label m-0 max-w-[28ch] leading-normal text-pretty">
                {t("qr.text")}
              </p>
            </div>
          </div>
          <div className="relative z-10 -mb-16 lg:col-span-5 lg:col-start-8 lg:-mb-24">
            <a
              href={demoHref}
              aria-label={t("ctaDemo")}
              className="shadow-soft-float mx-auto block w-full max-w-[360px] overflow-hidden rounded-[20px] lg:max-w-[400px]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- static webp at 2x, sized below; no image runtime on the landing */}
              <img
                src={`/landing/hero-menu-${locale}.webp`}
                alt={t("heroAlt")}
                width={HERO.width}
                height={HERO.height}
                fetchPriority="high"
                className="block h-auto w-full"
              />
            </a>
          </div>
        </section>

        <section aria-labelledby="landing-features" className="bg-sand">
          <div className={`${container} pt-28 pb-14 md:pb-24 lg:pt-40`}>
            <h2 id="landing-features" className={h2}>
              {t("features.title")}
            </h2>
            <Showcase labelledBy="landing-features" panels={panels} action={signupButton} />
            {/* Proof, as one plain line under a hairline: the pictures are the
                working product, and the demo menu is one tap away. */}
            <p className="border-sand-line text-name m-0 mt-12 flex flex-col items-start gap-x-4 gap-y-1 border-t pt-6 leading-normal text-pretty sm:flex-row sm:flex-wrap sm:items-center md:mt-16">
              <span>{t("proof.text")}</span>
              <a
                href={demoHref}
                className="text-ink text-name inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
              >
                {t("proof.link")}
              </a>
            </p>
          </div>
        </section>

        <section aria-labelledby="landing-start">
          <div className={`${container} py-14 md:py-24`}>
            <h2 id="landing-start" className={h2}>
              {t("start.title")}
            </h2>
            <ol className="m-0 mt-8 grid list-none gap-10 p-0 md:mt-12 md:grid-cols-3 md:gap-12">
              {STEPS.map((s, i) => (
                <li key={s} className="flex flex-col">
                  <span aria-hidden="true" className="display-face text-figure num font-normal!">
                    {i + 1}
                  </span>
                  <h3 className="text-heading m-0 mt-3 font-semibold">{t(`start.${s}.title`)}</h3>
                  <p className="text-slate text-name m-0 mt-2 max-w-[34ch] leading-normal text-pretty">
                    {t(`start.${s}.text`)}
                  </p>
                </li>
              ))}
            </ol>
            {/* Why Pativ: three facts under one hairline, a 22 px lead and a 17 px line each. */}
            <ul className="border-hairline m-0 mt-12 grid list-none gap-6 border-t p-0 pt-8 md:mt-16 md:grid-cols-3 md:gap-12 md:pt-10">
              {WHY.map((w) => (
                <li key={w} className="flex flex-col gap-1">
                  <span className="text-subtitle font-semibold">{t(`start.why.${w}.lead`)}</span>
                  <span className="text-slate text-name max-w-[34ch] leading-normal text-pretty">
                    {t(`start.why.${w}.text`)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="pricing" aria-labelledby="landing-pricing" className="bg-sand scroll-mt-16">
          <div className={`${container} py-14 md:py-24`}>
            <h2 id="landing-pricing" className={h2}>
              {t("pricing.title")}
            </h2>
            {/* Two plans side by side, one hairline between them and no boxes. */}
            <div className="mt-8 grid md:mt-12 md:grid-cols-2 md:grid-rows-[repeat(5,auto)]">
              <div className={`${planColumn} pb-10 md:pr-12 md:pb-0`}>
                <h3 className="text-heading m-0 font-semibold">{t("pricing.menu.name")}</h3>
                <p className="text-figure m-0 mt-3 font-semibold tracking-[-0.01em]">
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
                className={`${planColumn} border-sand-line border-t pt-10 md:border-t-0 md:border-l md:pt-0 md:pl-12`}
              >
                <h3 className="text-heading m-0 font-semibold">{t("pricing.service.name")}</h3>
                <p className="m-0 mt-3 flex flex-wrap items-baseline gap-x-2">
                  <span className="num text-figure font-semibold tracking-[-0.01em] whitespace-nowrap">
                    {t("pricing.service.price")}
                  </span>
                  <span className="text-heading font-semibold">{t("pricing.service.per")}</span>
                </p>
                <p className="text-slate text-label m-0 mt-1">{t("pricing.service.year")}</p>
                <div className="pt-6">{signupButton}</div>
                <div>
                  {/* The two offers as two short lines, each with its own lead. */}
                  <div className="mt-8 flex max-w-[44ch] flex-col gap-2">
                    <p className="text-name m-0 leading-normal text-pretty">
                      {t.rich("pricing.service.offer", { b: bold })}
                    </p>
                    <p className="text-name m-0 leading-normal text-pretty">
                      {t.rich("pricing.service.founding", { b: bold })}
                    </p>
                  </div>
                  <p className="text-name m-0 mt-6 leading-normal">{t("pricing.service.includes")}</p>
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
            <nav aria-label={t("footer.nav")} className="-mx-2 flex flex-wrap">
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
              <a href={pairHref} className={`${textLink} px-2`}>
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
