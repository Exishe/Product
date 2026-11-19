// One rule for "the menu has unpublished changes", shared by the menu editor
// and the admin home so the two never disagree: never published, a section,
// dish or option group edited after publishing, or a dish removed (the active
// dish count no longer matches the published snapshot).
type Edited = { updated_at: string }[] | null | undefined;

export function menuHasChanges(input: {
  publishedAt: string | null;
  publishedItemCount: number | null | undefined;
  categories: Edited;
  items: { updated_at: string; is_active: boolean }[] | null | undefined;
  groups: Edited;
}): boolean {
  if (!input.publishedAt) return true;
  const since = Date.parse(input.publishedAt);
  const editedSince = (rows: Edited) => (rows ?? []).some((r) => Date.parse(r.updated_at) > since);
  const activeCount = (input.items ?? []).filter((d) => d.is_active).length;
  return (
    editedSince(input.categories) ||
    editedSince(input.items) ||
    editedSince(input.groups) ||
    activeCount !== input.publishedItemCount
  );
}
