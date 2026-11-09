import { existsSync, readFileSync } from "node:fs";
import { ALLOWED, disallowedPackages } from "./licenses.ts";

const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));

function installedLicense(path: string): string | undefined {
  const file = `${path}/package.json`;
  if (!existsSync(file)) return undefined;
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  return typeof pkg.license === "string" ? pkg.license : pkg.license?.type;
}

const failures = disallowedPackages(lock, ALLOWED, installedLicense);
if (failures.length > 0) {
  for (const f of failures) console.error(`not allowed: ${f.name} (${f.license ?? "no license"})`);
  process.exit(1);
}
console.log(`licenses ok: ${Object.keys(lock.packages).length - 1} packages`);
