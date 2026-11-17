// npm audit with a reviewed allowlist (ADR-053). Fails on any high or
// critical advisory except those listed in .audit-allowlist.json, and fails
// once an allowlist entry passes its "until" date, so nothing stays ignored
// by accident.
//
//   node scripts/check-audit.mjs
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const allow = JSON.parse(readFileSync(new URL("../.audit-allowlist.json", import.meta.url), "utf8"));
const today = new Date().toISOString().slice(0, 10);
const expired = allow.filter((a) => a.until < today);
for (const a of expired) console.error(`allowlist entry expired on ${a.until}: ${a.id} (${a.package}); review it`);

let out;
try {
  out = execFileSync("npm", ["audit", "--json"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
} catch (e) {
  out = e.stdout; // npm audit exits non-zero when it finds anything
}
const report = JSON.parse(out);
const ids = new Set(allow.filter((a) => a.until >= today).map((a) => a.id));
const advisory = (url) => (url ?? "").split("/").pop();
const blocking = [];
for (const [name, v] of Object.entries(report.vulnerabilities ?? {})) {
  for (const via of v.via) {
    if (typeof via !== "object") continue; // a dependency of a vulnerable package: counted at its root
    if (!["high", "critical"].includes(via.severity)) continue;
    if (ids.has(advisory(via.url))) continue;
    blocking.push(`${name}: ${via.severity} ${via.title} ${via.url}`);
  }
}
if (blocking.length || expired.length) {
  for (const b of blocking) console.error(b);
  process.exit(1);
}
console.log(`npm audit: no high or critical advisories outside the allowlist (${ids.size} allowed)`);
