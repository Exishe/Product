/** "≈ 620 kcal": always with the ≈, a whole number of kcal; `template` is the guest.menu.kcal text. */
export function formatKcal(kcal: number, template: (value: string) => string, locale: string): string {
  return template(new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(kcal)));
}
