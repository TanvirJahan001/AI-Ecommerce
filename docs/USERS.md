# Users, Permissions, and Journeys

**Purpose:** authoritative actor, permission intent, journey, and screen needs. **Status:** proposed. **Updated:** 2026-11-14. **Related:** [PRD](PRD.md) · [DATA](DATA.md) · [API](API.md) · [SECURITY](SECURITY.md) · [Design](Design.md) · [Phases](Phases.md).

## Actors and permission intent

Guest shopper discovers and purchases without an account. Registered customer manages verified profile, addresses and own orders. Owner controls all store operations. Catalog staff maintain products/specifications; fulfillment staff allocate/ship/track; support staff handle customer requests; finance staff inspect payments/refunds/settlements. Initially only owner is provisioned; staff roles are proposed and least-privilege.

| Capability                   |             Guest |    Customer |     Owner |         Catalog |              Fulfillment |             Support |                      Finance |
| ---------------------------- | ----------------: | ----------: | --------: | --------------: | -----------------------: | ------------------: | ---------------------------: |
| Public catalog/cart/checkout |               Yes |         Yes |       Yes |             Yes |                      Yes |                 Yes |                          Yes |
| Own order view/request       |      secure token |    own only |       all |              No | assigned/all operational |       support scope |              financial scope |
| Customer PII                 | own checkout only |         own |       all |              No |  minimum shipping fields |       support scope |               minimum needed |
| Catalog publish/spec         |                No |          No |       Yes |             Yes |                       No |                  No |                           No |
| Stock receive/adjust         |                No |          No |       Yes | limited receive |         receive/allocate |                  No |                         read |
| Dispatch/tracking            |                No |          No |       Yes |              No |                      Yes | read/update support |                         read |
| Refund request               |       own request | own request | authorize |              No |                       No |             request | authorize/execute per policy |
| COD settlement               |                No |          No |       Yes |              No |        record collection |                  No |                    reconcile |
| Roles/settings/audit         |                No |          No |       Yes |              No |                       No |                  No |                           No |

Effective permission scope, ownership, and authorization enforcement are specified in [SECURITY](SECURITY.md). High-risk refund or stock adjustment should require an explicit reason and audit record; whether second-person approval is needed is open.

## Navigation and screens

Customer: Home → category/search → product detail → cart → checkout → payment result/order confirmation → secure tracking; help pages; optional account → order history, return/warranty request. Admin: Overview → Catalog (products/categories/brands/media/variants/compatibility) → Inventory → Orders → Payments/refunds → Shipments/COD settlements → Customers/support → Returns/warranty → Reports/exports → Content/policies → Settings/users/audit.

Functional screen needs: category/search exposes useful filters, sort, availability, result count and empty recovery; product detail exposes exact SKU fit/spec, price, stock and policy; checkout collects recipient, normalized Bangladesh phone, structured address and delivery instructions, displays delivery cost and final amount, terms and payment choice; order view exposes only safe status and next action; admin work queues prioritize overdue exceptions, with actor, timestamp, amount and history. Detailed layout and UI states belong in [Design](Design.md).

## Journeys

1. **Find compatible case:** search/select device brand and exact model → see only compatible variant choices → choose color/SKU → confirm fit and availability → cart. If ambiguous model, ask shopper to verify model number; never infer fit from family name.
2. **Compare chargers:** compare connector, protocol(s), maximum supported output and included cable separately → understand device/cable/charger negotiation dependency → choose variant. Never infer watts or protocol from connector alone.
3. **Guest buy:** cart → server quote → enter name, Bangladesh phone, district/city/area/street and optional landmark → choose delivery/payment → review totals/policy → submit once → confirmation provides secure access credential; phone is contact data, not verified identity.
4. **COD:** select only if owner-enabled and address eligible → apply configured confirmation rule (manual call/OTP/provider-supported method to be decided) → create COD order without online payment → reserve according to COD policy → prepare and track; no online timer cancellation.
5. **Online payment:** server creates order/reservation and provider attempt → customer follows hosted/provider flow → backend verifies provider result → confirmation even if customer closes browser. Redirect is informational only.
6. **Decline/interruption:** show pending or failed distinctly → allow safe retry against same order or a new attempt per API rules → never double charge or release a paid order silently → reconciliation queue for ambiguous status.
7. **Track:** enter expiring secure link or prove control via configured phone challenge → see fulfillment/delivery state and safe tracking number; no internal notes or payment secrets.
8. **Cancel/return:** request with order item/reason → eligibility and state checked → staff decision and next steps shown → refund/stock outcome follows separate states.
9. **Warranty:** select eligible item, describe fault and evidence → case ID/status and policy terms → staff resolution; warranty eligibility terms are owner-set.
10. **Receive/publish:** staff record supplier/reference and quantities/cost → stock movement; catalog staff create family and SKU, structured specifications, variant-specific compatibility, images → review → publish.
11. **Prepare/dispatch:** fulfillment queue → validate allocation and address → pack → create shipment/manual courier reference → dispatch event → customer notification; capture delivery evidence according to operating policy.
12. **Failed delivery:** record attempts/reason → contact customer, arrange retry or return-to-origin → preserve stock allocation until physical return/inspection; resolve or cancel/refund per policy.
13. **COD reconcile:** record courier-collected amount and shipment → later record remittance batch/reference/amount/date → match expected and received amounts → exception for short/late remittance; delivered status alone does not settle receivable.
14. **Failed refund:** record requested/attempted/failed/pending separately → alert finance → retry only when provider or payout channel confirms safe → manual reconciliation and customer update.

## User-facing recovery requirements

Preserve cart on transient errors; explain stock/price change and request renewed confirmation; prevent duplicate submit; show payment pending as pending; provide retry/support reference; make unavailable delivery method understandable; distinguish shipment delivery from payment/settlement; provide accessible validation by field; protect order access on shared devices; allow support fallback without exposing other customer records. Guest ownership verification and account linking must follow [SECURITY](SECURITY.md).

## Canonical authorization contract (R5–R6)

Canonical identifiers are `store_owner`, `catalog_manager`, `fulfillment_operator`, `support_agent`, and `finance_operator`. Customer account ownership and guest order proof are actor contexts, not staff roles. Only `store_owner` is provisioned initially; unimplemented roles cannot authenticate or invoke privileged operations.

| Role                   | Exact allowed operational actions                                                                                                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `store_owner`          | All store operations, role/config changes, stock receipt and adjustment, cancellation decisions, refund approve/execute/reconcile, financial exports, audit access.                                                                                                                  |
| `catalog_manager`      | Create/edit/publish catalog, specs, compatibility and media; no stock balance change, customer financial data, order/refund, or settlement actions.                                                                                                                                  |
| `fulfillment_operator` | Receive stock against a receipt (increase physical stock with source), view minimum shipment address fields, allocate/pick/pack/dispatch, record delivery and COD cash collection, receive and inspect returns. No arbitrary stock adjustment, refund approval, or financial export. |
| `support_agent`        | View necessary customer/order status and contact fields, record notes, request cancellation/return, approve/reject these within published policy if enabled; no stock movement, payout, role, or sensitive export.                                                                   |
| `finance_operator`     | View payment/funding/refund/settlement data, approve/submit/reconcile refunds, record courier remittance and reconciliation; no catalog publication, shipment mutation, stock receipt/adjustment, or role management.                                                                |

Permissions are enforced on server operations and object scope, not just navigation. Shipment viewing is separate from shipment mutation; refund request is separate from approve/submit/reconcile; stock receipt is separate from adjustment; report viewing is separate from exporting row-level PII/financial detail. Sensitive export remains owner-only in the initial configuration.

## Complete guest access behavior

The guest gets an anonymous shopping session and, at order confirmation, a one-time opaque high-entropy credential stored only as a hash server-side. Credential is returned over TLS once and bound to an HttpOnly same-device cookie; a secure link may also be delivered through configured email/SMS. It permits redacted tracking and limited cancel/return requests only. It expires, can be revoked, and must be rate-limited. A new device or expired link requires verified phone OTP plus order reference; if OTP transport is not configured, owner-assisted recovery requires independent evidence and support does not reveal order details based on delivery phone. Lost-device recovery revokes prior credentials. Details and local mail-sink behavior are defined in [API](API.md).

## Implemented actor scope — 2026-11-14

Only `owner`, authenticated `customer`, and guest proof holders have executable permissions. The earlier staff columns describe future intent and confer no runtime access. Owner receipt/adjustment, shipment edit, refund approve/submit/reconcile, reports and CSV export all require active owner identity plus MFA. Customer/guest proof permits only own order reads/requests/linking. Registered ownership comes from customers.auth_subject and orders.customer_id. Guest ownership comes from the hashed shopping credential and unexpired order grant. Email/phone similarity never links orders. Initial recovery uses the order email challenge and a local test sink as detailed in API, replacing the earlier unselected phone-challenge proposal.
