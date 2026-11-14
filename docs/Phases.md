# Implementation Roadmap

**Purpose:** authoritative sequence, dependencies and milestones. **Status:** Phases1–3 local implementation; external/commercial gates open; Phase4 planned. **Updated:** 2026-11-14. **Related:** [PRD](PRD.md) · [Architecture](Architecture.md) · [Design](Design.md) · [DELIVERY](DELIVERY.md) · [Memory](Memory.md).

## Phase 1 — Foundation, catalog, compatibility, inventory, storefront

**Outcome:** owner can maintain accurate initial catalog and shoppers can discover compatible available items. **Includes:** CAT-01/02, initial INV-01 ledger/receipts, storefront foundations, ACC-01 accessibility baseline. **Prerequisites:** owner approves sample catalog/specification validation and stack/hosting direction. **Tasks:** repo/app setup → environment and migrations → auth/admin shell → category/brand/product/SKU/spec schema → compatibility per SKU → stock ledger/receipt and atomic availability → image pipeline → public catalog/search/filter/PDP → mobile/accessibility review. **Deliverables:** deployable non-commercial catalog and admin; no checkout promise. **Refs:** A-01/A-02; Design catalog/admin screens. **Entry:** docs accepted and provider-independent environment selected. **Exit:** catalog/schema evidence, V-01/02/15; DELIVERY V-19 applicable. **Decision:** exact category, authenticity/spec sourcing. See [DELIVERY](DELIVERY.md).

## Phase 2 — Commercial workflow

**Outcome:** support commercial operation only after order, money, fulfillment and recovery controls work. **Includes:** CART-01, ORD-01, PAY-01, COD-01 if owner enables it, FUL-01, REF-01, ADM-01, POL-01 and remaining P0. **Tasks:** transaction-safe cart/quote → checkout snapshots/reservation → guest access proof → payment adapter and provider sandbox proof → COD confirmation/policy separate → admin order queues → shipment/manual courier and tracking → cancellation/return inspection/refund flows → COD collection/settlement reconciliation → policies/notifications → monitoring/backup/restore and release rehearsal. **Prerequisites/blockers:** merchant eligibility, provider sandbox/live verification, courier coverage/rates/address/COD and battery restrictions, owner terms/COD, tax/legal review, MFA, hosting and support ownership. **Entry:** Phase 1 exit. **Exit:** DELIVERY V-03–19 and release gate; all exceptions rehearsed; external capabilities proven. This is first commercial phase.

## Phase 3 — Operational efficiency and customer experience

**Outcome:** reduce manual workload and improve repeat-customer support. **Includes:** ACC-02, DISC-01, OPS-01, account order history, controlled discounts, exports/reports, notification automation and content editing. **Tasks:** account identity/link verification → safe history → discounts and concurrency limits → reports/exports → notification retries/templates → operational feedback. **Dependencies:** stable Phase 2 data and baseline; owner policy on account, discounts and retention. **Exit:** DELIVERY V-17–19 plus feature-specific tests; no unresolved P0 exception.

## Phase 4 — Measured growth and retention

**Outcome:** invest only where measured demand supports it. **Includes:** GROW-01; possible richer search, promotions, analytics, additional locations/provider automation. **Tasks:** define metric baseline → test one improvement → measure guardrails → retain/revert. **Dependencies:** sufficient trustworthy event/financial data and owner approval. **Exit:** metric evidence and privacy/security review. No deadline/estimate assumed.

First small independent implementation task: create catalog schema for Product, Variant and DeviceModel/Compatibility with a fictional two-case fixture and assert SKU-scoped compatibility (V-01). Implementation is authorized by the subsequent implementation specification.

## Reconciled gates (R7–R8)

Phase 1 exit requires catalog accessibility evidence only; checkout/mobile evidence V-15 is a Phase 2 exit requirement. COD is configurable and disabled by default until owner decision/configuration; COD acceptance tests run when enabled, otherwise verify the UI/API refuses COD and mark cash workflow tests not applicable for that documented configuration. Discounts are Phase 3: until enabled, checkout rejects discount-code input as unsupported and computes zero discount. Phase 2 includes essential transactional messages and failure visibility through durable outbox and local development mail sink; Phase 3 may add templates/campaign conveniences. Local implementation, sandbox proof and commercial-launch dependencies are separate as classified in [DELIVERY](DELIVERY.md); provider credentials, branding, courier account, and future staffing do not block independent local catalog/auth/workflow development. Owner-only initial use requires no staff roster.

## Actual milestone state — 2026-11-14

Phase1 catalog/inventory/storefront and Phase2 provider-independent commerce are implemented with local verification. Sandbox and commercial gates remain open; Phase2 is not an approved commercial release. Concrete Phase3 accounts, secure links, fixed discounts, reports/CSV, content and notification operations are implemented and locally tested. Staff remain excluded. Phase4 remains planned without invented growth campaigns. No phase is marked deployed. Next executable step: review production requirements in DELIVERY and select/verify the real payment and transactional/recovery adapters; independent local refinement can continue without those credentials.
