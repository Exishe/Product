# Dependency and license audit

Audit date: 9 Nov 2026. Input: [`planned-package.json`](planned-package.json) (22 runtime and 14 development dependencies, exact versions), resolved with `npm install --package-lock-only --ignore-scripts` to 811 packages. No package code was installed or executed.

## Supply-chain risk

The supply-chain-risk-auditor collector produced [`supply-chain-report.md`](supply-chain-report.md). Summary of what it measured:

- No known advisory affects any of the 36 direct dependencies at the pinned versions.
- One transitive package carries an advisory: `minimatch` 10.2.6, GHSA-g3hv-75wg-m249 (moderate, denial of service through glob-pattern amplification, fixed in 11.0.1). It reaches the build only, through `eslint-config-next` → `typescript-eslint` → `@typescript-eslint/typescript-estree`. npm's suggested fix downgrades `eslint-config-next` to 15.5.29, a major step back.
- Seven dependencies have a single human publisher: four reach production (`class-variance-authority`, `clsx`, `idb`, `server-only`) and three are `@types/*` packages. All seven have tens of millions of weekly downloads or more.
- 23 of 36 direct dependencies publish with build provenance.
- No direct dependency is deprecated, and none runs install-time scripts according to the registry metadata.

Coverage limits: the GitHub API did not answer in this environment, so repository archival, maintenance activity and all OpenSSF Scorecard criteria were not assessed for any dependency. "No advisories" means none among the 36 direct and 770 registry-verified transitive packages. Four WebAssembly helper packages (`@emnapi/core`, `@emnapi/wasi-threads`, `@napi-rs/wasm-runtime`, `@tybys/wasm-util`) resolve from an undeclared source and were not checked for advisories.

Actions:

1. `minimatch`: Phase 6 adds an npm `overrides` entry forcing `minimatch` `^11.0.1` under `@typescript-eslint/typescript-estree` and keeps it if `npm run lint` passes. If lint breaks, the advisory is accepted: the linter only evaluates glob patterns written in this repository, which an outside party can't supply.
2. Repository-level criteria: the audit is re-run from an environment with authenticated GitHub access before the first deploy (brief: "before any deploy").
3. Lockfile and versions are pinned exactly; Dependabot or Renovate proposes upgrades as pull requests that pass CI.

## Peer-dependency compatibility

Checked by resolving the tree:

- ESLint 10.14.0 conflicts with `eslint-plugin-import` 2.32.0, `eslint-plugin-jsx-a11y` 6.10.2 and `eslint-plugin-react` 7.37.5, all pulled in by `eslint-config-next` 16.4.5, which accept ESLint up to 9. Pinned ESLint 9.39.5; the tree then resolves with no peer warnings.
- TypeScript 7.0.2 is outside `typescript-eslint` 8.72.1's supported range (`>=4.8.4 <6.1.0`). Pinned TypeScript 6.0.3.
- `next-intl` 4.14.9, `@sentry/nextjs` 11.11.0 and `@supabase/ssr` 0.12.7 declare Next 16 and React 19 support.

## Licenses

All 811 resolved packages declare a license. Counts:

| License | Packages |
|---|---|
| MIT | 649 |
| Apache-2.0 | 53 |
| ISC | 30 |
| BSD-3-Clause | 15 |
| MPL-2.0 | 13 |
| Apache-2.0 AND MIT | 12 |
| LGPL-3.0-or-later (incl. combined with Apache/MIT) | 14 |
| BSD-2-Clause | 9 |
| BlueOak-1.0.0 | 7 |
| 0BSD, CC0-1.0, Unlicense, MIT OR CC0-1.0, MIT AND ISC AND BSD-3-Clause | 6 |
| (MPL-2.0 OR Apache-2.0) | 1 |
| CC-BY-4.0 | 1 |
| FSL-1.1-Apache-2.0 | 1 |

No package is licensed under GPL or AGPL. The non-permissive licenses present, and why each is acceptable for a closed-source SaaS:

| Package | License | Assessment |
|---|---|---|
| `@img/sharp-libvips-*`, `@img/sharp-win32-*`, `@img/sharp-wasm32` | LGPL-3.0-or-later | Optional platform binaries of `sharp`, used by Next.js image optimisation. Dynamically linked and unmodified; LGPL permits this. |
| `lightningcss` and platform builds | MPL-2.0 | Used by Tailwind at build time. MPL obligations apply only to modified MPL files; we don't modify them. |
| `axe-core` | MPL-2.0 | Development only (accessibility checks). Same reasoning. |
| `dompurify` | MPL-2.0 OR Apache-2.0 | Used under Apache-2.0. |
| `sentry` (CLI) | FSL-1.1-Apache-2.0 | Build-time tool for uploading source maps. The Functional Source License restricts offering a competing product, which we don't; each release becomes Apache-2.0 after two years. |
| `caniuse-lite` | CC-BY-4.0 | Browser-support data; attribution is carried in the package. |

Every package has to keep passing this check. CI runs a license allowlist step (Phase 6) that fails on any license outside: MIT, ISC, BSD-2/3, 0BSD, Apache-2.0, BlueOak-1.0.0, CC0-1.0, Unlicense, CC-BY-4.0 (data only), MPL-2.0 and LGPL-3.0 (unmodified dependencies only), FSL-1.1-Apache-2.0 (build tools only).

## Reference projects

Unchanged from Phase 0: no code from AGPL or unlicensed reference repositories enters this codebase (`docs/00-research/reference-analysis.md`).
