import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { routing } from "@/i18n/routing";

// The showcase café «Pativ Demo» (docs/04-operations/showcase-cafe.md), not
// demo-cafe: that one is the CI fixture and is reset by the tests.
const DEMO_MENU = "m/pativ-demo/main";

// Product cards: real screenshots of the guest menu (one per language, like
// the hero), waiter app and kitchen screen, cropped to 4:3 and kept in
// public/landing/. The owner admin gets the wide card under them, next to
// the sign-up button.
const SURFACES = ["menu", "waiter", "kitchen"] as const;

// One container for the whole page: 1120 px, 16 px gutters on phones, 32 px from md.
const container = "mx-auto w-full max-w-[1120px] px-4 md:px-8";

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

  return (
    <div className="text-ink">
      <header className={`${container} flex h-16 items-center justify-between gap-4`}>
        <a
          href={`/${locale}`}
          className="display-face text-ink inline-flex min-h-11 items-center text-[1.25rem] leading-none font-medium! no-underline"
        >
          {brand("name")}
        </a>
        <div className="flex items-center gap-1 sm:gap-3">
          <nav aria-label={guest("language.label")} className="flex items-center">
            {routing.locales.map((l) => (
              <a
                key={l}
                href={`/${l}`}
                lang={l}
                hrefLang={l}
                aria-current={l === locale ? "page" : undefined}
                className="text-slate hover:text-ink aria-[current=page]:text-ink grid min-h-11 min-w-11 place-items-center text-label no-underline decoration-2 underline-offset-4 aria-[current=page]:font-semibold aria-[current=page]:underline"
              >
                {guest(`language.${l}`)}
              </a>
            ))}
          </nav>
          <span aria-hidden="true" className="bg-sand-line h-5 w-px" />
          <Link
            href="/login"
            className="text-ink inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-label font-semibold no-underline underline-offset-4 hover:underline"
          >
            {t("signIn")}
          </Link>
        </div>
      </header>

      <main>
        <section
          className={`${container} grid gap-12 pt-12 pb-16 md:pt-24 md:pb-24 lg:grid-cols-12 lg:items-center lg:gap-8`}
        >
          <div className="lg:col-span-6">
            <h1 className="display-face m-0 max-w-[18em] text-[2.5rem] leading-[1.05] font-normal! tracking-[-0.02em] text-balance md:text-[3.5rem] xl:text-[4rem]">
              {t("title")}
            </h1>
            <p className="text-slate mt-4 mb-0 max-w-[34ch] text-lg leading-normal text-pretty md:text-xl">
              {t("lead")}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <a
                href={`/${locale}/${DEMO_MENU}`}
                className="bg-ink inline-flex min-h-14 items-center justify-center rounded-full px-6 text-base font-semibold text-white no-underline"
              >
                {t("ctaDemo")}
              </a>
              <Link
                href="/signup"
                className="border-staff-field text-ink inline-flex min-h-14 items-center justify-center rounded-full border px-6 text-base font-semibold no-underline"
              >
                {t("ctaSignup")}
              </Link>
            </div>
          </div>
          <div className="lg:col-span-5 lg:col-start-8">
            {/* eslint-disable-next-line @next/next/no-img-element -- static webp at 2x, sized below; no image runtime on the landing */}
            <img
              src={`/landing/hero-menu-${locale}.webp`}
              alt={t("heroAlt")}
              width={390}
              height={770}
              fetchPriority="high"
              className="border-sand-line mx-auto block h-auto w-full max-w-[320px] rounded-2xl border bg-white"
            />
          </div>
        </section>

        <section aria-labelledby="landing-features" className="bg-sand border-sand-line border-y">
          <div className={`${container} py-16 md:py-24`}>
            <h2
              id="landing-features"
              className="display-face m-0 text-[1.75rem] leading-tight font-normal! md:text-[2rem]"
            >
              {t("features.title")}
            </h2>
            <ul className="m-0 mt-8 grid list-none gap-4 p-0 md:grid-cols-3">
              {SURFACES.map((s) => (
                <li key={s} className="border-sand-line overflow-hidden rounded-xl border bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element -- static webp, 4:3 */}
                  <img
                    src={s === "menu" ? `/landing/card-menu-${locale}.webp` : `/landing/card-${s}.webp`}
                    alt={t(`features.${s}.alt`)}
                    width={4}
                    height={3}
                    loading="lazy"
                    decoding="async"
                    className="border-sand-line block aspect-[4/3] h-auto w-full border-b object-cover"
                  />
                  <div className="p-4">
                    <h3 className="m-0 text-base leading-snug font-semibold">{t(`features.${s}.title`)}</h3>
                    <p className="text-slate mt-1 mb-0 text-body leading-normal">
                      {t(`features.${s}.text`)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-sand-line mt-4 flex flex-col gap-4 rounded-xl border bg-white p-4 md:flex-row md:items-center md:justify-between md:p-6">
              <div>
                <h3 className="m-0 text-base leading-snug font-semibold">{t("features.admin.title")}</h3>
                <p className="text-slate mt-1 mb-0 text-body leading-normal">
                  {t("features.admin.text")}
                </p>
              </div>
              <Link
                href="/signup"
                className="bg-ink inline-flex min-h-12 shrink-0 items-center justify-center self-start rounded-full px-5 text-base font-semibold text-white no-underline md:self-auto"
              >
                {t("ctaSignup")}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer
        className={`${container} text-slate flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-8 text-label`}
      >
        <p className="m-0">{t("footer.copyright")}</p>
        <Link
          href="/login"
          className="text-ink inline-flex min-h-11 min-w-11 items-center justify-center font-semibold no-underline underline-offset-4 hover:underline"
        >
          {t("signIn")}
        </Link>
      </footer>
    </div>
  );
}
