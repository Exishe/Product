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

// The same, for links that also stand for pages outside their folder (Sales
// covers Reports and Export, which have no navigation row of their own).
export function activeLink(
  pathname: string,
  links: readonly { href: string; also?: readonly string[] }[],
): string | null {
  const owner = new Map<string, string>();
  for (const l of links) {
    for (const prefix of [l.href, ...(l.also ?? [])]) owner.set(prefix, l.href);
  }
  const hit = activeHref(pathname, [...owner.keys()]);
  return hit === null ? null : (owner.get(hit) ?? null);
}
