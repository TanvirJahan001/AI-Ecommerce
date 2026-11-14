# UI/UX and Design System

**Purpose:** authoritative visual direction, layouts, components and interaction states. **Status:** current local visual system and workflows; final branding remains an owner decision. **Updated:** 2026-11-14. **Related:** [PRD](PRD.md) · [USERS](USERS.md) · [DATA](DATA.md) · [Phases](Phases.md).

## Direction and tokens

Principles: fit and specifications before persuasion; disclose full payable total; calm, trustworthy, mobile-first; operational status clarity; keyboard/accessibility by default. Brand/name unknown; temporary “Mobile Accessories Store.” Proposed palette: ink navy `#14243A`, teal `#087E8B`, action amber `#F2A900`, page `#F7F8FA`, surface `#FFFFFF`, text `#17212B`, muted `#536273`, success `#18794E`, warning `#8A5700`, danger `#B42318`, border `#D9E0E7`; check contrast for each usage. English-first local default to avoid doubling translation operations; Unicode-ready content, Bangla-capable font fallback such as Noto Sans Bengali; owner decision before launch.

Spacing 4/8/12/16/24/32/48/64 px; content max 1200 px, reading 720 px; desktop 12-column, tablet 8, mobile 4; layout breakpoints 640/768/1024/1280 px. Radius 8 px controls, 12 cards, 16 dialogs; subtle 1 px borders and low-elevation shadow; no meaning by color alone. Product images consistent square crop, neutral background, variant and packaging details; alt text describes relevant product/variant. Icons paired with labels for critical actions.

Components: ProductCard (image, title, price, variant/fit cue, stock); CompatibilitySelector (brand/model searchable, exact fit confirmation); SpecTable (units/source-aware); VariantSelector (SKU-level availability); MoneyDisplay (BDT formatted, totals components); StatusBadge (text+icon); FilterGroup; responsive DataTable; validated Field/ErrorSummary; ConfirmDialog for destructive action; Toast/inline alert; ActivityTimeline with actor/time; EmptyState with recovery action.

## Screens and states

| Screen                   | Goal, hierarchy and actions                                                                                           | Mobile, states and accessibility                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Home                     | Search/category first, featured categories, value/help links                                                          | stacked cards; loading skeleton, no catalog; labeled search                                             |
| Category/search          | query/result count, filters/sort, product grid                                                                        | filter drawer; zero-result clear filters; keyboard filter controls                                      |
| Product                  | name/price/stock, exact fit/spec, images, delivery/policy, add                                                        | sticky add action only if accessible; unavailable variant disabled with reason; loading/error retry     |
| Compatibility            | choose device brand/model then compatible SKU                                                                         | searchable list; announce results; uncertain model guidance                                             |
| Cart                     | items/qty, item subtotal, discount, delivery estimate, total                                                          | stacked rows; stock/price changes require confirmation; empty recovery                                  |
| Checkout                 | contact/address, delivery, payment, policy, total, final action                                                       | one-column, persistent summary; field errors, unavailable service, duplicate submit prevention          |
| Payment result           | pending/success/failure and next steps                                                                                | pending polling/status refresh; never imply paid until verified                                         |
| Tracking                 | order identity/status, shipment and support                                                                           | private details behind proof; failed delivery recovery; timeline announced                              |
| Account/history          | profile, verified identity, order list                                                                                | guest linking challenge; empty state; own data only                                                     |
| Returns/support/warranty | select item, policy eligibility, reason/evidence, submit                                                              | accessible request/errors; URL media only, native upload outstanding; decision/inspection/refund states |
| Admin overview           | exceptions and tasks first; sales cards clearly defined                                                               | responsive queue cards; stale/no-data states                                                            |
| Product editor           | family facts, SKU, price, media, structured specifications, per-SKU compatibility, preview/publish                    | tabs become sections; validation summary; no publish with missing required verified facts               |
| Inventory                | SKU on hand/reserved/available, receipts, adjustments/history                                                         | searchable table; confirm reasoned adjustment; discrepancy warning                                      |
| Orders/detail            | filters, state, snapshot, payment, address minimum, activity, actions                                                 | action buttons gated by permission; transition reason and confirmation                                  |
| Payments/refunds         | attempts/provider reference/matched amount, exceptions, refund lines                                                  | pending/failed distinct; retry guarded; restricted action explanation                                   |
| Shipping/COD             | shipment state/tracking, collection and remittance match                                                              | manual tracking fallback; discrepancy workflow                                                          |
| Customers                | contact, order-scoped support notes; consent/masking UI outstanding                                                   | owner-only contact access; masking not implemented                                                      |
| Returns/warranty         | queue, received/inspection disposition, refund link                                                                   | damaged/quarantine conspicuous; cannot restock before inspection                                        |
| Reports/settings         | all-time definitions/export; policies, local method/rate settings; date filters and staff/integrations UI outstanding | export audit and owner MFA; per-action reauth policy outstanding                                        |

## Interaction and accessibility

Always show loading, empty, success, validation, network failure and permission-denied states. Preserve safe form values on recoverable errors; inline errors plus summary and focus; focus trap/restore dialogs; minimum 44 px touch targets; semantic headings, labels, keyboard order, visible focus and adequate contrast. Money/date formatting follows [DATA](DATA.md). Status UI mirrors canonical states: payment pending is not success; delivered is not settled; refund pending/failed distinct; return inspection distinct from refund; incompatible/unavailable SKU cannot be selected. Price/stock changes require refreshed confirmation. COD confirmation has its own pending state. Staff actions hidden/disabled with understandable permission context, but API authorization remains authoritative. No final logo/assets claimed.

## Rendered implementation — 2026-11-14

The navy/teal direction is implemented with mobile filter/search, clear exact-SKU fit, structured specs, labeled illustrative CSS accessory images and optional sourced media URLs. English is the local default; Unicode content is supported. Owner console includes the required queues and explicit money/state forms. Screenshots in [artifacts](../artifacts/mobile-storefront.png) include mobile storefront/PDP/cart/checkout/tracking and authenticated catalog/inventory/order/returns/COD. Keyboard checkout and rendered states were browser-verified. Branding, Bangla translation workload and commercial terms remain owner decisions; these local assets make no authenticity/certification claims.

## Current refined interactions

Catalog and inventory use searchable product/SKU cards and row actions; prices are BDT decimal text, specs/fit are typed controls, and media has individual URL/alt/reorder/preview rows. Normal work requires neither JSON nor UUID input. Advanced identifiers remain available for diagnosis. Owner actions identify the completed operation and record, preserve input on recoverable errors and refresh persisted state.

Orders use searchable/filterable cards on mobile and an isolated selected-order workspace. Snapshot/history/support and after-sales actions belong only to that order. Confirm COD appears only for awaiting COD, never confirmed online orders. Cancellation, return authorization/receipt/inspection/writeoff, refund approval/submission/reconciliation and warranty decisions are distinct contextual steps. Ineligible quantities/funding and stale state have explanation/refresh actions. COD separates customer cash, unmatched balances and courier matches.

Customer specs render protocol lists as text, cable inclusion as a phrase, maximum power in W and profiles in V/A rows. No missing fact is inferred or printed as raw JSON. History cards keep money/status readable at 360/390px with a short reference and optional full ID. Access states name signin, expired session, MFA setup or denial and retain safe destinations. Actual overview metrics/exception queues are preserved; no dashboard values are fabricated.

Before/after evidence is under artifacts/refinement; additional editor/mobile captures are artifacts/refinement-after-*. Required software viewports are 360px,390px and desktop. Full physical-device/assistive-technology certification remains outside the executed checks. Native file upload is unimplemented and outside this refinement.

The overview retains persisted queue counts; loaded order/refund queues are capped at100 records. These are operational queue summaries, distinct from the all-time report totals defined in PRD. No fixture numbers are hardcoded into metrics.
