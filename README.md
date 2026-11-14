# Mobile Accessories Store

A local Bangladesh accessories shop using Next.js 16.4.6, React 19.3.1, TypeScript, PostgreSQL (verified local baseline18.6), Better Auth 1.7.23 and integer BDT amounts. The storefront and owner console use persistent PostgreSQL workflows. Payment and notification transports are explicitly local test adapters. Commercial checkout is disabled in production.

## Local Supabase PostgreSQL: prepared, target not yet connected

The owner selected self-hosted Supabase as the PostgreSQL host, keeping `pg`, Next.js server commands and Better Auth/MFA. No Supabase Auth, SSR login helpers or browser commerce queries were added. **The intended installation is not identified or verified yet.** `http://localhost:8000` is an HTTP API endpoint and was unreachable during this run. The existing ignored `.env.local` still selects the original `127.0.0.1:55432/mobile_store`; it was not overwritten. No source records, credentials, MFA enrollment, worker state or destination data were migrated. The actual Supabase PostgreSQL version, dedicated/shared status, pooler tenant/user, exposed schemas and installed extensions remain unknown.

The independent private-schema tests used a **disposable standalone PostgreSQL 18.6 fixture on port55434**, not Supabase. This distinction applies even though they exercised `DATABASE_PROVIDER=supabase` validation. See [the current run](docs/codex/runs/20261114-ecommerce-local-supabase-postgres.md) and [DELIVERY](docs/DELIVERY.md#supabase-connection-verification--2026-11-14).

### Configuration and connection modes

Use [.env.supabase.example](.env.supabase.example) as a placeholder reference. Obtain connection details from the intended installation's private compose/env configuration; an anon key cannot supply a PostgreSQL password. Do not use a hosted project from another account. Supply only the private file path during collaboration, not secrets.

| Variables                                                                    | Used by / boundary                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`, `DATABASE_PROVIDER=supabase`, `DATABASE_SCHEMA`              | Server runtime; dedicated role and private schema (proposed names `ecommerce_runtime`, `store_private`)                                                                                                                                                                                              |
| `DATABASE_CONNECTION_MODE=direct` or `session`                               | Both pools/scripts; establish from installation configuration, never from port number. Transaction pooling is rejected.                                                                                                                                                                              |
| `DATABASE_SSL_MODE=disable` or `verify-full`, optional `DATABASE_SSL_CA` PEM | Both commerce/Better Auth; explicit mode required for Supabase. Disable only for confirmed trusted loopback without TLS. Never disable certificate verification for TLS.                                                                                                                             |
| `MIGRATION_DATABASE_URL`                                                     | CLI-only private file; distinct migration role (`ecommerce_owner`), same verified endpoint/database as runtime. Keep out of the web process environment.                                                                                                                                             |
| `DATABASE_ADMIN_URL`, `DATABASE_EXPOSED_SCHEMAS`                             | Separate CLI audit/provision preparation file only; actual inspected exposure list, not a guess. Never load administrator credentials into Next.js.                                                                                                                                                  |
| `TEST_DATABASE_URL`                                                          | Different disposable database; integration suite rejects the app database even with different credentials/localhost aliases. Use a different database name as well as a separate disposable database, even across pooler/DNS aliases. Test login needs schema DDL only within that fixture database. |
| `TEST_DATABASE_CONNECTION_MODE`, `TEST_DATABASE_SSL_MODE`                    | Optional explicit test overrides; otherwise inherit verified app connection/TLS mode.                                                                                                                                                                                                                |
| `APP_ORIGIN`, `BETTER_AUTH_SECRET`                                           | Preserve the existing values for a real switch. Better Auth sessions, identity IDs, roles and TOTP stay in application-owned tables, separate from Supabase's `auth` schema.                                                                                                                         |
| `STORE_TEST_FIXTURES=true`                                                   | Explicit opt-in for destructive fictional auth/browser/notification fixtures; leave unset/false for the preserved store. `STORE_OWNER_CREDENTIALS` / `STORE_OWNER_STORAGE` select separate private fixture files.                                                                                    |

All URLs must explicitly identify PostgreSQL host/database/user and use URL-encoded credentials. HTTP URLs and URL query/fragment options are rejected; configure TLS/search_path through the settings above. The current supported topology uses the same verified direct/session endpoint for runtime and migrations, with distinct logins; different pooler/direct endpoints require an explicit verified mapping before relaxing the same-target guard. Pool sizes are commerce10 + BetterAuth5 per server process, migration1; size total connections for the actual process count before deployment. `search_path=<private>,pg_catalog` is set on **every** pool connection. No `public` fallback is added for a private schema. The library migration introspector uses `current_schema()`. Missing/inaccessible schemas fail before migration; health checks verify the effective schema.

### Preparation and startup after the target is confirmed

These commands are ready to use, but were not run against the intended installation. `/private/...` paths below are placeholders. Use Node24 and `npm ci --legacy-peer-deps`.

1. Confirm installation path, dedicated/shared status, database ownership, direct/session endpoint, PostgreSQL version, extensions and PostgREST exposure settings. Check for target data conflicts. Use a separate disposable database on that installation for compatibility tests. Never run fixture scripts on the existing owner's database.
2. Generate a **reviewable SQL plan**: `node --env-file=/private/store-audit.env --import tsx scripts/db-private-schema.ts --sql`. This command does not apply SQL. The plan refuses pre-existing role/schema collisions and touches only a new project-owned boundary. An authorized installation administrator applies it after inspection and assigns role passwords privately (`psql` interactive `\password`), without changing Supabase-managed objects or unrelated defaults. The historical initial migration requires `pgcrypto`; the administrator must verify/preinstall it in the installation's intended extension schema before restricted-role migrations. Do not grant extension administration to runtime.
3. **On the separate disposable target-version database first**, with its runtime connection settings plus the separate migrator URL in a CLI-only file: `node --env-file=/private/store-migration.env --import tsx scripts/migrate.ts`, then `node --env-file=/private/store-migration.env --import tsx scripts/migrate-auth.ts`. Repeat both to verify16 commerce journal entries and idempotent Better Auth schema inspection. The existing session advisory lock and atomic file+journal transactions are retained; no Supabase migration runner is introduced.
4. Audit: `node --env-file=/private/store-audit.env --import tsx scripts/db-private-schema.ts --audit`. Read-only catalog audit checks API-role privileges, owners, role memberships, RLS flags, views, functions and creator default ACLs. Also inspect the running PostgREST configuration and perform HTTP denial checks using each applicable API role. A supplied exposure list/catalog audit alone cannot prove HTTP denial.
5. Read-only runtime check: `node --env-file=/private/store-runtime.env --import tsx scripts/db-preflight.ts`. It reports sanitized target identity/version/schema/extensions and suppresses credentials. Preflight is connectivity/configuration evidence, not migration completion.
6. Perform the preservation/switch procedure below if existing data is required. Do not run empty-install migrations/seeds in a business destination before choosing its verified import strategy. A full application-schema restore into an empty boundary includes the original journal, and migrations are rerun only after import; a data-only strategy requires matching schemas and an independently tested conflict/FK load procedure. Only then merge the reviewed **runtime-only** settings into ignored `.env.local`, retaining the existing auth secret/origin. Use `npm run dev -- --webpack` (Next loads `.env.local`) and `npm run notifications:run` only when intentionally processing that selected database. `setup:local` never overwrites existing env; `db:local` refuses a selected Supabase provider and cannot replace it with embedded PostgreSQL. No automatic fallback occurs.

For an alternate private env file, load it into the parent environment before launching npm/Next. Do not launch Next directly with Node's `--env-file` flag: this Next version forwards it into an unsupported child `NODE_OPTIONS`. For example:

```bash
node -e 'process.loadEnvFile("/private/store-runtime.env"); const child=require("node:child_process").spawn("npm",["run","dev","--","--webpack"],{stdio:"inherit",env:process.env}); child.on("exit",code=>process.exit(code??1));'
```

Use `APP_ORIGIN` matching the selected port (browser tests respect it). Keep web/worker on the same runtime config. Never start a second writer on the source during a switch.

### Data preservation, backup and rollback

No switch has occurred. Before one: stop only this store's web writers and worker; retain the source data directory and a protected application-data/auth backup plus original runtime configuration. Preserve `BETTER_AUTH_SECRET`/origin privately. Establish a manifest from the actual application migration objects and Better Auth tables, including `user`, `account`, `session`, `verification`, `twoFactor`, `rateLimit`, `store_access`, customer links, schema journal, immutable snapshots, inventory/refund unit commitments, audit, checkout idempotency and **both outbox and local delivery dedupe records**. Check exact case-sensitive table names. Do not dump/restore the whole Supabase database, cluster, roles, managed auth/storage/realtime schemas or unrelated public objects.

The source currently uses `public`, while the proposed destination is private. `pg_restore` does not automatically remap schemas. Do not blindly replace SQL text or rename `public` on a shared database. Prepare and verify a table-manifest archive in an isolated staging database first: restore only app-owned objects, move those tables (and associated sequences) into the private schema with reviewed `ALTER TABLE ... SET SCHEMA`, preserve foreign-key identities, set project migration ownership/grants, then export that application schema. Restore only into a confirmed empty boundary, with schema-creation entries explicitly reviewed against the already provisioned schema. Reject target conflicts rather than using clean/drop/upsert against business records. This transfer must be adapted and tested once actual source/target ownership/version are established; it has **not** been executed here.

Compare all application rows/IDs, journal, snapshots, money, commitments, funding/refund states, owner/customer auth and grants, plus outbox statuses/attempts/dedupe. Keep workers stopped throughout copy. Verify sign-in/MFA/deactivation/ownership, stock/refunds, restart persistence and API-role denial on the destination. Enable one writer and one intentional worker only after comparison; never reset copied job status or requeue delivered jobs. Keep the source intact until verification succeeds.

Rollback: stop the destination app/worker, preserve destination diagnostics and any new transactions, reconcile target-only writes before choosing a source, restore the privately saved original runtime settings/auth secret, and start only the source app/worker. Never independently replay payments or outbox jobs. After destination writes, rollback is a reconciliation operation, not an unconditional URL flip.

For an **isolated fictional private-schema restore exercise**, create a separate empty database named `store_restore_<fixture>` and configure `RESTORE_DATABASE_URL` privately with an authorized restore login (not the web role). Stop fixture app/worker, set `STORE_TEST_FIXTURES=true`, `RESTORE_CHECK_QUIESCED=true`, `PG_BIN_DIR` to compatible PostgreSQL client utilities, then run `node --env-file=/private/store-restore-fixture.env --import tsx scripts/schema-restore-check.ts`. It dumps only `DATABASE_SCHEMA`, excludes ownership/ACL replay, checks every table's rows including identity/outbox and verifies unrelated destination relation identities. The fixture destination is retained; temporary archives are private and deleted. It is not a schema-remapping or live-switch utility. Use a fully installed compatible client toolchain; extracted clients may also require their matching library path. The old `db:restore-check` whole-database utility is blocked for Supabase. Production encrypted backup/retention/RPO/RTO remain separate work.

### Dependency state

The committed `e1abc88` package/lock install was verified in an isolated archive using Node24.22.3/npm11.19.1 and `npm ci --legacy-peer-deps`, with unchanged SHA256 hashes and passing checks. Current source was also checked against those committed dependencies. The pre-existing working-copy manifest adds `@supabase/ssr`/`@supabase/supabase-js`; no store code imports them. Both manifest and lock changes remain outside this task's commit. The lock diff includes new packages, picomatch hoisting and native/libc/devOptional metadata changes; no existing package identity's resolved artifact/integrity changed. Its generating npm version/flags are unknown. No lock correction was necessary for the demonstrated committed install. See [dependency evidence](docs/codex/runs/20261114-ecommerce-local-supabase-dependencies.md).

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
STORE_TEST_FIXTURES=true npm run db:seed
npm run dev -- --webpack
```

Open http://localhost:3000. Seed products, prices, shipping charges, device names and specs are fictional. The development seed enables COD and the development payment adapter. It does not invent merchant, courier or warranty promises. The shipping fixture covers Dhaka; other destinations are rejected until configured.

## Owner setup and operation

```bash
OWNER_BOOTSTRAP_ENABLED=true npm run owner:bootstrap
```

The bootstrap requires an interactive terminal, reads the password without echo, refuses a second owner, and sends nothing externally. No default owner/password ships. Sign in at `/login`, enroll TOTP using your authenticator and save the library-issued recovery codes privately. Owner API access is blocked until MFA enrollment and a verified session. Keep `OWNER_BOOTSTRAP_ENABLED=false` during normal use. Customer signup never grants owner access; no staff roles are enabled. Deactivation support is implemented as a server helper, not exposed as an unaudited public action.

Routes: `/`, `/products/[slug]`, `/cart`, `/checkout`, `/orders/[id]`, `/account`, `/recover`, `/help`, `/policies/[slug]`, `/login`, `/admin`. APIs: `/api/store`, `/api/auth/*`, `/api/auth/identity`, `/api/health`, owner CSV export `/api/admin/export`. All sensitive data queries and commands enforce server-side access; UI hiding is supplementary.

Owner console: draft/publish catalog, SKU fit/spec/source/media editing, inventory receipts/adjustments, order details, COD confirmation, dispatch and delivery updates, cancellation, returns/inspection, refund commitments/payout reconciliation, warranty resolution, cash collection/remittance, fixed discounts, content, reports/CSV, support notes, settings, audit and notification queues/templates. Owner money fields accept BDT decimal text (for example 1850.50); API/database values remain integer poisha. Searchable cards/selectors carry UUIDs automatically; normal catalog, stock, order, refund and COD work needs no pasted IDs or JSON. Publish a new SKU only after entering sourced specifications/fit. Receipt/adjustment quantities require a reason. A return enters quarantine; only sellable inspection restocks it. Mark a refund successful only with actual payout evidence; unknown outcomes retain capacity.

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
TEST_DATABASE_URL=postgresql://TEST_ADMIN:PRIVATE_PASSWORD@HOST:PORT/mobile_store_test npm run test:db
STORE_TEST_FIXTURES=true npm run test:notifications
STORE_TEST_FIXTURES=true npm run test:prepare-owner
STORE_TEST_FIXTURES=true npm run test:auth
STORE_TEST_FIXTURES=true npm run test:e2e
npm run build -- --webpack
```

`test:db` requires a different disposable database from `DATABASE_URL`, then creates and drops unique schemas inside it. Load both URLs into the environment for the isolation check. Use test/development data only. `test:prepare-owner` creates a fictional owner only if no owner exists and saves private credentials under `/tmp` for automation; it refuses to replace an existing owner. `test:auth` uses that fixture, exercises MFA and deactivation, and saves private browser state. Do not run these fixture scripts against a real owner's store. Browser tests require system Chrome at `/opt/google/chrome/chrome` (override config for your installed browser); authenticated tests use `/tmp/store-owner-state.json`. Tests create fictional orders/content/discounts in the local app database. Start from an isolated development database for a clean run.

Backup verification needs `pg_dump` and `pg_restore` from PostgreSQL 18 on your machine:

```bash
PG_BIN_DIR=/path/to/postgresql/18/bin npm run db:restore-check
```

It dumps the local database, restores into a temporary database, checks record counts, and deletes the temporary database/archive. The embedded server package does not contain these client utilities. Production backups, retention, encryption, scheduling, RPO/RTO, and off-machine storage remain deployment responsibilities.

Historical refinement evidence: 12 unit tests, 24 PostgreSQL tests, authentication smoke, notification failure/retry, 18 baseline and workflow-refinement browser scenarios, and isolated restoration were run. Screenshots are under `artifacts/`; HTML browser evidence under `artifacts/playwright-report/`. Read `docs/DELIVERY.md` and `docs/Memory.md` for the final verification checkpoint.

## Remaining release prerequisites

No real payment provider or courier account has been connected or verified. Manual courier tracking is implemented. Production needs approved policies/contact/branding/language, delivery rates/coverage and battery acceptance, tax/invoice review, merchant onboarding and sandbox proof, verified production payment adapter, real transactional/recovery delivery, hosting/TLS/secrets, monitoring/backup operations and a release decision. Return/warranty policy eligibility is reviewed manually by the owner; no unapproved time promise is encoded. Native uploads are not implemented; media uses sourced HTTPS/local image URLs with alt text. Phase 4 growth remains planned. Staff roles remain disabled.

The initial empty `.git` directory required approved access; a local Git repository is now initialized. No remote was created or contacted, and no push, purchase, real message/payment or deployment was performed. An existing configured origin is preserved. In this session the downloaded Node runtime/dependencies and test database were isolated under `/tmp`; the repository contains the lockfile and reproduction scripts, not those temporary binaries.

## Workflow refinement

Owner catalog editors now preserve SKU identity on rename, exact model fit, unedited structured fields and ordered URL media. Inventory search/actions show saved movements and persisted balances. Selected order workspaces isolate history/items and carry after-sales/COD identities, eligibility and reasons/evidence. Paid predispatch cancellation releases commitment without increasing physical stock and can refund verified funding without a return; late funding requires reconciliation and explicit cancellation; dispatched returns still need receipt/inspection. Sellable inspection transfers quarantine to sellable with no physical change.

Prices, refunds, collections, remittances and delivery fees use exact BDT text; malformed/over-precision/out-of-bounds input is rejected. Customer specs use words/units and mobile history uses cards. Friendly access states preserve safe destinations; restarting an expired anonymous session grants no old order access.

Focused before/after screenshots are in artifacts/refinement and artifacts/refinement-after-*. DELIVERY maps A1–A11 and V-IDs to actual tests. Percentage discounts remain outstanding P1; native uploads are explicitly excluded/unimplemented, not silently complete. Real-provider/sandbox/deployment/commercial gates are unchanged. The owner MFA record and existing business data were not reset for refinement verification.
