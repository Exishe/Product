// License allowlist from docs/02-stack/dependency-audit.md. CI fails on
// anything else, so a copyleft or unknown license can't slip in unnoticed.

export const ALLOWED: ReadonlySet<string> = new Set([
  "MIT",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "0BSD",
  "Apache-2.0",
  "BlueOak-1.0.0",
  "CC0-1.0",
  "Unlicense",
  "CC-BY-4.0", // data only (caniuse-lite)
  "MPL-2.0", // unmodified dependencies only
  "LGPL-3.0", // unmodified dependencies only
  "FSL-1.1-Apache-2.0", // build tools only
  "Python-2.0", // argparse, via ESLint; permissive, dev tooling only
]);

type LockEntry = { license?: string; name?: string };
type Lockfile = { packages: Record<string, LockEntry> };

function normalize(id: string): string {
  return id.trim().replace(/-(only|or-later)$/, "").replace(/\+$/, "");
}

export function isAllowed(expression: string | undefined, allowed: ReadonlySet<string>): boolean {
  if (!expression) return false;
  const expr = expression.trim().replace(/^\((.*)\)$/, "$1");
  if (/ OR /.test(expr)) return expr.split(/ OR /).some((part) => isAllowed(part, allowed));
  if (/ AND /.test(expr)) return expr.split(/ AND /).every((part) => isAllowed(part, allowed));
  return allowed.has(normalize(expr));
}

export function disallowedPackages(
  lock: Lockfile,
  allowed: ReadonlySet<string>,
  installedLicense: (path: string) => string | undefined,
): { name: string; license: string | undefined }[] {
  const failures: { name: string; license: string | undefined }[] = [];
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (path === "") continue; // the app itself
    const name = path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length);
    const license = entry.license ?? installedLicense(path);
    if (!isAllowed(license, allowed)) failures.push({ name, license });
  }
  return failures;
}
