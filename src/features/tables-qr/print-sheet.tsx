import styles from "./print.module.css";
import { QR_INK, qrPath } from "./qr-svg";
import { toSheets } from "./schema";

export type QrCard = { tableId: string; label: string; url: string };

// The words printed on every card, in each guest language (Armenian first).
export type CardText = { lang: string; table: string; scan: string };

function QrCode({ url, label }: { url: string; label: string }) {
  const { size, d } = qrPath(url);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path fill={QR_INK} d={d} />
    </svg>
  );
}

// Server component: the cards are static markup, so printing needs no JavaScript.
export function PrintSheets({
  cafeName,
  cards,
  texts,
  sheetLabel,
  qrLabel,
}: {
  cafeName: string;
  cards: QrCard[];
  texts: CardText[];
  sheetLabel: (n: number) => string;
  qrLabel: (tableLabel: string) => string;
}) {
  const [main, ...others] = texts;
  return (
    <div className={styles.sheets}>
      {toSheets(cards).map((sheet, i) => (
        <section key={sheet[0]?.tableId ?? i} className={styles.sheet} aria-label={sheetLabel(i + 1)} data-testid="qr-sheet">
          {sheet.map((card) => (
            <article key={card.tableId} className={styles.card} data-testid="qr-card" data-table-label={card.label} data-qr-url={card.url}>
              <header>
                <p className={styles.cafe}>{cafeName}</p>
                <p className={styles.tableWord}>{texts.map((x) => x.table).join(" · ")}</p>
              </header>
              <p className={styles.label}>{card.label}</p>
              <div className={styles.qr}>
                <QrCode url={card.url} label={qrLabel(card.label)} />
              </div>
              <div className={styles.scan}>
                {main && (
                  <p className={styles.scanMain} lang={main.lang}>
                    {main.scan}
                  </p>
                )}
                {others.map((x) => (
                  <p key={x.lang} className={styles.scanOther} lang={x.lang}>
                    {x.scan}
                  </p>
                ))}
              </div>
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}
