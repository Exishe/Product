"use client";

import { BellRing, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import styles from "./new-order-alert.module.css";

export type IncomingOrder = { id: string; number: number; table: string | null; allergy: boolean; dishes: number };

// The big «Նոր պատվեր» card a cook sees from across the kitchen: it drops in
// from the top with a short ring of light, lists the new orders (table and
// number), turns red when one mentions an allergy, and closes by itself after a
// few seconds or at a tap anywhere on it. The tickets themselves are already on
// the board; this only makes sure nobody misses them.
export function NewOrderAlert({ orders, onClose }: { orders: IncomingOrder[]; onClose: () => void }) {
  const t = useTranslations("kitchen");
  const allergy = orders.some((o) => o.allergy);
  const shown = orders.slice(0, 4);
  return (
    <div className={styles.layer} role="presentation">
      <button
        type="button"
        onClick={onClose}
        data-testid="new-order-alert"
        data-allergy={allergy || undefined}
        aria-live="assertive"
        className={styles.card}
      >
        <span className={styles.icon} aria-hidden="true">
          {allergy ? <TriangleAlert /> : <BellRing />}
        </span>
        <span className={styles.body}>
          <span className={styles.title}>
            {orders.length === 1 ? t("newOrder") : t("newOrders", { count: orders.length })}
          </span>
          <span className={styles.list}>
            {shown.map((o) => (
              <span key={o.id} className={styles.item}>
                {o.table ? t("ticket.tableLabel", { table: o.table }) : t("ticket.noTable")}
                <span className={styles.number}>{t("ticket.voidOrder", { number: o.number })}</span>
              </span>
            ))}
          </span>
          {allergy && <span className={styles.allergy}>{t("ticket.allergy")}</span>}
        </span>
        <span className={styles.timer} aria-hidden="true" />
      </button>
    </div>
  );
}
