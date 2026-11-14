# Project Memory

**Purpose:** evidence-backed continuity and current state. **Status:** local application implemented with verification; commercial release blocked by external and business prerequisites. **Updated:** 2026-11-14. **Related:** [PRD](PRD.md) · [Architecture](Architecture.md) · [Phases](Phases.md) · [Rules](Rules.md) · [DELIVERY](DELIVERY.md).

## Verified current state

The canonical eleven docs live in `docs/`; the initial workspace had no application. The repository now contains a Next.js/TypeScript/PostgreSQL app, npm lockfile, SQL migrations, fictional seed, interactive one-owner bootstrap, Better Auth MFA, persistent storefront and owner commands, provider-independent commerce, local payment/notification adapters, account/history/linking, discounts, reports/exports and editable content. Exact runtime versions and setup are in [README](../README.md). No real integration, remote repository, deployment, payment or customer message was performed.

Completed checks: app/auth migrations and fictional seed; lint/typecheck; 2 unit tests; 19 isolated real-PostgreSQL tests; 7 browser scenarios at the final checkpoint; owner bootstrap/MFA/deactivation smoke; notification failure/retry/idempotency; isolated database dump/restore. Local test evidence does not establish provider sandbox or commercial readiness. Screenshots: [mobile storefront](../artifacts/mobile-storefront.png), [owner inventory](../artifacts/admin-inventory.png), [tracking](../artifacts/mobile-order-tracking.png). Planned verification IDs remain in DELIVERY with execution scope.

## History

| Date       | Change                                                                                                        | Reason                                                               | State                           | Evidence                                                            | Authoritative home          |
| ---------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------- | --------------------------- |
| 2026-11-14 | Eleven initial docs authored                                                                                  | Docs-first user request                                              | Documented                      | Earlier run record                                                  | PRD and related docs        |
| 2026-11-14 | R1–R8 reconciled                                                                                              | Prevent stock release, refund overcommitment and ambiguous authority | Implemented locally             | SQL/domain modules and PostgreSQL tests                             | DATA/API/SECURITY           |
| 2026-11-14 | Initial runtime absence overcame by official checksum-verified Node download and isolated embedded PostgreSQL | Enable actual implementation/testing                                 | Verified local setup            | Node24.22.3, PostgreSQL18.6, lockfile                               | Architecture/README         |
| 2026-11-14 | Next.js app and owner/customer auth implemented                                                               | Authorized implementation task                                       | Implemented/tested locally      | Build, auth smoke and browser tests                                 | Architecture/USERS/SECURITY |
| 2026-11-14 | Commerce/P1 workflows implemented and checked                                                                 | Persistent local operation                                           | Implemented/tested locally      | DELIVERY evidence checkpoint                                        | DATA/API/Phases             |
| 2026-11-14 | Official provider sources retained, no access inferred                                                        | Separate local from real-provider claims                             | Unverified external integration | bKash business/merchant pages and SSLCOMMERZ docs from prior record | Architecture/API            |

## Remaining boundaries and next step

Owner/business decisions D-01–D-12 remain authoritative in PRD except the technical baseline confirmed by the implementation instruction. Commercial release needs approved policies/contact/language/branding, product verification process, tax/invoice review, merchant eligibility and provider sandbox proof, real transactional/recovery delivery, courier arrangements/rates/restrictions, production infrastructure and operating procedures. Manual courier is implemented; URL media is implemented, native uploads are not. Search is client-side for the small initial catalog. Return/warranty eligibility remains owner-reviewed; no unapproved duration is encoded. Staff access and Phase4 growth remain disabled/planned.

The initial empty `.git` directory was read-only in the default sandbox; approved local access successfully initialized Git. No remote was added. Next.js generated root AGENTS.md during development; current-version installed docs were read. Local runtimes, dependency cache and private automation credentials were created under `/tmp`; secrets remain outside tracked source and must not be copied to logs/docs. The application database and setup are reproducible via README.

Next executable work: complete selected real payment provider discovery/sandbox verification, real notification/recovery adapter and production operational review. Continue independent local improvements without claiming those external gates passed.

## Update protocol

Date every change and link evidence; distinguish proposed, confirmed, implemented, tested and released. Preserve superseded history and update the authoritative document rather than copying requirements here. Never record secrets, customer PII or raw provider logs.
