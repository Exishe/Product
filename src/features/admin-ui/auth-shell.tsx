import type { ReactNode } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { AuthHeading } from "./auth-heading";
import { BrandLink } from "./brand";
import { LocaleSwitch } from "./locale-switch";

// Sign-in, sign-up, device pairing, "create your café" (ADR-055) and the 404:
// the landing page's 64 px header (the lockup, a link home, and the language
// switch), then a title, one helper line and the form in one 400 px column on
// the same white page (ADR-094: no card around the form). The column starts
// at a fixed offset, not centred, so the title sits at the same height on
// every one of these screens and the form stays above a phone keyboard.
// `bare` is kept for callers; both render the same now. A screen whose title
// depends on client state leaves `title` out and renders `AuthHeading` itself
// as the first child. `wideTitle` lets a short one-line title (the 404) run
// past the column on wider screens instead of breaking after its first word.
export async function AuthShell({
  brand,
  title,
  subtitle,
  wideTitle,
  footer,
  bare,
  children,
}: {
  brand: string;
  title?: string;
  subtitle?: ReactNode;
  wideTitle?: boolean;
  footer?: ReactNode;
  bare?: boolean;
  children: ReactNode;
}) {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("guest.language")]);
  const names = Object.fromEntries(routing.locales.map((l) => [l, t(l)]));
  return (
    <div className="admin-shell auth-shell text-ink min-h-dvh bg-white">
      <header className="mx-auto flex h-16 w-full max-w-[1120px] items-center justify-between gap-4 px-4 md:px-8">
        <BrandLink href={`/${locale}`} name={brand} />
        <LocaleSwitch current={locale} label={t("label")} names={names} />
      </header>
      <main className="mx-auto flex w-full max-w-[25rem] flex-col gap-8 px-4 pt-8 pb-16 sm:px-0 sm:pt-[12vh]">
        {title && <AuthHeading title={title} subtitle={subtitle} wide={wideTitle} />}
        {bare ? children : <div className="flex flex-col">{children}</div>}
        {footer && <div className="text-staff-label2 text-body flex flex-col">{footer}</div>}
      </main>
    </div>
  );
}
