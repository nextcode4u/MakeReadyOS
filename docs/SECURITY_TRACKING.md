# Dependency Security Tracking

This ledger describes repository dependencies, not any operator's production environment. A patched lockfile does not prove that a deployment has been updated. Do not add hostnames, IP addresses, credentials, private logs or customer records here.

## Reviewed 2026-10-23

| Advisory | Dependency | Repository action | Verification |
| --- | --- | --- | --- |
| [CVE-2023-54404 / GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) | Zod below 4.6.6; high severity | Upgrade API from 3.25.76 to 4.6.7; remove the v3-only JSON Schema adapter. Use native v4, not the v3 compatibility entry point. | Regression checks early rejection of oversized constrained arrays and preserves PATCH omission semantics. |
| [CVE-2026-107832 / GHSA-389g-gv7q-r4x8](https://github.com/advisories/GHSA-389g-gv7q-r4x8) | Fastify 5.12.2 through versions below 5.12.6; low severity | Already upgraded; lockfile resolves 5.12.7. | Recheck npm production audit on each release. |

The [Zod upstream fix](https://github.com/colinhacks/zod/pull/6652) checks collection size before validating elements when a size constraint is present. It does not make unbounded collections safe automatically. The API also bounds parsed request bodies and queries before schema validation: maximum 64 nesting levels, 10,000 entries per collection and 200,000 visited values per input. Existing HTTP byte limits and stricter route-specific limits still apply. Large requests exceeding this budget receive a validation error rather than entering expensive schema validation. This is defense in depth, not a guarantee against every denial-of-service technique.

Exploit-DB check for CVE-2023-54404: no matching indexed result found on 2026-10-23; direct lookup was unavailable. Public exploit status remains unverified. Do not interpret this as evidence that no exploit exists. No exploit code was run against a deployment.

## Review Procedure

1. Run the Dependency Security Audit workflow or `npm audit --omit=dev --package-lock-only` in the repository root, `apps/api` and `apps/web`.
2. Confirm affected and patched versions using the maintainer advisory. Record applicability, severity, remediation and the check date here without production details.
3. Check [NVD](https://nvd.nist.gov/vuln/search), [CISA KEV](https://www.cisa.gov/known-exploited-vulnerabilities-catalog) and [Exploit-DB](https://www.exploit-db.com/) using the exact CVE. Record uncertainty and dates; exploit availability and known active exploitation are different things.
4. Test upgrades, including validation behavior and import/export compatibility. Do not bypass audit failures or blindly apply `npm audit fix --force`.
5. Review container/base-image and host advisories separately. Confirm rollout privately and retain a tested rollback path.

Daily npm audits and weekly Dependabot updates are configured in `.github`. GitHub scheduling and notifications depend on repository/account settings; this is not continuous monitoring or an automatic Exploit-DB feed.
