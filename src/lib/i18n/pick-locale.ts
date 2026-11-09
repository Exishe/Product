import { routing, type Locale } from "@/i18n/routing";

const isLocale = (x: unknown): x is Locale => typeof x === "string" && (routing.locales as readonly string[]).includes(x);

// Accept-Language as [language, weight] pairs, best first. Only the primary
// subtag matters ("ru-RU" is "ru"); weight 0 means "not this one".
function preferences(header: string): string[] {
  return header
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const weight = q === undefined ? 1 : Number(q.slice(2));
      return { lang: tag.trim().toLowerCase().split("-")[0] ?? "", weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter((p) => p.lang && p.lang !== "*" && p.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index)
    .map((p) => p.lang);
}

// The guest page's language: one the guest chose earlier on this phone, else
// the browser's, else the café's default (i18n.md) — always one the café offers.
export function pickGuestLocale({
  chosen,
  acceptLanguage,
  offered,
  fallback,
}: {
  chosen?: string | null;
  acceptLanguage: string | null;
  offered: readonly string[];
  fallback: string;
}): Locale {
  const available = offered.filter(isLocale);
  if (available.length === 0) return routing.defaultLocale;
  const ok = (x: unknown): x is Locale => isLocale(x) && available.includes(x);
  if (ok(chosen)) return chosen;
  const fromBrowser = preferences(acceptLanguage ?? "").find(ok);
  if (fromBrowser) return fromBrowser;
  if (ok(fallback)) return fallback;
  return available.includes(routing.defaultLocale) ? routing.defaultLocale : (available[0] as Locale);
}
