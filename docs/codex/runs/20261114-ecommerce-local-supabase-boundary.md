# Disposable private PostgreSQL boundary verification — 2026-11-14

Scope: standalone disposable embedded PostgreSQL **18.6**, loopback port 55434, database `boundary_fixture`. This is **not** the intended Supabase installation and establishes no actual Supabase target compatibility, Data API HTTP behavior, migrated source-data preservation, or live readiness.

Preparation created only `/tmp/ecommerce-boundary-pg` and fictional fixture objects. The original database, local `.env.local`, real owner/customer data, and the unavailable Supabase target were untouched. Fixture credentials exist only in `/tmp/ecommerce-boundary.env` (0600), not in this report. A separate `boundary_tests` database was created for destructive regression tests.

## Implemented files

- `scripts/db-private-schema.ts`: `--sql` prints fresh scoped provisioning SQL and never applies it; `--audit` requires explicit `DATABASE_ADMIN_URL` and performs a read-only catalog audit. Required `DATABASE_SCHEMA` and declared `DATABASE_EXPOSED_SCHEMAS` prevent SQL generation for known exposed/managed schemas. The declared list is not treated as proof of actual running PostgREST configuration. The audit also discovers database-side `pgrst.db_schemas` settings and explicitly requires separate configuration/HTTP verification.
- `src/lib/__tests__/db-boundary.test.ts`: seven tests cover non-connecting SQL preparation, managed/injection/exposed-schema rejection, and credential exclusion.

## Fixture preparation and exact invoked commands

An isolated embedded-postgres process was started using Node24 ESM with `databaseDir=/tmp/ecommerce-boundary-pg`, `port=55434`, `persistent=false`, loopback binding, and fictional administrator credentials. It created `boundary_fixture` and `boundary_tests`. The fixture administrator preinstalled `pgcrypto` before restricted migrations and created fictional `anon`, `authenticated`, `service_role` roles plus `auth.sentinel` / `storage.sentinel` tables. No Supabase distribution/services were started.

```sh
DATABASE_SCHEMA=store_private DATABASE_EXPOSED_SCHEMAS=public /tmp/node-v24.22.3-linux-x64/bin/node --import tsx scripts/db-private-schema.ts --sql > /tmp/store-private-preparation.sql
```

The printed SQL was applied **only** to the fictional fixture using its private administrator URL; role passwords were separately assigned to fictional values. The resulting schema owner/migration login is `ecommerce_owner` and runtime login is `ecommerce_runtime`. Both have no superuser/create-db/create-role/replication/bypass-RLS/inheritance attributes.

```sh
/tmp/node-v24.22.3-linux-x64/bin/node --env-file=/tmp/ecommerce-boundary.env --import tsx scripts/migrate.ts
/tmp/node-v24.22.3-linux-x64/bin/node --env-file=/tmp/ecommerce-boundary.env --import tsx scripts/migrate-auth.ts
/tmp/node-v24.22.3-linux-x64/bin/node --env-file=/tmp/ecommerce-boundary.env --import tsx scripts/migrate.ts
/tmp/node-v24.22.3-linux-x64/bin/node --env-file=/tmp/ecommerce-boundary.env --import tsx scripts/migrate-auth.ts
/tmp/node-v24.22.3-linux-x64/bin/node --env-file=/tmp/ecommerce-boundary.env --import tsx scripts/db-private-schema.ts --audit > /tmp/boundary-audit.json
/tmp/node-v24.22.3-linux-x64/bin/node node_modules/vitest/vitest.mjs run src/lib/__tests__/db-boundary.test.ts
/tmp/node-v24.22.3-linux-x64/bin/node node_modules/eslint/bin/eslint.js scripts/db-private-schema.ts src/lib/__tests__/db-boundary.test.ts
node_modules/.bin/prettier --write scripts/db-private-schema.ts src/lib/__tests__/db-boundary.test.ts
```

Results: all 16 commerce migrations applied and journaled; repeat run skipped correctly; Better Auth migrations completed twice with six core/plugin tables in `store_private`. Unit tests **7/7 passed**. File-targeted lint passed. Formatting completed. A first audit failed because PostgreSQL may evaluate `has_sequence_privilege` on a non-sequence before a boolean relkind filter; corrected with `CASE WHEN relkind='S'` and repeated audit passed. Initial sandbox-only child-process tests failed at spawn permission; elevated local execution passed, and the test helper now throws on process-spawn errors so denied execution cannot count as a pass.

## Direct database access checks

An explicit Node/pg probe (fictional fixture only) performed 21 passing checks recorded in `/tmp/boundary-negative-checks.json`:

- Runtime INSERT/UPDATE/SELECT, disconnect/reconnect persistence, and DELETE worked on a temporary private probe table with serial sequence.
- Runtime private-schema CREATE, TRUNCATE and reads of both managed-schema sentinels were rejected with SQLSTATE 42501.
- For each fake API role `anon`, `authenticated`, `service_role`, `SET LOCAL ROLE` followed by private commerce SELECT, Better Auth `user` SELECT, sequence usage and function EXECUTE was rejected with SQLSTATE 42501. Savepoints rolled back each deliberate error.
- All 16 migration journal rows and all six private Better Auth tables were present.
- Both unrelated `auth` and `storage` sentinel records remained intact.
- The temporary probe table/function were dropped by the migration role afterward.

The final read-only audit passed with no failures and records object owners, table RLS flags, view options, function owner/security-definer information and creator default privileges. Private tables currently use schema/grant isolation, not Supabase JWT or `auth.uid()` policies. Actual Data API schema exposure and HTTP access denial remain unverified until the intended installation is available.

## Connection and preservation findings

- Commerce migration runner uses a session-level advisory lock on one checked-out client; direct or verified session pooling is required. Domain transaction-level advisory locks remain within existing commerce transactions.
- Installed Better Auth 1.7.23 migration tooling selects `pg_catalog.current_schema()` and introspects that schema only. Per-connection startup search_path plus fail-closed schema assertion keeps both runtime and migrations in the private schema.
- A real switch must preserve application tables, six Better Auth tables, migration journal, identity mappings, `BETTER_AUTH_SECRET`, original origin/cookie settings, inventory/refund/unit allocation/idempotency records, snapshots, audit and complete outbox/local-delivery state. Supabase-managed `auth` tables must never be repurposed.
- Stop the one app writer and worker during consistent transfer. Keep the source intact, verify an empty/conflict-free destination, compare business invariants and identities, and do not reset delivered or pending outbox states. Rollback stops the target writer/worker, reconciles any target-only writes, then restores source configuration; never run both writers.
- Original restore-check used whole-database pg_dump/CREATE DATABASE and was unsuitable for a shared Supabase database; root is independently replacing this with application-schema-only isolated restore verification.
- Auth smoke scripts edit fictional owner MFA and browser/notification fixtures mutate their selected app database, so they require a separately configured fictional app target, never the preserved owner/business destination.

The disposable server remains running for parent-agent verification. No Next.js dev/build/browser process was started by this subtask.

Final teardown: only fixture55434 stopped cleanly. Its persistent=false configuration automatically removed the fictional cluster directory, so fixture data was not retained; reports/private configuration remain. No original-store or Supabase database was affected. Recreate a fixture before repeating database commands.
