# Dependency Security Tracking

This ledger describes repository dependencies, not any operator's production environment. A patched lockfile does not prove that a deployment has been updated. Do not add hostnames, IP addresses, credentials, private logs or customer records here.

## Reviewed 2026-11-11

- The daily Dependency Security Audit workflow is failing while the latest main-branch CI run passed. CI audits production dependencies only; the daily workflow includes development dependencies. GitHub's job/log endpoints returned HTTP 502 during review, so individual remote failure logs could not be verified.
- Locally reproduced [CVE-2026-118764 / GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249): minimatch 10.2.6 in the root ESLint/parser dependency tree. Five audit entries describe one underlying moderate-severity denial-of-service advisory, not five independent defects. Added a constrained override to patched minimatch 11.0.1. Full root, API and web lockfile audits now report zero known vulnerabilities locally. Full lint and hook-order regression passed using Node 24.
- The full dependency audit now also runs on main-branch dependency changes and dependency pull requests, without suppressing development advisories or raising the failure threshold.
- Updated the web image from nginx:1.27-alpine to nginx:1.30.6-alpine, the current stable patched release listed in [upstream downloads](https://nginx.org/en/download.html) and [security advisories](https://nginx.org/en/security_advisories.html). Configuration validation and local static-app/SPA/asset smoke checks passed. Individual advisory exploitability depends on enabled modules and configuration; this is not a claim that every listed issue was reachable.
- Added weekly Docker dependency checks for API and web images. Routine npm update PRs exist, but were not blindly merged. Major Prisma/client, TypeScript, Vite and web-push upgrades require separate compatibility testing.
- Remaining coverage: GitHub reported no CodeQL analysis; no runs were found for the separate E2E workflow. npm audit does not scan application logic, container OS packages, host packages, or non-registry dependencies comprehensively. A full container/source scan and deployment verification remain separate tasks.
- Exact-CVE Exploit-DB search found no indexed match for CVE-2026-118764; this does not establish absence of an exploit. No exploit was executed and no production security changes were made in this review.

These changes are locally validated, not evidence that a remote workflow or deployed image has been updated.

## Reviewed 2026-10-23

| Advisory | Dependency | Repository action | Verification |
| --- | --- | --- | --- |
| [CVE-2023-54404 / GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) | Zod below 4.6.6; high severity | Upgrade API from 3.25.76 to 4.6.7; remove the v3-only JSON Schema adapter. Use native v4, not the v3 compatibility entry point. | Regression checks early rejection of oversized constrained arrays and preserves PATCH omission semantics. |
| [CVE-2026-107832 / GHSA-389g-gv7q-r4x8](https://github.com/advisories/GHSA-389g-gv7q-r4x8) | Fastify 5.12.2 through versions below 5.12.6; low severity | Already upgraded; lockfile resolves 5.12.7. | Recheck npm production audit on each release. |

The [Zod upstream fix](https://github.com/colinhacks/zod/pull/6652) checks collection size before validating elements when a size constraint is present. It does not make unbounded collections safe automatically. The API also bounds parsed request bodies and queries before schema validation: maximum 64 nesting levels, 10,000 entries per collection and 200,000 visited values per input. Existing HTTP byte limits and stricter route-specific limits still apply. Large requests exceeding this budget receive a validation error rather than entering expensive schema validation. This is defense in depth, not a guarantee against every denial-of-service technique.

Exploit-DB check for CVE-2023-54404: no matching indexed result found on 2026-10-23; direct lookup was unavailable. Public exploit status remains unverified. Do not interpret this as evidence that no exploit exists. No exploit code was run against a deployment.

### Development Dependencies

Enabling repository dependency alerts also surfaced build/development-tool findings. These are still worth fixing even when they are not shipped as application runtime dependencies. The lockfiles now resolve the following patched versions; all-dependency npm audits (without `--omit=dev`) are clean at this checkpoint.

| Advisory | Patched lockfile resolution |
| --- | --- |
| [CVE-2026-102422: shell-quote command injection](https://github.com/advisories/GHSA-pqg4-j6r4-53mv) | shell-quote 1.12.0 via concurrently 9.2.5 |
| [CVE-2026-102277](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr), [recursive brace parsing](https://github.com/advisories/GHSA-qhr7-859c-m2p7), [comma recursion](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p): brace-expansion denial of service | brace-expansion 5.0.12 |
| [CVE-2026-93749: source-map-js denial of service](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) | source-map-js 1.2.2 |
| [CVE-2026-112942](https://github.com/advisories/GHSA-587h-7wmj-h5pm), [112943](https://github.com/advisories/GHSA-698v-4r3x-3vcv), [112944](https://github.com/advisories/GHSA-r825-w8mm-5pxw), [112945](https://github.com/advisories/GHSA-9jrq-w75r-8gcw), [112946](https://github.com/advisories/GHSA-rq7h-c2jc-7f22): Vite/development-editor advisories | Vite 7.3.7 |
| CVE-2023-54404, linked above | Root tooling's transitive Zod also upgraded to 4.6.7 |

Exploit-DB status for these additional findings has not been verified. Do not delay available patches while waiting for a public exploit listing.

## Review Procedure

1. Run the Dependency Security Audit workflow or `npm audit --package-lock-only` in the repository root, `apps/api` and `apps/web`. Include development tools; an audit with `--omit=dev` covers only production dependencies.
2. Confirm affected and patched versions using the maintainer advisory. Record applicability, severity, remediation and the check date here without production details.
3. Check [NVD](https://nvd.nist.gov/vuln/search), [CISA KEV](https://www.cisa.gov/known-exploited-vulnerabilities-catalog) and [Exploit-DB](https://www.exploit-db.com/) using the exact CVE. Record uncertainty and dates; exploit availability and known active exploitation are different things.
4. Test upgrades, including validation behavior and import/export compatibility. Do not bypass audit failures or blindly apply `npm audit fix --force`.
5. Review container/base-image and host advisories separately. Confirm rollout privately and retain a tested rollback path.

Daily npm audits and weekly Dependabot updates are configured in `.github`. GitHub scheduling and notifications depend on repository/account settings; this is not continuous monitoring or an automatic Exploit-DB feed.
