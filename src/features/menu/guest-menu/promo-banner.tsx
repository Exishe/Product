import type { GuestPromo } from "./view-model";
import { PromoShell } from "./promo-shell";

// Promo banners at the top of the guest menu (ADR-070): an announcement the
// café switched on, in the guest's language (Armenian when it has no text in
// it). It changes no price. Rendered on the server, so their text costs the
// page no JavaScript; only the close button runs in the browser (promo-shell.tsx).
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
          <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-[1rem] leading-snug font-semibold">
            <span lang={p.title.lang !== locale ? p.title.lang : undefined} data-testid="promo-title">
              {p.title.text}
            </span>
            {p.badge && (
              <span
                className="bg-badge text-on-badge rounded-pill px-2.5 py-0.5 text-[0.8125rem] leading-5 font-bold whitespace-nowrap"
                data-testid="promo-badge"
              >
                {p.badge}
              </span>
            )}
          </p>
          {p.text && (
            <p
              className="text-muted m-0 mt-0.5 text-[0.9375rem] leading-snug"
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
