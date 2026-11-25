// What the kitchen's "Ingredient out" list shows at the top: every ingredient that
// is out now, each with its Back button. With api.list_ingredient_outages the names
// of all of them are known. On a database without it, only ids are known, so names
// come from what the search showed in this session and the rest are counted.
export type OutRow = { id: string; name: string };

export function mergeOutRows(
  outIds: ReadonlySet<string>,
  listed: readonly OutRow[] | null,
  known: ReadonlyMap<string, string>,
): { rows: OutRow[]; unnamed: number } {
  if (listed) {
    const rows = listed.filter((r) => r.name !== "");
    return { rows, unnamed: listed.length - rows.length };
  }
  const rows = [...outIds].flatMap((id) => {
    const name = known.get(id);
    return name ? [{ id, name }] : [];
  });
  return { rows, unnamed: outIds.size - rows.length };
}
