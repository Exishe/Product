import type { ReactNode } from "react";
import { QrCode } from "@/features/menu/guest-menu/icons";
import guestStyles from "@/features/menu/guest-menu/guest.module.css";

// The order page with nothing to show (benchmark §2.3 empty states): on the
// order column, set about a third of the way down the screen rather than
// flush under the bar. A large serif title, one plain sentence, the QR hint
// (when the guest came without a table) as a 48 px row on hairlines with its
// icon, and the way back to the menu as the cart's own 56 px action. Markup
// only, so the server page (no table) and the status view (a table, no order
// yet) share it.
export function OrderEmpty({
  title,
  sentence,
  qrHint,
  notice,
  menuHref,
  menuLabel,
  heading: Heading = "h2",
}: {
  title?: string;
  sentence?: string;
  /** «Order with the table's QR code», when there is no table. */
  qrHint?: string;
  /** Shown in place of the title and the sentence (a dead QR code). */
  notice?: ReactNode;
  menuHref: string;
  menuLabel: string;
  heading?: "h1" | "h2";
}) {
  return (
    <div className="grid content-start lg:max-w-[34rem] pt-[clamp(2rem,calc(30dvh-4.5rem),16rem)]">
      {notice ?? (
        <>
          <Heading className="display-face text-[2rem] leading-[1.15] md:text-figure">{title}</Heading>
          {sentence && <p className="text-soft mt-3 text-name leading-[1.5]">{sentence}</p>}
        </>
      )}
      {qrHint && (
        <p className="border-line text-ink mt-6 flex min-h-12 items-center gap-3 border-y text-body">
          <QrCode size={20} strokeWidth={1.75} aria-hidden className="text-muted flex-none" />
          {qrHint}
        </p>
      )}
      <a
        href={menuHref}
        className={`${guestStyles.cta} flex min-h-14 w-full items-center justify-center gap-2 px-6 text-body font-semibold ${qrHint ? "mt-6" : "mt-8"}`}
      >
        {menuLabel}
      </a>
    </div>
  );
}
