// Option rules in the dish sheet. The database checks the same min/max when
// the order is placed (private.place_order_core); these keep the guest from
// sending something it would refuse.
export type Option = { id: string; delta: number; isDefault: boolean };
export type Group = { id: string; min: number; max: number; modifiers: Option[] };
/** Chosen option ids per group id. */
export type Selection = Record<string, string[]>;

// Defaults are preselected; a required group without enough defaults gets
// its first options (screens.md: "The first option is preselected").
export function initialSelection(groups: readonly Group[]): Selection {
  const out: Selection = {};
  for (const g of groups) {
    const chosen = g.modifiers.filter((m) => m.isDefault).map((m) => m.id).slice(0, g.max);
    for (const m of g.modifiers) {
      if (chosen.length >= g.min) break;
      if (!chosen.includes(m.id)) chosen.push(m.id);
    }
    out[g.id] = g.modifiers.map((m) => m.id).filter((id) => chosen.includes(id));
  }
  return out;
}

export function toggleOption(selection: Selection, group: Group, optionId: string): Selection {
  if (!group.modifiers.some((m) => m.id === optionId)) return selection;
  const current = selection[group.id] ?? [];
  const isOn = current.includes(optionId);
  let next: string[];
  if (group.max === 1) {
    // One choice: a required one behaves like radio buttons, an optional one can be cleared.
    next = isOn ? (group.min >= 1 ? current : []) : [optionId];
  } else if (isOn) {
    next = current.filter((id) => id !== optionId);
  } else if (current.length < group.max) {
    next = [...current, optionId];
  } else {
    return selection;
  }
  return { ...selection, [group.id]: group.modifiers.map((m) => m.id).filter((id) => next.includes(id)) };
}

export function isSelectionValid(groups: readonly Group[], selection: Selection): boolean {
  return groups.every((g) => {
    const chosen = selection[g.id] ?? [];
    return (
      chosen.length >= g.min && chosen.length <= g.max && chosen.every((id) => g.modifiers.some((m) => m.id === id))
    );
  });
}

export function selectedIds(groups: readonly Group[], selection: Selection): string[] {
  return groups.flatMap((g) => g.modifiers.filter((m) => selection[g.id]?.includes(m.id)).map((m) => m.id));
}

export function unitPrice(price: number, groups: readonly Group[], selection: Selection): number {
  return groups.reduce(
    (sum, g) => sum + g.modifiers.filter((m) => selection[g.id]?.includes(m.id)).reduce((s, m) => s + m.delta, 0),
    price,
  );
}
