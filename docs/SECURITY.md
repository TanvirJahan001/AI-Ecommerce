# Security and Privacy Requirements

**Purpose:** authoritative threat controls, privacy and security requirements. **Status:** proposed. **Updated:** 2026-11-14. **Related:** [USERS](USERS.md) permission intent · [DATA](DATA.md) ownership · [API](API.md) contracts · [DELIVERY](DELIVERY.md) recovery · [Architecture](Architecture.md).

## Threat model and controls

Assets: money, stock, customer contact/address/order history, credentials, merchant secrets, catalog integrity, audit evidence. Adversaries: unauthenticated scraper/fraudster, malicious customer, compromised staff/owner, replayed/forged webhook, leaked secret, vulnerable dependency. Trust boundaries: browser↔server, server↔database, provider/courier webhooks, admin roles, storage/backup.

- Authentication: established auth provider or secure framework implementation selected during Phase 1; secure, HttpOnly, SameSite cookies, TLS, rotation/revocation, recovery with rate limits and verified channel. Admin MFA required before operational launch; recovery codes controlled and audited.
- Authorization: deny by default; enforce role and object ownership on every server operation, never rely on hidden UI. Customer queries scope by authenticated identity; guest order uses high-entropy opaque token stored hashed, expiry/revocation, or phone challenge. Phone used for delivery is not account proof. Linking guest order requires fresh ownership verification and audit.
- Staff: users/permissions per [USERS](USERS.md); least privilege, disable accounts and revoke sessions promptly. Refund, stock adjustment, role changes require reason and audit; owner-only role management. Apply dual approval to high-value refunds if owner sets threshold.
- Validation: schema-validate all inputs; canonical server price/stock/discount/delivery; parameterized queries; output encoding and CSRF defenses for cookie mutations.
- Payments/webhooks: TLS; authenticate signatures/tokens exactly as selected provider specifies; verify transaction server-to-server, amount, currency, merchant/order binding; timestamp/replay window and unique event key; idempotent state transitions. Redirect/screenshots never prove payment. Unknown event enters reconciliation.
- Integrity: atomic stock allocation; refund cap; append-only movements; idempotency; separate delivery and settlement; step-up confirmation for sensitive actions.
- Session/account: short idle/admin session as practical, secure cookies, CSRF defenses, MFA, reauthentication for payout/role changes; deactivation revokes all sessions/API tokens.
- Abuse: rate-limit login, recovery, guest lookup, checkout, coupon, payment retries and public search; generic auth errors; bot controls proportionate to abuse evidence; monitor spikes.
- Upload/content: allowlist image formats and size, inspect/re-encode, strip metadata, randomized object keys, no executable public uploads; sanitize admin-authored rich text and apply CSP.
- Secrets: server-only secret manager/environment injection; never `NEXT_PUBLIC` or logs/repository; rotate after exposure; separate credentials per environment.

## Privacy, logs and recovery

Collect only checkout/support fields needed; restrict staff visibility. Do not collect/store card security codes, wallet PINs, payment OTPs, or raw credentials. Logs may contain request ID, actor ID, entity IDs, event type, timestamp, outcome, masked phone and bounded error category. Exclude access tokens, session cookies, full phone/address, payment credentials, webhook secrets/signatures, raw provider payloads with PII. Audit events record actor/action/object/reason and before/after safe fields; restrict and retain with integrity controls.

Provide a documented channel for access/correction/deletion requests; verify requester, assess record obligations with local counsel, delete/anonymize eligible profile data while preserving records only as justified. No legal retention period or tax duty assumed. Before launch, owner obtains Bangladesh advice on applicable commerce, consumer, privacy, invoicing and tax duties. The National Digital Commerce Policy 2018 is an official policy source, not a complete current legal opinion: https://brcp-1.gov.bd/wp-content/uploads/2022/03/National-Digital-Commerce-Policy-2018_10-03-2022.pdf (accessed 2026-11-14).

Backup encryption, least-privilege access and restore verification are in [DELIVERY](DELIVERY.md). Dev/test/prod databases and credentials isolated; sandbox transactions use non-production endpoints/test data; no production PII in dev. Security incidents: revoke secrets/sessions, preserve evidence, assess exposure, notify owner and follow counsel-approved response. Never claim legal compliance without review.

## Canonical roles and guest credential controls (R5–R6)

Use only `store_owner`, `catalog_manager`, `fulfillment_operator`, `support_agent`, and `finance_operator`; customer ownership and guest proof are separate contexts. Initially only owner role is provisioned. Permission matrix and exact action boundaries are authoritative in [USERS](USERS.md); role references such as generic “inventory” or “report” are not valid grants. Sensitive exports remain owner-only until a narrower capability is explicitly implemented and tested.

Guest access uses 256-bit cryptographically secure random credentials, hash-only persistence, one-time disclosure over TLS, HttpOnly/Secure/SameSite cookie for same-device recovery, limited scope, expiry and revocation. Never put tokens in logs, analytics, referrers, or ordinary URL query logs. A delivery phone number alone cannot authorize order disclosure. New-device/expiry recovery requires verified OTP and order reference with throttling; if real OTP transport is unavailable, use owner-assisted independent verification, not phone-only support. Local test transport must be visibly development-only and never enabled in production. Deactivation/recovery revokes prior tokens and sessions.

## Implemented controls and boundaries — 2026-11-14

Better Auth 1.7.23 owns password hashing, sessions, TOTP and backup codes; public signup produces customer access only. Owner bootstrap is interactive and refuses a second owner; owner API access requires active identity and MFA enrollment. Server helpers enforce role, current deactivation state and exact origin. Auth smoke exercised challenges and session revocation. Cookie ownership, hashed guest grants, limited local recovery challenges and account linking follow API. PostgreSQL transaction locks/idempotency enforce stock/refund integrity; browser inputs never set prices or funding. No card/PIN/payment OTP handling exists.

Production guards remove simulated payment and local recovery transport; commercial checkout remains disabled. URL media editing validates source/alt and URL forms; native upload scanning/storage is not implemented. Public content renders as escaped text. CSV export excludes contact/address fields and records audit. Actual production proxy rate controls, real reset/recovery delivery, backup encryption/retention, monitoring and legal review remain release prerequisites. Local smoke evidence is not a production security certification.
