# Verification, Release, and Operations

**Purpose:** authoritative verification, release, monitoring and recovery. **Status:** local verification evidence recorded; external release unverified. **Updated:** 2026-11-14. **Related:** [Architecture](Architecture.md) · [Phases](Phases.md) · [SECURITY](SECURITY.md) · [DATA](DATA.md).

## Verification strategy and evidence IDs

Use unit tests for pure rules, integration tests with isolated database/provider fakes or official sandbox, and browser tests for critical paths. The scenarios below define the verification catalog; actual execution evidence is recorded at the end. Accessibility: keyboard-only, visible focus, semantic labels, errors announced; mobile viewport and slow network. Proposed targets (validate against hosting/device baseline): public catalog LCP p75 ≤2.5s on agreed mobile profile; API p95 ≤500ms excluding provider; checkout interaction usable ≤3s; measure with real-user and synthetic monitoring after launch.

| ID   | Planned evidence                                                                                         |
| ---- | -------------------------------------------------------------------------------------------------------- |
| V-01 | Selected case SKU shows only correct device compatibility.                                               |
| V-02 | Charger connector, protocols, power profiles and cable facts are accurate against reviewed source.       |
| V-03 | Two buyers compete for last unit; one allocation succeeds.                                               |
| V-04 | Provider success after browser close still reconciles order.                                             |
| V-05 | Repeated/out-of-order notifications are idempotent.                                                      |
| V-06 | Success after cancellation/reservation expiry enters reconciliation, no silent fulfillment.              |
| V-07 | Failed attempt permits safe retry without duplicate charge.                                              |
| V-08 | Failed COD delivery and return-to-origin preserve correct stock states.                                  |
| V-09 | Courier collection then remittance matches; discrepancy remains visible.                                 |
| V-10 | Partial return allocates discount and caps refund correctly.                                             |
| V-11 | Pending/failed refund remains distinct and is recoverable.                                               |
| V-12 | Damaged return cannot become sellable.                                                                   |
| V-13 | Unauthorized customer and staff requests denied server-side.                                             |
| V-14 | Guest order access requires valid proof; phone alone fails.                                              |
| V-15 | Mobile and keyboard checkout including accessible errors.                                                |
| V-16 | Backup restored in isolated environment with verified records.                                           |
| V-17 | Notification and provider/courier outage retries/exceptions recover.                                     |
| V-18 | price/discount/delivery recalculation, policy snapshot, duplicate checkout and cancellation transitions. |
| V-19 | admin role changes, MFA, audit, upload validation and privacy log review.                                |

## Traceability

| PRD       | Actor/journey        | Design               | Data                                  | API                                                                   | Security               | Phase | Evidence |
| --------- | -------------------- | -------------------- | ------------------------------------- | --------------------------------------------------------------------- | ---------------------- | ----- | -------- |
| CAT-01/02 | search, fit, compare | Home/search/PDP      | Product, Variant, Compatibility, Spec | catalog/product                                                       | CAT content review     | 1     | V-01/02  |
| INV-01    | receive/compete      | Inventory/checkout   | Movement, Reservation                 | inventory/checkout                                                    | atomic/auth            | 1/2   | V-03     |
| CART-01   | quote                | Cart/checkout        | Cart, Order snapshot                  | quote/checkout                                                        | server price           | 1/2   | V-18     |
| ORD-01    | guest order          | Checkout/tracking    | Order, guest token                    | checkout/order                                                        | ownership              | 2     | V-14/18  |
| PAY-01    | online/interrupted   | payment states       | PaymentAttempt/Event                  | payment endpoints                                                     | verify/replay          | 2     | V-04–07  |
| COD-01    | COD                  | COD confirmation     | Order/Reservation                     | checkout                                                              | abuse limits           | 2     | V-08/09  |
| FUL-01    | ship/fail            | order/shipment       | Shipment/Tracking                     | fulfillment                                                           | role checks            | 2     | V-08/09  |
| REF-01    | return/refund        | return/refund states | Return/Refund                         | return/refund                                                         | approval/audit         | 2     | V-10–12  |
| ADM-01    | staff ops            | admin screens        | Audit/roles                           | admin APIs                                                            | least privilege/MFA    | 2     | V-13/19  |
| POL-01    | policy review        | help/checkout        | policy snapshot                       | N/A: content can be statically served; version referenced at checkout | privacy                | 2     | V-18     |
| ACC-01    | all checkout         | responsive states    | N/A: presentation behavior            | N/A: no separate operation                                            | accessibility/security | 1/2   | V-15     |

## Environments, release and operations

Dev/test/prod isolated databases, credentials, storage, domains, payment modes. Sandbox/test customers fictional; production data never copied into test. CI proposed: formatting, lint, typecheck, unit/integration suites, dependency/security scanning, build, migration review; release blocked on critical failures. Integration readiness: merchant eligibility and sandbox/live access confirmed, signature/verification/refund behavior documented, duplicate/late-event proof; courier coverage/address/COD/tracking/settlement and battery shipping constraints confirmed; commercial policy/legal review complete.

Release: reviewed change and migration, backup checkpoint, deploy staged build, smoke test public/admin/payment sandbox, monitor, then enable feature/config. Rollback code/config to known build; forward-fix compatible schema or restore only with data-loss decision and reconciliation. Never retry payment blindly during rollback. Backups encrypted, access-limited, schedule/retention owner-approved; restore drill V-16 and reconcile transactions/events after recovery. Proposed alert queues: payment reconciliation, failed refunds, notification retries, stale shipment, undelivered/return-to-origin, unmatched COD, negative/discrepant stock, backup failure, auth abuse.

Recovery: payment discrepancies reconcile provider records before fulfillment/refund; failed refund creates finance task and customer update; failed notifications retry bounded backoff then manual contact; courier update failure retain manual tracking and contact; failed COD delivery reconcile package return before stock; missing remittance remain receivable and escalate with courier reference; stock mismatch freeze affected SKU and reconcile counted stock through reasoned movement. Operational owner responsibilities: owner handles provider/courier/legal access and exception escalation; assigned staff work least-privilege queues. No readiness claim until evidence recorded.

Release gate: all P0 journeys verified in staging, auth/permissions/MFA/logging reviewed, policies/contact/fees configured, backup restore and rollback practiced, external provider/courier proofs complete, monitoring and support ownership assigned. Roadmap sequencing is [Phases](Phases.md).

## Conditional feature and dependency gates (R7–R8)

Verification applicability: catalog keyboard/accessibility runs in Phase 1; checkout keyboard/mobile V-15 runs in Phase 2. These are separate evidence items and Phase 1 does not claim checkout accessibility. COD V-08/V-09 is conditional: required when COD is enabled; when disabled, verify configuration rejects COD and record workflow tests as not applicable with COD disabled. Before discounts ship, any submitted discount code is rejected as unsupported and discount amount is exactly zero; do not silently accept or imply a discount. Essential order/payment/fulfillment and exception notifications plus durable outbox/local sink are Phase 2; campaigns, template editing and convenience automation may follow in Phase 3.

Classify dependencies: **local implementation** (runtime, database, migrations, fictional seed, local auth/bootstrap, test mail sink; blocks only app startup if absent); **sandbox verification** (provider sandbox access/docs, courier test access where available; blocks claims that adapter matches provider, not local commerce, test-adapter or catalog work); **commercial-launch** (merchant approval/credentials, owner policies, payment verification, delivery coverage/rates and battery acceptance, customer communication channel, legal/tax review, production hosting/secrets/backup/monitoring). Missing branding or future staff roster does not block catalog/local workflows or owner-only launch planning. No live secret may be required for local test mode.

## Executed local evidence — 2026-11-14

The plan above now has implementation evidence. `npm run lint`, `npm run typecheck`, `npm test` (2 unit tests), `TEST_DATABASE_URL=... npm run test:db` (19 tests against PostgreSQL18.6 isolated schemas), `npm run test:e2e` (7 scenarios at the final checkpoint), and `npm run build -- --webpack` passed. Auth smoke exercised actual interactive bootstrap, second-owner refusal, anonymous401/customer403/pre-MFA428, verified owner200, TOTP signin challenge and deactivation/session revocation. Notification smoke exercised durable failure/backoff/retry/one delivery. `db:restore-check` successfully restored an isolated temporary database and checked catalog/order/commitment/refund/outbox counts.

V-01/02: fixture and catalog editor tests. V-03 and delayed-paid-stock case: real concurrent allocation tests. V-04–07: server event, duplicate/out-of-order/late event and retry tests; no real provider involved. V-08/09: COD funding/delivery failure/RTO/remittance tests, all enabled locally. V-10–12: partial discount allocations, concurrent refund caps/unknown outcome, exact freed units and quarantine tests. V-13/14: owner/customer/guest boundary and challenge recovery tests. V-15: mobile and keyboard checkout browser flow. V-16: dump/restore exercise. V-17: local notification retry plus modeled integration exceptions; real-channel outage behavior remains unverified. V-18: money/repricing/idempotency tests, including HTTP replay after cart clearing. V-19: auth/audit/source controls and role boundary tests; no native upload feature, no production security certification.

Browser artifacts under `artifacts/` include mobile storefront, selected SKU, cart, checkout, tracking, account history, charger specifications, owner catalog/inventory/order details/returns/refunds/COD. Browser tests verify actual inventory mutation and owner content/discount persistence, not just screenshots. No physical mobile device or full assistive-technology audit was run. Performance targets are proposed and not measured production SLOs.

Local application and local verification must remain distinct from unverified real-provider sandbox, undeployed production and blocked commercial readiness. Remaining release work includes real provider authentication/verification/refund/settlement proof, approved rates/coverage/restrictions and policies, real notification/password-reset/recovery delivery, native upload pipeline if desired, production monitoring/backups/incident ownership and tax/invoice review. Owner-only release does not depend on staff roles. See README for reproducible commands and fixture safeguards.

Final additions include owner method/delivery settings and customer support notes, plain-text transactional notification templates, explicit Asia/Dhaka admin timestamps, price/brand/availability filters, and immutable spec/compatibility/policy snapshots. A regression test changes the live catalog and policy after checkout and verifies historical snapshots remain intact. Browser fixture stock is replenished only for the exact fictional seed products through audited receipt commands. Dependency audit after compatible lint-tool fixes reports zero known vulnerabilities; this does not replace production security review.
