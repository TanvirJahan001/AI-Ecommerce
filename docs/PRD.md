# PRD — Mobile Accessories Store

**Purpose:** authoritative product purpose, scope, priorities, and business requirements. **Status:** implemented local scope with focused verification; commercial readiness remains blocked. **Updated:** 2026-11-14. **Related:** [USERS](USERS.md) · [DATA](DATA.md) · [API](API.md) · [SECURITY](SECURITY.md) · [DELIVERY](DELIVERY.md) · [Architecture](Architecture.md) · [Design](Design.md) · [Phases](Phases.md) · [Memory](Memory.md) · [Rules](Rules.md).

## Product and outcome

Mobile Accessories Store is a single-merchant, Bangladesh-only online shop for customers to discover phone accessories, verify device fit and product specifications, place transparent BDT orders as guests, pay through an approved online method or an owner-enabled COD flow, and track delivery and after-sale requests. Its protected operations workspace gives the authorized owner one consistent view of catalog, stock, orders, payment exceptions, shipments, returns, and settlements. The product should reduce uncertainty about compatibility, total cost, stock, and order progress.

**Problem/outcome.** Accessory listings often leave customers unsure whether an item fits their exact model or supports their charging needs. Customers need accurate, structured facts and clear order outcomes; the owner needs auditable stock and fulfillment controls without a marketplace-scale system.

## Audience, goals, and boundaries

Bangladesh residents purchasing in BDT; owner and a small future operations team. Initial stock location: one. Customer-facing time/reporting: Asia/Dhaka; stored instants UTC. Mobile-first responsive web. Guest checkout required. One protected owner identity; staff roles later.

Goals: correct variant/model fit; server-calculated totals; no overselling; safely verified payment; traceable COD and courier cash; recoverable customer support. Success measures (definitions): placed order count by created time; gross order value = sum item line totals before delivery/discount adjustments (report components separately); net merchandise sales = accepted delivered orders’ merchandise less allocated discounts and approved merchandise refunds; successful online collections = provider-verified captured amounts; COD receivable = COD due for delivered/collected shipments not yet remitted; courier remittance = recorded cash received matched to shipments; estimated margin = net merchandise sales less recorded unit cost and allocated variable costs, explicitly incomplete until costs are maintained. No numerical targets until baseline and owner target exist.

Non-goals: marketplace, international shipping/currencies, native apps, subscriptions, loyalty, AI recommendations, multiwarehouse, full accounting, microservices. Later expansion must not make these launch dependencies.

## Prioritized requirements

P0 = commercial-launch requirement; P1 = useful after launch; P2 = later growth. Acceptance IDs map to [DELIVERY](DELIVERY.md); phases to [Phases](Phases.md). Each P0 names user, need, behavior, and observable condition.

| ID / priority | User and need → required behavior                                                                                    | Acceptance condition                                                                                                                                    | Phase |
| ------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| CAT-01 P0     | Shopper needs trustworthy discovery → searchable published catalog with category, brand, price, availability filters | Published items only; filters/sort preserve valid results and show empty state                                                                          | 1     |
| CAT-02 P0     | Shopper needs exact fit/spec → variant-specific device compatibility and structured charger specs                    | Selected case SKU alone determines compatible models; charger protocol/power/connector shown as distinct facts                                          | 1     |
| INV-01 P0     | Owner needs accurate stock → variant ledger, receiving, adjustment reasons, atomic allocation                        | Concurrent final-unit checkout allows at most one active allocation                                                                                     | 1/2   |
| CART-01 P0    | Shopper needs useful basket → server-priced variant quantities and delivery quote                                    | Invalid/unavailable SKU rejected; displayed total reconciles to checkout                                                                                | 1/2   |
| ORD-01 P0     | Shopper needs purchase without account → guest checkout and private order access                                     | Order created once; access requires an unexpired shopping-session order grant or authenticated customer ownership; recovery requires an email challenge | 2     |
| PAY-01 P0     | Buyer/owner needs reliable online payment → provider adapter, verification, retry and reconciliation                 | Only verified matching amount/currency/order marks paid; redirect/screenshot cannot                                                                     | 2     |
| COD-01 P0     | Buyer/owner needs COD where approved → explicit COD checkout and confirmation policy                                 | COD order proceeds without online attempt; owner enables method/coverage; confirmation recorded                                                         | 2     |
| FUL-01 P0     | Owner needs delivery visibility → shipment, tracking, failed delivery and return-to-origin flow                      | Dispatch and delivery do not imply courier remittance; failed delivery has recovery path                                                                | 2     |
| REF-01 P0     | Buyer/owner need fair after-sales handling → cancellation, return inspection, partial/full refund, warranty case     | Refund authorization and outcome recorded; inspected goods only return to sellable stock                                                                | 2     |
| ADM-01 P0     | Owner needs safe operations → protected overview, catalog/stock/orders/payment/shipping/support/settings             | Permission enforced server-side; privileged changes auditable                                                                                           | 2     |
| POL-01 P0     | Shopper needs clear terms → contact, privacy, shipping, returns, warranty pages                                      | Checkout links current owner-approved policies and snapshots relevant version                                                                           | 2     |
| ACC-01 P0     | All users need usable interface → mobile, keyboard, errors and accessible controls                                   | DELIVERY V-15 checks keyboard/mobile checkout and accessibility                                                                                         | 1-2   |
| ACC-02 P1     | Returning buyer needs history → account/order history and secure guest-order linking                                 | Link only after ownership verification; prior phone number alone insufficient                                                                           | 3     |
| DISC-01 P1    | Owner needs basic campaigns → fixed BDT discounts with limits; percentage discounts outstanding                      | Server validates dates, scope, usage and total; redemption is atomic                                                                                    | 3     |
| OPS-01 P1     | Owner needs routine efficiency → exports, notifications, basic reports, editable content                             | Authorized export and delivery failure visibility                                                                                                       | 3     |
| GROW-01 P2    | Business needs measured retention → improve UX/campaigns from evidence                                               | Only after baseline; no advanced recommendation dependency                                                                                              | 4     |

## Commerce rules

Prices are BDT integer minor units (poisha), no floating-point arithmetic. Checkout reprices current catalog, eligible discount, delivery quote, and tax only if configured after professional review. A price change requires customer reconfirmation. Delivery fee and coverage are explicitly quoted before order placement; no delivery promise or rate is assumed. Discounts are server validated, atomically redeemed, and snapshots stored. Variant-level stock is authoritative. Online payment checkout reserves available stock with expiry; COD uses its own owner-defined confirmation and reservation policy and is never expired by an online payment timer. Cancellation depends on state and release/refund side effects. Return eligibility, return period, warranty scope/period/provider, and refund rules are owner decisions, published before launch. Return inspection precedes restock. Refunds may be partial; COD refund follows a separately recorded bank/mobile financial service/manual payout workflow, not an assumed gateway reversal. Courier delivery is not proof of remittance.

High-level lifecycle: publish product → discover compatible variant → cart → quote/checkout → order and stock allocation → online verification or COD confirmation → prepare → dispatch → delivery / failed delivery and recovery → support → return inspection / refund / warranty resolution → settlement reconciliation. Canonical separate states and transitions are in [DATA](DATA.md).

## Dependencies and blockers

Commercial launch is blocked by owner-approved catalog/spec source, authenticity claims and verification process, published cancellation/return/warranty policies, COD decision and confirmation rules, approved payment provider/account and tested merchant flow, courier/coverage and price table, tax/invoice review, business contact and language decision, production hosting/domain/secrets, and owner access. Future staff roles are not an owner-only launch prerequisite. Unknown fees/approval are not assumed. Provider evidence and official sources are in [Architecture](Architecture.md) and [Memory](Memory.md).

## Decision register

Owner is decision owner unless noted. “Open” means proposed baseline is not approval.

| ID   | Question                                         | Status                                                                                                | Owner | Detail                          |
| ---- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ----- | ------------------------------- |
| D-01 | Name, brand, logo                                | Open                                                                                                  | Owner | [Design](Design.md)             |
| D-02 | Initial catalog and sourcing/authenticity checks | Open                                                                                                  | Owner | [DATA](DATA.md)                 |
| D-03 | English, Bangla, or bilingual launch             | Open; recommend English first, Unicode-safe content and Bangla-ready fonts                            | Owner | [Design](Design.md)             |
| D-04 | Return/cancellation/warranty terms               | Open; legal/business review                                                                           | Owner | [PRD](PRD.md#commerce-rules)    |
| D-05 | Enable COD and confirmation method               | Open                                                                                                  | Owner | [USERS](USERS.md)               |
| D-06 | Online provider and merchant eligibility         | Open; bKash/SSLCOMMERZ research only                                                                  | Owner | [Architecture](Architecture.md) |
| D-07 | Courier, delivery coverage/rates, restrictions   | Open                                                                                                  | Owner | [DELIVERY](DELIVERY.md)         |
| D-08 | Tax/invoice obligations                          | Open; professional verification                                                                       | Owner | [SECURITY](SECURITY.md)         |
| D-09 | Owner assignment and future staffing             | Owner-only implemented; future staffing open                                                          | Owner | [USERS](USERS.md)               |
| D-10 | Stack and hosting                                | Confirmed Next.js/TypeScript/PostgreSQL and self-hosted Supabase DB host; intended connection pending | Owner | [Architecture](Architecture.md) |
| D-11 | Visual direction                                 | Proposed navy/teal/amber                                                                              | Owner | [Design](Design.md)             |
| D-12 | Commercial launch boundary                       | Proposed phase 2 complete                                                                             | Owner | [Phases](Phases.md)             |

## Implemented scope checkpoint — 2026-11-14

P0 local workflows and concrete P1 account/history/linking, fixed discounts, reports/CSV and content are implemented; evidence and limits are in DELIVERY/Memory. Commercial launch is not approved. Owner-only scope means no staff roster dependency. D-10 technical baseline is confirmed by the implementation request; real provider/hosting/branding/policy choices remain open. Fixed discounts are explicitly enabled before use and consume usage permanently at checkout, including later cancellation. Return/warranty eligibility is owner-reviewed until approved business terms exist. Native file uploads remain outside this local implementation; sourced URL media is supported. Phase 4 remains planned.

### Implemented report field definitions

`order_count` counts all placed records, including later cancelled orders. `placed_order_value_minor` sums their saved final totals including delivery and after discounts; it is not gross merchandise value or recognized revenue. `verified_collections_minor` sums verified online funding and customer COD collections, before refunds and independent of courier remittance. `completed_refunds_minor` sums only succeeded refunds. `courier_remittances_minor` sums recorded remittance batches. `cod_unremitted_minor` is verified customer cash collected minus matched courier remittance allocations. Estimated margin is not calculated because cost completeness is unverified. No report should label receivables or order value as money already received by the business.

## Workflow refinement acceptance — 2026-11-14

A1–A11 in DELIVERY apply to this refinement: cancellation refunds without returns; late-funding reconciliation; ordinary typed catalog/media controls; searchable inventory; exact BDT entry; selected-order context and after-sales/COD actions; readable customer specs/history/access; consistent current documentation. No legal entitlement or policy duration was added. A paid unshipped order must be explicitly cancelled before its refund is approved; delivered-item refunds follow received/inspected eligibility.

Percentage discounts remain an unmet P1 requirement from DISC-01, not an executable feature or an implicitly approved deferral. Native upload/hosted storage remain unimplemented and explicitly excluded from this refinement. Staff permissions, production adapters and commercial prerequisites are separate from owner-only local use. No staff roster is a launch dependency for owner-only operation.
