import type { Metadata, Viewport } from "next";
import { FileSpreadsheet, Send, Smartphone, WifiOff } from "lucide-react";
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
// The admin screen is left out (the owner, 27 Nov): its buttons looked
// tappable on a picture that isn't.
const SURFACES = ["menu", "waiter", "kitchen"] as const;
const WIDE_SURFACES: readonly string[] = ["kitchen"];
const POINTS = ["p1", "p2", "p3"] as const;
const PHONE = { width: 840, height: 1376 };
const WIDE = { width: 1440, height: 1376 };

// The hero picture: one phone screen of the live demo menu (blue palette,
// 390x780 at 2x), shown whole in a thin phone frame.
const HERO = { width: 780, height: 1560 };

const STEPS = ["step1", "step2", "step3"] as const;
// Three facts the hero doesn't already say: the offline queue, the CSV export
// and the Telegram alerts.
const WHY = ["offline", "export", "telegram"] as const;
const WHY_ICON = { offline: WifiOff, export: FileSpreadsheet, telegram: Send } as const;

// One container for the whole page: 1120 px, 16 px gutters on phones, 32 px from md.
const container = "mx-auto w-full max-w-[1120px] px-4 md:px-8";
const h2 = "m-0 text-[1.375rem] leading-tight font-semibold tracking-[-0.01em] md:text-[1.625rem]";
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
  // The picture a shared link shows (public/og/, 1200x630, one per language).
  const images = [{ url: `/og/landing-${locale}.jpg`, width: 1200, height: 630, alt: title }];
  return {
    title,
    description,
    openGraph: { title, description, type: "website", locale, images },
    twitter: { card: "summary_large_image", title, description, images },
  };
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
          className={`${container} grid gap-10 pt-6 pb-14 md:pt-10 md:pb-20 lg:grid-cols-12 lg:items-start lg:gap-8 lg:pt-10`}
        >
          <div className="lg:col-span-6 lg:pt-6">
            <h1 className="m-0 max-w-[18em] text-[1.625rem] leading-[1.2] font-semibold tracking-[-0.01em] text-balance md:text-[1.875rem] xl:text-[2rem]">
              {t("title")}
            </h1>
            <div id="landing-hero-cta" className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap md:mt-8">
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
            {/* What the pictures are and what to do with them, before the
                tabs: the demo café's menu opens on the reader's own phone. */}
            <div className="mt-6 flex flex-col items-start gap-4 rounded-[20px] bg-white p-5 shadow-[inset_0_0_0_1px_var(--color-pativ-line)] sm:flex-row sm:items-center sm:justify-between md:mt-8 md:px-6">
              <p className="text-ink text-name m-0 leading-normal text-pretty">{t("proof.text")}</p>
              <a
                href={demoHref}
                className="bg-pativ-blue hover:bg-pativ-blue-deep text-label inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full px-5 font-semibold text-white no-underline"
              >
                <Smartphone size={18} aria-hidden />
                {t("proof.link")}
              </a>
            </div>
            <Showcase labelledBy="landing-features" panels={panels} action={signupButton} />
          </div>
        </section>

        <section aria-labelledby="landing-start">
          <div className={`${container} py-14 md:py-20`}>
            <h2 id="landing-start" className={h2}>
              {t("start.title")}
            </h2>
            {/* Three cards, each with a small drawing of what the step looks
                like: the sign-up form, a paper menu turning into dish rows,
                the QR on the table. */}
            <ol className="m-0 mt-8 grid list-none gap-4 p-0 md:mt-10 md:grid-cols-3 md:gap-5">
              {STEPS.map((s, i) => (
                <li
                  key={s}
                  className="flex flex-col overflow-hidden rounded-[24px] bg-white shadow-[inset_0_0_0_1px_var(--color-pativ-line)]"
                >
                  <div aria-hidden="true" className="bg-pativ-tint flex h-40 items-center justify-center">
                    {i === 0 && <StepSignup />}
                    {i === 1 && <StepMenu />}
                    {i === 2 && <StepQr d={demoQr.d} size={demoQr.size} />}
                  </div>
                  <div className="flex flex-1 flex-col p-5 md:p-6">
                    <span className="num text-pativ-blue text-label font-semibold">{i + 1}</span>
                    <h3 className="text-name m-0 mt-1 font-semibold">{t(`start.${s}.title`)}</h3>
                    <p className="text-slate text-label m-0 mt-2 leading-normal text-pretty">
                      {t(`start.${s}.text`)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            {/* What else comes with it: one deep-blue panel, three columns with
                an icon each, so it reads apart from the steps above. */}
            <div className="mt-10 rounded-[28px] bg-[#1e3a8a] p-6 text-white md:mt-14 md:p-10">
              <h3 id="landing-why" className="text-name m-0 font-semibold">
                {t("start.why.title")}
              </h3>
              <ul
                aria-labelledby="landing-why"
                className="m-0 mt-6 grid list-none gap-6 p-0 md:grid-cols-3 md:gap-10"
              >
                {WHY.map((w) => {
                  const Icon = WHY_ICON[w];
                  return (
                    <li key={w} className="flex flex-col gap-2">
                      <span className="flex size-10 items-center justify-center rounded-full bg-white/12">
                        <Icon size={20} aria-hidden />
                      </span>
                      <span className="text-label mt-1 font-semibold">{t(`start.why.${w}.lead`)}</span>
                      <span className="text-label leading-normal text-pretty text-white/80">
                        {t(`start.why.${w}.text`)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </section>

      </main>

      <footer className="border-hairline border-t">
        <div className={`${container} flex flex-col gap-4 py-8 md:py-10`}>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <BrandLink href={`/${locale}`} name={brand("name")} />
            {/* Below sm the four links are a 2-column grid of 44 px rows, left
                aligned; from sm one inline row. */}
            <nav
              aria-label={t("footer.nav")}
              className="-mx-2 grid grid-cols-2 gap-x-4 sm:flex sm:flex-wrap sm:gap-x-0"
            >
              <a href={demoHref} className={`${textLink} px-2`}>
                {t("footer.demo")}
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

// The step drawings: plain shapes in the page's blue and white, no words.
function StepSignup() {
  return (
    <div className="flex w-40 flex-col gap-2 rounded-[14px] bg-white p-3 shadow-[0_8px_20px_-10px_rgb(29_78_216/0.35)]">
      <span className="bg-pativ-line h-2 w-16 rounded-full" />
      <span className="h-7 rounded-lg shadow-[inset_0_0_0_1px_var(--color-pativ-line)]" />
      <span className="h-7 rounded-lg shadow-[inset_0_0_0_1px_var(--color-pativ-line)]" />
      <span className="bg-pativ-blue h-7 rounded-full" />
    </div>
  );
}

function StepMenu() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-24 w-[4.5rem] -rotate-6 flex-col gap-1.5 rounded-md bg-[#fffdf7] p-2.5 shadow-[0_6px_16px_-8px_rgb(15_23_42/0.4)]">
        {[10, 8, 12, 7, 11, 9].map((w, k) => (
          <span key={k} className="h-1 rounded-full bg-slate-300" style={{ width: `${w * 4}px` }} />
        ))}
      </div>
      <svg width="28" height="12" viewBox="0 0 28 12" className="text-pativ-blue">
        <path d="M0 6h24m-5-5 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="flex w-24 flex-col gap-1.5 rounded-[12px] bg-white p-2 shadow-[0_8px_20px_-10px_rgb(29_78_216/0.35)]">
        {[0, 1, 2].map((k) => (
          <div key={k} className="flex items-center gap-1.5">
            <span className="bg-pativ-line size-5 shrink-0 rounded-md" />
            <span className="flex flex-1 flex-col gap-1">
              <span className="h-1 w-full rounded-full bg-slate-300" />
              <span className="bg-pativ-blue h-1 w-5 rounded-full" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepQr({ d, size }: { d: string; size: number }) {
  return (
    <div className="flex flex-col items-center">
      <div className="rounded-[14px] bg-white p-3 shadow-[0_8px_20px_-10px_rgb(29_78_216/0.35)]">
        <svg viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges" className="text-ink size-20">
          <path fill="currentColor" d={d} />
        </svg>
      </div>
      <span className="bg-pativ-line mt-1 h-2 w-28 rounded-full" />
    </div>
  );
}
