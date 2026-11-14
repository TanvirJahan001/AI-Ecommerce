# Mobile Accessories Store

A local Bangladesh accessories shop using Next.js 16.4.6, React 19.3.1, TypeScript, PostgreSQL 18, Better Auth 1.7.23 and integer BDT amounts. The storefront and owner console use persistent PostgreSQL workflows. Payment and notification transports are explicitly local test adapters. Commercial checkout is disabled in production.

## Reproduce local development

Requirements: Node.js 24 LTS, npm, Linux/macOS supported by embedded-postgres (or your own PostgreSQL 18). The lockfile pins dependencies. This execution used Node 24.22.3 and PostgreSQL 18.6. For a commercial environment use supported patched versions and reviewed configuration.

```bash
npm ci --legacy-peer-deps
npm run setup:local
npm run db:local
```

Keep the database command running in its terminal. Its default directory `.local-data/postgres` is ignored by Git and persists between starts. `LOCAL_PG_DIR` overrides it. For an existing PostgreSQL instance, skip `db:local` and set `DATABASE_URL` in `.env.local`. `setup:local` never overwrites an existing file; it creates a random auth secret and fictional-development configuration. Do not copy these test credentials to production.

In another terminal:

```bash
npm run db:migrate
npm run auth:migrate
npm run db:seed
npm run dev -- --webpack
```

Open http://localhost:3000. Seed products, prices, shipping charges, device names and specs are fictional. The development seed enables COD and the development payment adapter. It does not invent merchant, courier or warranty promises. The shipping fixture covers Dhaka; other destinations are rejected until configured.

## Owner setup and operation

```bash
OWNER_BOOTSTRAP_ENABLED=true npm run owner:bootstrap
```

The bootstrap requires an interactive terminal, reads the password without echo, refuses a second owner, and sends nothing externally. No default owner/password ships. Sign in at `/login`, enroll TOTP using your authenticator and save the library-issued recovery codes privately. Owner API access is blocked until MFA enrollment and a verified session. Keep `OWNER_BOOTSTRAP_ENABLED=false` during normal use. Customer signup never grants owner access; no staff roles are enabled. Deactivation support is implemented as a server helper, not exposed as an unaudited public action.

Routes: `/`, `/products/[slug]`, `/cart`, `/checkout`, `/orders/[id]`, `/account`, `/recover`, `/help`, `/policies/[slug]`, `/login`, `/admin`. APIs: `/api/store`, `/api/auth/*`, `/api/auth/identity`, `/api/health`, owner CSV export `/api/admin/export`. All sensitive data queries and commands enforce server-side access; UI hiding is supplementary.

Owner console: draft/publish catalog, SKU fit/spec/source/media editing, inventory receipts/adjustments, order details, COD confirmation, dispatch and delivery updates, cancellation, returns/inspection, refund commitments/payout reconciliation, warranty resolution, cash collection/remittance, fixed discounts, content, reports/CSV, support notes, settings, audit and notification queues/templates. Money form fields marked poisha use BDT 1 = 100 poisha. Operations with IDs list those IDs in the related tables. Publish a new SKU only after entering sourced specifications/fit. Receipt/adjustment quantities require a reason. A return enters quarantine; only sellable inspection restocks it. Mark a refund successful only with actual payout evidence; unknown outcomes retain capacity.

## Local transports and recovery

Online checkout creates a persistent pending attempt. Order tracking exposes simulation controls only with `STORE_DEV_ADAPTERS=true` in development; they generate local test events and never move money. Success after expiry/cancellation enters reconciliation. COD confirmation does not require online payment. Customer cash collection and courier remittance remain distinct. Production does not expose payment simulation or commercial checkout.

```bash
npm run notifications:run
```

This processes one batch of durable outbox jobs into the owner-only local delivery sink. `LOCAL_NOTIFICATION_FAIL=true` simulates failure with backoff; run again when retry is due. No real email/SMS is sent. `/recover` challenges must match the order email; local proof is available only in the owner test sink. Codes expire and attempts are limited. Recovery revokes earlier grants. A phone number or email match alone never grants access. Anonymous shopping credentials are hashed in storage and issued through HttpOnly, SameSite cookies, with 30-day grants; cookie persistence supports browser closure. Customer linking requires existing order proof. Production recovery/password-reset delivery requires an approved real channel.

## Verification

With the local server and database running:

```bash
npm run lint
npm run typecheck
npm test
TEST_DATABASE_URL=postgresql://store:local-development-only@127.0.0.1:55432/mobile_store npm run test:db
npm run test:notifications
npm run test:prepare-owner
npm run test:auth
npm run test:e2e
npm run build -- --webpack
```

`test:db` creates and drops isolated schemas in the supplied real PostgreSQL database. Use test/development data only. `test:prepare-owner` creates a fictional owner only if no owner exists and saves private credentials under `/tmp` for automation; it refuses to replace an existing owner. `test:auth` uses that fixture, exercises MFA and deactivation, and saves private browser state. Do not run these fixture scripts against a real owner's store. Browser tests require system Chrome at `/opt/google/chrome/chrome` (override config for your installed browser); authenticated tests use `/tmp/store-owner-state.json`. Tests create fictional orders/content/discounts in the local app database. Start from an isolated development database for a clean run.

Backup verification needs `pg_dump` and `pg_restore` from PostgreSQL 18 on your machine:

```bash
PG_BIN_DIR=/path/to/postgresql/18/bin npm run db:restore-check
```

It dumps the local database, restores into a temporary database, checks record counts, and deletes the temporary database/archive. The embedded server package does not contain these client utilities. Production backups, retention, encryption, scheduling, RPO/RTO, and off-machine storage remain deployment responsibilities.

Actual evidence: unit tests, 19 PostgreSQL tests, authentication smoke, notification failure/retry, seven browser workflows, and isolated restoration were run. Screenshots are under `artifacts/`; HTML browser evidence under `artifacts/playwright-report/`. Read `docs/DELIVERY.md` and `docs/Memory.md` for the final verification checkpoint.

## Remaining release prerequisites

No real payment provider or courier account has been connected or verified. Manual courier tracking is implemented. Production needs approved policies/contact/branding/language, delivery rates/coverage and battery acceptance, tax/invoice review, merchant onboarding and sandbox proof, verified production payment adapter, real transactional/recovery delivery, hosting/TLS/secrets, monitoring/backup operations and a release decision. Return/warranty policy eligibility is reviewed manually by the owner; no unapproved time promise is encoded. Native uploads are not implemented; media uses sourced HTTPS/local image URLs with alt text. Phase 4 growth remains planned. Staff roles remain disabled.

The initial empty `.git` directory required approved access; a local Git repository is now initialized. No remote, push, purchase, real message/payment or deployment was performed. In this session the downloaded Node runtime/dependencies and test database were isolated under `/tmp`; the repository contains the lockfile and reproduction scripts, not those temporary binaries.
