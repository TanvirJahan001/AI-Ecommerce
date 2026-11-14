# Security and Privacy

**Purpose:** authoritative enforcement, privacy and security requirements. **Status:** current local controls; outstanding production hardening is explicit. **Updated:** 2026-11-14. **Related:** [USERS](USERS.md) · [DATA](DATA.md) · [API](API.md) · [DELIVERY](DELIVERY.md) · [Architecture](Architecture.md).

## Threats and trust boundaries

Protect customer addresses/orders, owner credentials, money, stock, provider secrets and audit records from cross-customer access, hostile clients, compromised accounts, replayed provider events and unauthorized stock/refund actions. Browser→server→database, identity/account→order grants, external provider and worker/sink boundaries require explicit trust. UI visibility is not authorization.

## Current enforcement

- Better Auth owns password hashing, sessions, TOTP and recovery codes. Only owner/customer are executable account roles; internal guest actors require verified HTTP order proof. No staff permission is enabled.
- Active owner and MFA are checked server-side for every owner query/command/export. Customer queries scope by authenticated auth subject; guest queries require hashed credential and unexpired grant. Delivery phone/email similarity never links or authorizes orders.
- Owner bootstrap is interactive, refuses a second owner and exposes no default password. Deactivation helper revokes sessions and future access. Password-reset message delivery is not configured; production needs a reviewed channel.
- Guest credentials use the API's persistent HttpOnly/SameSite cookie and hashed database grant flow. Recovery matches order email then requires an expiring one-use challenge, with bounded starts/attempts; completion revokes prior grants. The current transport is development-only owner sink. Support cannot bypass proof from phone/contact knowledge. Restarting an expired anonymous session inherits no cart/order grants.
- Same-origin mutations, schema validation, parameterized SQL, server recalculation, transaction locks and idempotency protect state. Selected order data uses scoped joins; stale UI commands still revalidate. BDT entry conversion never replaces server integer/unit validation.
- Provider event processing binds provider/ref/order/amount/currency, deduplicates and preserves succeeded/reconciled funding against out-of-order failure/pending. Redirects and screenshots cannot establish payment. Development simulation and commercial checkout are disabled in production; real webhook authentication/verification remain unverified.
- Stock holds survive payment until dispatch/release. Refund reservations cap verified funding, exact eligible quantities/discount/shipping across cancellation/late-payment/return paths. Unknown payouts keep capacity. Inspection/disposition and refunds are independent. Owner reasons/evidence and command context are audited.
- Sessions/secrets stay server-only or private ignored files. Public content renders escaped plain text. URL media is validated and displayed with alt/no-referrer; native uploads/executable content/storage scanning are unimplemented and outside this refinement.
- Sign-in destinations allow only specific internal account/admin/order paths. Friendly signed-out/expired/MFA/denied screens expose no internal codes as primary text and do not weaken direct-request denial.

## Privacy, logs and operations

Collect checkout/support data only as needed. Never collect/store card security codes, mobile-wallet PINs, payment OTPs or raw credentials. Logs may contain bounded error category/SQLSTATE, request/entity/actor references and outcomes; exclude tokens, cookies, auth/TOTP/recovery secrets, full contact/address and provider credentials/raw PII payloads. Audit records contain actor/action/record/reason/evidence; access is owner-only. CSV export excludes contact/address and is audited. Avoid unnecessary sensitive data in support notes/screenshots.

Privacy requests need verified identity and a reviewed retention/deletion schedule. Preserve required business records and minimize/anonymize eligible profile data; no legal retention duration or tax duty is invented. Bangladesh commerce/consumer/privacy/invoice/tax applicability remains a commercial legal review, not a local compliance claim. Prior research source (accessed2026-11-14): https://brcp-1.gov.bd/wp-content/uploads/2022/03/National-Digital-Commerce-Policy-2018_10-03-2022.pdf .

Dev/test/prod databases/credentials must be isolated. Backups require encryption, least privilege and restore drills; local restoration evidence is in DELIVERY. Real notification/reset/recovery transport, edge abuse/rate controls beyond current auth/recovery limits, production secret rotation, off-machine backups/retention/monitoring, incident ownership and any per-action step-up policy remain release work. PII masking/consent UI, native uploads and future staff permissions must not be claimed implemented.

Owner MFA data was preserved during this refinement. Actual owner-session access and direct unauthenticated/customer denial were exercised. An intercepted MFA-required response verifies presentation only. Historical baseline enrollment/deactivation smoke remains historical evidence; it was not rerun by resetting the existing owner. Physical-device/assistive-technology and production security certification remain unverified.
