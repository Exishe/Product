# Supply Chain Risk Report — `audit`

**Scanned:** `audit`  
**Manifests read:** `package.json`, `package-lock.json`  
**Scanned at:** 2026-11-09T13:30:41+00:00  
**Direct dependencies:** 36 (npm 36)

## Summary

- **No known advisory affects any of the 36 direct dependencies**, checked at the versions this project resolves.
- **1 transitive package carries known advisories** at the locked versions — see Transitive advisories. 4 entries were unverifiable against a public registry and not checked (see Transitive advisories).
- 7 of 36 dependencies carry at least one finding, 4 of which reach production.
- Weakest coverage: **Repository archived**, established for 0 of 36; the Coverage section lists every criterion.

## Production dependencies

22 dependencies are declared as runtime dependencies and ship in the built artifact. Advisory status is given for every one, clean or not.

| Dependency | Version | Advisories | Other findings |
|---|---|---|---|
| `@anthropic-ai/sdk` | 1.6.0 | none known | — |
| `@google/genai` | 3.0.0 | none known | — |
| `@sentry/nextjs` | 11.11.0 | none known | — |
| `@supabase/ssr` | 0.12.7 | none known | — |
| `@supabase/supabase-js` | 2.119.0 | none known | — |
| `@tanstack/react-query` | 5.107.1 | none known | — |
| `class-variance-authority` | 0.7.1 | none known | Publisher concentration |
| `clsx` | 2.1.1 | none known | Publisher concentration |
| `grammy` | 1.46.0 | none known | — |
| `idb` | 8.0.4 | none known | Publisher concentration |
| `lucide-react` | 1.70.0 | none known | — |
| `next` | 16.4.5 | none known | — |
| `next-intl` | 4.14.9 | none known | — |
| `posthog-js` | 1.447.4 | none known | — |
| `radix-ui` | 1.8.1 | none known | — |
| `react` | 19.3.1 | none known | — |
| `react-dom` | 19.3.1 | none known | — |
| `recharts` | 3.10.1 | none known | — |
| `server-only` | 0.0.1 | none known | Publisher concentration |
| `tailwind-merge` | 3.7.0 | none known | — |
| `uqr` | 0.1.3 | none known | — |
| `zod` | 4.6.7 | none known | — |

## Findings

### Reaches production

| Dependency | Version | Weekly downloads | Findings |
|---|---|---|---|
| `class-variance-authority` | 0.7.1 | 80,794,628/wk | single human publisher (joebell93) of 1 listed |
| `clsx` | 2.1.1 | 164,311,438/wk | single human publisher (lukeed) of 1 listed |
| `idb` | 8.0.4 | 36,174,365/wk | single human publisher (jaffathecake) of 1 listed |
| `server-only` | 0.0.1 | 33,627,635/wk | single human publisher (sebmarkbage) of 1 listed |

### Build-time only

Declared as development dependencies. A compromise here reaches build and CI hosts rather than users of the shipped artifact.

| Dependency | Version | Weekly downloads | Findings |
|---|---|---|---|
| `@types/node` | 24.19.2 | 630,189,556/wk | single human publisher (types) of 1 listed |
| `@types/react` | 19.3.0 | 226,267,713/wk | single human publisher (types) of 1 listed |
| `@types/react-dom` | 19.3.0 | 191,391,080/wk | single human publisher (types) of 1 listed |

## Upstream repository and CI hygiene — OpenSSF Scorecard

These criteria describe each dependency's own repository, not the audited
project. Remediation, where any exists, is upstream.

No criterion in this tier was assessable for any dependency.

## Transitive advisories

1 package of the 770 registry-verified packages beyond the direct set (resolved by `package-lock.json`) carries known advisories at the locked versions. Only advisories were checked at this depth.

| Package | Version | Reaches | Advisories |
|---|---|---|---|
| `minimatch` (npm) | 10.2.6 | build-time only | GHSA-g3hv-75wg-m249 |

4 entries in the lockfile could not be verified against a public registry and were not checked for advisories:

- `@emnapi/core` 1.11.3 (npm) — resolves from an undeclared source, not the npm registry, so registry-keyed advisory data does not apply to it
- `@emnapi/wasi-threads` 1.2.3 (npm) — resolves from an undeclared source, not the npm registry, so registry-keyed advisory data does not apply to it
- `@napi-rs/wasm-runtime` 1.2.2 (npm) — resolves from an undeclared source, not the npm registry, so registry-keyed advisory data does not apply to it
- `@tybys/wasm-util` 0.10.3 (npm) — resolves from an undeclared source, not the npm registry, so registry-keyed advisory data does not apply to it

## Informational

Measured, not flagged.

- **Publish provenance**: 23 of 36 publish with build provenance.
  Without: `@google/genai`, `@sentry/nextjs`, `@types/node`, `@types/react`, `@types/react-dom`, `class-variance-authority`, `clsx`, `eslint`, `idb`, `prettier` and 3 more
- **Security policy published**: not determinable for any dependency in this project.
- **Download volume**: established for 36 of 36; median 80,794,628/week. Lowest: `grammy` (3,913,859/wk), `supabase` (8,729,516/wk), `next-intl` (9,630,469/wk).

## Coverage

What was and was not measured, per criterion.

| Criterion | Tier | Assessed | Flagged | Not assessable |
|---|---|---|---|---|
| Known advisories | A | 36/36 | 0 | 0 |
| Deprecated or yanked | A | 36/36 | 0 | 0 |
| Repository archived | A | 0/36 | 0 | 36 |
| Maintenance activity | A | 0/36 | 0 | 36 |
| Publisher concentration | B | 12/36 | 7 | 24 |
| Install-time script execution | B | 36/36 | 0 | 0 |
| Dangerous CI workflow | scorecard | 0/36 | 0 | 36 |
| CI token permissions | scorecard | 0/36 | 0 | 36 |
| Checked-in binaries | scorecard | 0/36 | 0 | 36 |
| Changes reviewed by a second person | scorecard | 0/36 | 0 | 36 |
| Publish provenance | info | 36/36 | 0 | 0 |
| Security policy published | info | 0/36 | 0 | 36 |
| Download volume | info | 36/36 | 0 | 0 |

## Not assessable

**Repository archived**

- 35 dependencies — the GitHub API did not answer: `@anthropic-ai/sdk`, `@google/genai`, `@playwright/test`, `@sentry/nextjs`, `@supabase/ssr`, `@supabase/supabase-js` and 29 more
- 1 dependency — no source repository could be resolved for this package: `server-only`

**Checked-in binaries**

- 35 dependencies — the GitHub API did not answer: `@anthropic-ai/sdk`, `@google/genai`, `@playwright/test`, `@sentry/nextjs`, `@supabase/ssr`, `@supabase/supabase-js` and 29 more
- 1 dependency — no source repository to score: `server-only`

**Changes reviewed by a second person**

- 35 dependencies — the GitHub API did not answer: `@anthropic-ai/sdk`, `@google/genai`, `@playwright/test`, `@sentry/nextjs`, `@supabase/ssr`, `@supabase/supabase-js` and 29 more
- 1 dependency — no source repository to score: `server-only`

**Dangerous CI workflow**

- 35 dependencies — the GitHub API did not answer: `@anthropic-ai/sdk`, `@google/genai`, `@playwright/test`, `@sentry/nextjs`, `@supabase/ssr`, `@supabase/supabase-js` and 29 more
- 1 dependency — no source repository to score: `server-only`

**Publisher concentration**

- 23 dependencies — publishes from CI with provenance, so the effective publisher set is whoever can merge to the release branch — not externally observable: `@anthropic-ai/sdk`, `@playwright/test`, `@supabase/ssr`, `@supabase/supabase-js`, `@tailwindcss/postcss`, `@tanstack/react-query` and 17 more
- 1 dependency — every listed maintainer looks automated; the human population is unknown: `@sentry/nextjs`

**Security policy published**

- 35 dependencies — the GitHub API did not answer: `@anthropic-ai/sdk`, `@google/genai`, `@playwright/test`, `@sentry/nextjs`, `@supabase/ssr`, `@supabase/supabase-js` and 29 more
- 1 dependency — no source repository could be resolved for this package: `server-only`

**Maintenance activity**

- 35 dependencies — the GitHub API did not answer: `@anthropic-ai/sdk`, `@google/genai`, `@playwright/test`, `@sentry/nextjs`, `@supabase/ssr`, `@supabase/supabase-js` and 29 more
- 1 dependency — no source repository could be resolved for this package: `server-only`

**CI token permissions**

- 35 dependencies — the GitHub API did not answer: `@anthropic-ai/sdk`, `@google/genai`, `@playwright/test`, `@sentry/nextjs`, `@supabase/ssr`, `@supabase/supabase-js` and 29 more
- 1 dependency — no source repository to score: `server-only`

## Method and caveats

- Repository-level criteria (archived, maintenance activity, security policy, and the Scorecard checks) describe the source repository rather than the package. 35 dependencies resolve to 30 distinct repositories, so one repository can appear as several findings. Shared: github.com/DefinitelyTyped/DefinitelyTyped, github.com/react/react, github.com/tailwindlabs/tailwindcss, github.com/vercel/next.js
- Optional tooling detected: npm. Not installed, so not used: bundler-audit, cargo-audit, osv-scanner, pip-audit.
- Every criterion except advisories applies to direct dependencies only. The 770 registry-verified packages resolved by package-lock.json were checked for known advisories at their locked versions, and for nothing else. 4 lockfile entries could not be verified against a public registry and were not checked.
- HTTP sources: 76 fetched, 36 served from cache (oldest 0.0h old), 0 refetched as stale, 0 unavailable offline, 35 errors.
