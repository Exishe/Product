"use client";

import styles from "./guest.module.css";
import { MinusIcon, PlusIcon } from "./ui";

// The one quantity control of the guest pages (ADR-095): a filled 44 px pill,
// «− n +», the same on a dish row, in the order view and in the desktop
// rail and in the dish sheet's footer. A dish row starts it as a round "+"
// that widens into this pill (dish-row.tsx); the order lines and the sheet
// show it open. The sheet counts from 1 (`min`), so its «−» rests at 1.
export function QtyPill({
  value,
  min = 0,
  max,
  disabled = false,
  valueLabel,
  decreaseLabel,
  increaseLabel,
  onDecrease,
  onIncrease,
  testId,
}: {
  value: number;
  /** «−» is off at this value (the sheet's 1); the order lines go to 0 (remove). */
  min?: number;
  max: number;
  disabled?: boolean;
  /** The count's own name («Quantity») where it stands alone. */
  valueLabel?: string;
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
        disabled={disabled || value <= min}
        onClick={onDecrease}
        className={styles.addStep}
      >
        <MinusIcon />
      </button>
      <output className={`num ${styles.addCount}`} aria-label={valueLabel}>
        {value}
      </output>
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
