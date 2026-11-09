// The navigation link for the page being shown: the longest link that is the
// path itself or one of its parent folders.
export function activeHref(pathname: string, hrefs: readonly string[]): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    if ((pathname === href || pathname.startsWith(`${href}/`)) && (!best || href.length > best.length))
      best = href;
  }
  return best;
}
