# Users, Permissions, and Journeys

**Purpose:** authoritative actors, functional needs and permission intent. **Status:** current local implementation contract; real-provider and commercial release gates remain open. **Updated:** 2026-11-14. **Related:** [PRD](PRD.md) · [DATA](DATA.md) · [API](API.md) · [SECURITY](SECURITY.md) · [Design](Design.md) · [Phases](Phases.md)

## Executable actors and permissions

The account role identifiers are `owner` and `customer` in store_access. “Store owner” is the human label for `owner`; “admin” is a route/workspace label, not another role. A guest is an anonymous shopping-session proof holder, not an account role; internal domain actor `guest` does not independently authorize HTTP access. No staff role is executable.

| Capability                                           | Guest with proof                        | Customer                      | Active owner with MFA                                   |
| ---------------------------------------------------- | --------------------------------------- | ----------------------------- | ------------------------------------------------------- |
| Public catalog/cart/local checkout                   | own shopping session                    | own shopping session          | own shopping session                                    |
| Order view, cancellation/return/warranty request     | granted order only                      | owned or granted order only   | all through owner transport                             |
| Link guest order                                     | sign in and prove order ownership first | existing proof required       | same customer-link rule                                 |
| Product/spec/media/source/publish                    | no                                      | no                            | yes                                                     |
| Stock receipt vs adjustment                          | no                                      | no                            | both, distinct commands with quantity/reason            |
| Shipment view/edit                                   | own public tracking / no edit           | own public tracking / no edit | view and allowed state transitions                      |
| Refund request vs approval/submission/reconciliation | own support request only                | own support request only      | approve, submit and reconcile verified funding          |
| COD collection/remittance, settings, content, audit  | no                                      | no                            | yes                                                     |
| Reports vs sensitive exports                         | no                                      | no                            | owner-only; export audited and excludes contact/address |

Future catalog/fulfillment/support/finance staff responsibilities are expansion ideas only. Granting them requires a separately defined permission model, enforcement and verification. Second-person approvals are an open owner policy, not an invented authority hierarchy.

## Navigation and ordinary owner work

Customer: storefront/filter → product/SKU fit and specs → cart → checkout → pending/verified payment or COD confirmation → secure tracking → requests; account/history/linking; published policies and recovery. Owner: Overview, Catalog, Inventory, Orders, Returns & refunds, COD settlements, Discounts, Content, Notifications, Audit, Reports, Settings, Customers.

Catalog search accepts name/SKU. Row/card actions open an editor with the existing stable product/variant identities; create product/add variant are separate actions. Prices are entered in BDT, models/specs via typed fields, source explicitly recorded, media via individual URL/alt/reorder/preview controls. Unknown unedited structured values are preserved. Inventory search/selection carries the SKU into receipt/adjustment and shows balances and saved history after refresh.

Orders support search/status/payment filters and a selected-order working context. Its data is fetched by an owner-scoped operation and includes only that order's items/snapshots, payments, shipments, support, returns/refunds/warranty and eligibility. Online orders do not offer COD confirmation. Reasons/evidence and identifiers flow from contextual actions, not pasted IDs. Stale transitions fail with an understandable refresh path.

## Journeys and recovery

- Find a case by exact model, choose the sellable SKU, verify its fit; sibling variants never inherit fit automatically.
- Compare a charger using connector, protocol, maximum power, V/A profiles and cable facts independently. Customer rendering uses words/units, never raw JSON/booleans.
- Buy as guest: persistent cart → server quote → contact/address → review amount/delivery/policy → checkout → session grant. COD is independent of online payment and only available when configured.
- Online: persistent attempt → local adapter event or future verified provider → status even after browser close. Failed retry is guarded; pending/unknown outcome is reviewed, not blindly charged again.
- Track with the original unexpired session or owned account. Lost/expired proof uses the order-email challenge through configured transport. A matching phone or email alone never authorizes access. Recovery revokes prior grants; restarting an expired shopping session creates no inherited grant.
- Unshipped paid cancellation: owner reviews/approves → commitment released once → verified funding refund without return. Late funds remain in reconciliation until explicit cancellation/refund decision. Delivered return: request → authorize/reject → actual receipt → inspection → stock disposition; refund outcome is independent.
- Warranty: customer/item-context request and owner review/resolution under approved terms; no automatic period or provider promise.
- Prepare/dispatch/track and failed delivery/RTO use valid shipment states. Physically received returns enter quarantine; inspection transfers sellable units or preserves damaged/unavailable goods.
- COD: choose delivered eligible order, verify actual customer collection/evidence, later match courier remittance separately. Outstanding amounts and prior matches are visible.
- Failed/unknown refunds retain capacity and require reconciliation/evidence. Notifications fail durably and retry through the outbox.

## Screen/access needs

Signed-out, expired, MFA-required and denied states name the next action without showing internal codes. Sign-in retains only safe internal intended destinations. Mobile order history uses cards with readable money/status, a short recognizable reference and optional full ID. UUIDs can appear in advanced details, not normal owner input fields. Visual behavior is authoritative in Design; enforcement is in SECURITY.
