import { transliterate } from "./search";

// A café's web address from its name: Latin letters, digits and hyphens,
// 3–48 characters (restaurants.slug check). The owner can edit it.
export function slugify(name: string): string {
  const words = name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((w) => transliterate(w).replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);
  let slug = words.join("-").slice(0, 48).replace(/-+$/, "");
  if (slug.length < 3) slug = `${slug || "cafe"}-cafe`.replace(/^-/, "");
  return slug;
}
