"use client";

import styles from "./guest.module.css";
import { MinusIcon, PlusIcon } from "./ui";

// The one quantity control of the guest pages (ADR-095): a filled 44 px pill,
// «− n +», the same on a dish row, in the order view and in the desktop
// rail. A dish row starts it as a round "+" that widens into this pill
// (dish-row.tsx); the order lines show it open.
export function QtyPill({
  value,
  max,
  disabled = false,
  decreaseLabel,
  increaseLabel,
  onDecrease,
  onIncrease,
  testId,
}: {
  value: number;
  max: number;
  disabled?: boolean;
  /** «Remove X» at one, «Fewer X» above. */
  decreaseLabel: string;
  increaseLabel: string;
  onDecrease: () => void;
  onIncrease: (from: HTMLElement) => void;
  testId?: string;
}) {
  return (
    <span className={styles.addCtl} data-open="" data-testid={testId}>
      <button
        type="button"
        aria-label={decreaseLabel}
        disabled={disabled}
        onClick={onDecrease}
        className={styles.addStep}
      >
        <MinusIcon />
      </button>
      <output className={`num ${styles.addCount}`}>{value}</output>
      <button
        type="button"
        aria-label={increaseLabel}
        disabled={disabled || value >= max}
        onClick={(e) => onIncrease(e.currentTarget)}
        className={styles.addStep}
      >
        <PlusIcon />
      </button>
    </span>
  );
}
