import type { Metadata, Viewport } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BrandLink, localeOption } from "@/features/admin-ui/brand";
import { LandingEffects } from "@/features/landing/landing-effects";
import { Showcase, type ShowcasePanel } from "@/features/landing/showcase";
import { routing } from "@/i18n/routing";

// The showcase café «Pativ Demo» (docs/04-operations/showcase-cafe.md), not
// demo-cafe: that one is the CI fixture and is reset by the tests.
const DEMO_MENU = "m/pativ-demo/main";

// The four surfaces in the showcase, each with real screenshots of the
// current build (public/landing/): a portrait one for phones and a wide one
// from the md breakpoint. Every wide image has one size and every phone image
// another, so switching tabs never moves the page. The kitchen board speaks
// the café's kitchen language (locations.kitchen_locale), so it has one
// picture; the others have one per page language.
const SURFACES = ["menu", "waiter", "kitchen", "admin"] as const;
const PHONE = { width: 780, height: 1040 };
const WIDE = { width: 1600, height: 1120 };
const shot = (s: (typeof SURFACES)[number], locale: string) => (s === "kitchen" ? s : `${s}-${locale}`);

// The hero picture: the live demo menu at 390 px (2x), down to the hairline
// under its first dish; Armenian and Russian descriptions run one line longer.
const HERO_HEIGHT: Record<string, number> = { hy: 1422, ru: 1422, en: 1376 };

const STEPS = ["step1", "step2", "step3"] as const;

// One container for the whole page: 1120 px, 16 px gutters on phones, 32 px from md.
const container = "mx-auto w-full max-w-[1120px] px-4 md:px-8";
const h2 = "display-face m-0 text-large leading-tight font-normal! md:text-[2rem]";
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
  // Plain links, not client navigation: sign-in, sign-up and pairing take
  // their language from the cookie LandingEffects writes, and a full page
  // load gives them the right <html lang>.
  const signupHref = "/signup";
  const loginHref = "/login";
  const pairHref = "/pair";

  const panels: ShowcasePanel[] = SURFACES.map((s) => ({
    id: s,
    tab: t(`features.${s}.tab`),
    title: t(`features.${s}.title`),
    text: t(`features.${s}.text`),
    alt: t(`features.${s}.alt`),
    phone: { src: `/landing/show-${shot(s, locale)}-phone.webp`, ...PHONE },
    wide: { src: `/landing/show-${shot(s, locale)}.webp`, ...WIDE },
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
      <LandingEffects locale={locale} headerId="landing-header" />
      <header
        id="landing-header"
        className="data-scrolled:border-hairline sticky top-0 z-20 border-b border-transparent bg-white transition-colors duration-200"
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
            {languages("nav")}
            <span aria-hidden="true" className="bg-hairline mx-1 h-5 w-px" />
            <a href={loginHref} className={`${textLink} min-w-11 justify-center px-2`}>
              {t("signIn")}
            </a>
            <a
              href={signupHref}
              className="bg-ink text-label ml-1 hidden min-h-11 items-center rounded-full px-4 font-semibold text-white no-underline sm:inline-flex"
            >
              {t("ctaSignup")}
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
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap md:mt-10">
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
          </div>
          <div className="relative z-10 -mb-16 lg:col-span-5 lg:col-start-8 lg:-mb-24">
            <a
              href={demoHref}
              aria-label={t("ctaDemo")}
              className="shadow-soft-float mx-auto block w-full max-w-[360px] overflow-hidden rounded-[28px] lg:max-w-[400px]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- static webp at 2x, sized below; no image runtime on the landing */}
              <img
                src={`/landing/hero-menu-${locale}.webp`}
                alt={t("heroAlt")}
                width={780}
                height={HERO_HEIGHT[locale] ?? 1422}
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
            <p className="border-hairline m-0 mt-12 max-w-[60ch] border-t pt-8 text-lg leading-normal text-pretty md:mt-16 md:text-xl">
              {t("start.why")}
            </p>
          </div>
        </section>

        <section id="pricing" aria-labelledby="landing-pricing" className="bg-sand scroll-mt-16">
          <div className={`${container} py-14 md:py-24`}>
            <h2 id="landing-pricing" className={h2}>
              {t("pricing.title")}
            </h2>
            <div className="mt-8 grid md:mt-12 md:grid-cols-2">
              <div className="flex flex-col pb-10 md:pr-12 md:pb-0">
                <h3 className="text-heading m-0 font-semibold">{t("pricing.menu.name")}</h3>
                <p className="text-figure m-0 mt-3 font-semibold tracking-[-0.01em]">
                  {t("pricing.menu.price")}
                </p>
                <p className="text-slate text-label m-0 mt-1">{t("pricing.menu.term")}</p>
                <ul className="text-name m-0 mt-6 flex list-none flex-col gap-2 p-0">
                  <li>{t("pricing.menu.l1")}</li>
                  <li>{t("pricing.menu.l2")}</li>
                  <li>{t("pricing.menu.l3")}</li>
                </ul>
              </div>
              <div className="border-sand-line flex flex-col items-start border-t pt-10 md:border-t-0 md:border-l md:pt-0 md:pl-12">
                <h3 className="text-heading m-0 font-semibold">{t("pricing.service.name")}</h3>
                <p className="m-0 mt-3 flex flex-wrap items-baseline gap-x-2">
                  <span className="num text-figure font-semibold tracking-[-0.01em]">
                    {t("pricing.service.price")}
                  </span>
                  <span className="text-heading font-semibold">{t("pricing.service.per")}</span>
                </p>
                <p className="text-slate text-label m-0 mt-1">{t("pricing.service.year")}</p>
                <p className="text-name m-0 mt-6 max-w-[44ch] leading-normal text-pretty">
                  {t("pricing.service.includes")}
                </p>
                <ul className="text-name m-0 mt-4 flex list-none flex-col gap-2 p-0 font-semibold">
                  <li>{t("pricing.service.l1")}</li>
                  <li>{t("pricing.service.l2")}</li>
                  <li>{t("pricing.service.l3")}</li>
                </ul>
                <div className="mt-8">{signupButton}</div>
              </div>
            </div>
            <p className="text-slate text-label m-0 mt-12 max-w-[70ch]">{t("pricing.founding")}</p>
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
