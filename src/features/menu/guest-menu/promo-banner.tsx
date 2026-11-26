import type { GuestPromo } from "./view-model";
import { PromoShell } from "./promo-shell";

// Promo banners at the top of the guest menu (ADR-070): an announcement the
// café switched on, in the guest's language (Armenian when it has no text in
// it). It changes no price. Rendered with the menu, so a language switch
// (ADR-092) changes their text too; the close button is promo-shell.tsx.
export function PromoBanners({
  promos,
  locale,
  label,
  closeLabel,
}: {
  promos: GuestPromo[];
  locale: string;
  label: string;
  closeLabel: string;
}) {
  return (
    <>
      {promos.map((p) => (
        <PromoShell key={p.id} id={p.id} label={label} closeLabel={closeLabel}>
          <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-body leading-[1.45] font-semibold">
            <span lang={p.title.lang !== locale ? p.title.lang : undefined} data-testid="promo-title">
              {p.title.text}
            </span>
            {/* The hours once: not when the title already says a time. */}
            {p.badge && !p.title.text.includes(p.badge) && !/\d/.test(p.title.text) && (
              <span
                className="num text-accent-text text-label font-semibold whitespace-nowrap"
                data-testid="promo-badge"
              >
                {p.badge}
              </span>
            )}
          </p>
          {p.text && (
            <p
              className="text-muted m-0 mt-0.5 text-body leading-[1.45]"
              lang={p.text.lang !== locale ? p.text.lang : undefined}
            >
              {p.text.text}
            </p>
          )}
        </PromoShell>
      ))}
    </>
  );
}
