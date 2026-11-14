CODEX_SPEC_INGEST_V1
---

title: Connect the existing ecommerce store to local Supabase PostgreSQL
slug: ecommerce-local-supabase-postgres
created_by: chatgpt
workflow: codex-spec-archiver
requires_git: true
---

# Objective

Connect the existing Bangladesh-only mobile-accessories store to the PostgreSQL service in my intended self-hosted Supabase installation.

Preserve the existing Next.js application, Better Auth authentication and MFA, server-side commerce commands, transaction boundaries and recently completed workflow refinements.

Implement and verify the local integration. Continue through the useful authorized work instead of stopping after a plan.

# Current state

The latest reported refinement commit is `e1abc88`.

The report records:

- Completed owner/customer workflow refinements.
- Exact BDT input and integer-poisha storage.
- Correct paid-cancellation refunds without fictional returns.
- Late-payment reconciliation.
- Preserved owner MFA and authorization.
- 12 unit tests, 24 PostgreSQL tests and 18 browser scenarios passing.
- Passing additive migration and isolated restoration checks.

There is a pre-existing, unexplained uncommitted package-lock.json change involving dependency placement/platform metadata. It was intentionally preserved outside the task commit.

Inspect the repository to establish the current state. Preserve any subsequent user changes.

# Architectural decision for this task

Use Supabase as the PostgreSQL host.

Continue using:

- Better Auth for login, identity, sessions and owner MFA.
- Existing Next.js server operations for customer and owner requests.
- Existing pg/database integration for transactions.
- Existing local/test payment and notification adapters.
- Existing migration runner and migration journal.

Supabase Auth replacement, browser access to commerce tables, native image uploads and new payment integrations are outside this task.

Do not introduce Supabase SSR authentication helpers merely to change the PostgreSQL connection.

# 1. Inspect the repository and preserve existing work

Read applicable AGENTS.md instructions, README, package scripts, database/auth configuration, migrations and the eleven canonical project documents.

Inspect Git status, the current commit and the pre-existing lockfile diff before installing packages.

Determine whether the lockfile change affects:

- Package versions.
- Resolved package locations or integrity values.
- Dependency placement.
- Optional/native packages or platform metadata.
- Node/npm version or installation flags.

Preserve unexplained user changes. Do not blindly delete, regenerate, revert or include the entire lockfile in this task commit.

Test installation from the committed dependency files in an isolated checkout or worktree using the documented runtime and flags. Record which exact dependency state was verified.

If a lockfile correction is necessary, make the smallest explained correction with reproducible evidence. Keep unrelated changes separate.

Follow the existing Codex specification archive/run-record convention.

# 2. Identify the intended local Supabase target

The supplied public API endpoint is:

http://localhost:8000

This identifies an HTTP endpoint, not a PostgreSQL connection string.

Inspect the intended installation’s local configuration without printing secrets. Establish:

- The correct ecommerce project/database.
- Whether the installation is dedicated or shared with other applications.
- PostgreSQL host, port, database and connection mode.
- Required pooler username or tenant identifier, if applicable.
- Actual PostgreSQL version.
- Relevant extensions and schema layout.
- Which schemas the Data API exposes.

Do not assume that a hosted Supabase project available through another account is the target.

Do not infer the database password from the anon key.

Use private local configuration for credentials. Document variable names and placeholders only.

If the intended database cannot be identified safely, complete independent repository/configuration work and report the exact missing connection information. Do not guess a target or mutate an unrelated database.

# 3. Preserve the existing authentication system

Inspect how Better Auth and the commerce modules obtain database connections.

Configure both for the intended target while preserving:

- Existing identity relationships.
- Owner/customer roles.
- Customer-to-order ownership.
- Active-owner and deactivation checks.
- MFA enrollment and challenge requirements.
- Guest order grants and recovery behavior.
- Required authentication secrets and their existing handling.

Do not introduce a second login system.

Keep Better Auth objects distinct from Supabase-managed authentication objects. Do not reuse or overwrite Supabase’s managed auth schema.

Do not assume Better Auth cookies automatically establish a Supabase Auth session or provide an auth.uid() value.

# 4. Configure the database connection

Reuse the existing database adapter and environment conventions.

Provide a clear server-only PostgreSQL connection configuration.

Inspect whether migration scripts, application code or tests depend on session-level advisory locks, search_path or other connection-local behavior.

Use a verified direct or suitable session connection for operations that require those semantics. Choose runtime pooling based on the actual process topology and existing code.

Do not assume a connection mode from a port number alone.

Ensure local setup scripts cannot silently overwrite the selected database configuration or reset the configured Supabase database.

Keep TEST_DATABASE_URL and destructive test operations isolated from the application database.

Surface missing or invalid configuration clearly without exposing credentials. Do not silently fall back to another database and report a successful integration.

# 5. Establish the application’s access boundary

Inspect actual exposed schemas, grants, default privileges, RLS, views and callable functions.

Keep commerce and Better Auth internals accessible through the existing server operations.

Prefer a compatible non-exposed application schema, or equivalent explicit restrictions when retaining the current layout.

Use a suitably restricted runtime database role. Keep schema-migration authority separately controlled.

Prevent unintended API-role access to application tables, sequences and functions. Apply appropriate grants and RLS to any intentionally exposed objects.

Verify access restrictions with meaningful negative checks.

Preserve Supabase-managed auth, storage, realtime, extensions and service roles.

Limit configuration changes to this project. Do not disable services or change permissions for unrelated applications.

# 6. Prove compatibility on the actual target

The store was reportedly tested on PostgreSQL 18. Inspect the target version rather than assuming it matches.

Apply the existing application and Better Auth migrations to a clearly isolated test target using fictional fixtures.

Verify migration ordering, journal behavior and repeat execution.

Resolve actual compatibility problems with focused changes. Do not upgrade or downgrade the Supabase stack as a side effect of this task.

Do not import a whole PostgreSQL cluster or overwrite Supabase system schemas.

Do not copy real owner credentials or customer data into disposable test environments merely to simplify testing.

# 7. Prepare and perform a reversible local switch

Once the intended target is confirmed and compatibility checks pass:

- Identify the source application database and intended destination.
- Preserve a recoverable source and appropriate backup.
- Establish whether existing application data must be transferred.
- Transfer only application-owned data and required identity records.
- Preserve IDs, foreign keys, money values, inventory commitments, snapshots, refund state, audit history and outbox state.
- Preserve the existing owner’s authentication and MFA behavior.
- Avoid overwriting conflicting target data.
- Ensure only the intended application database and worker are active during the switch.
- Prevent copied outbox work from causing duplicate side effects.
- Keep the original source intact until target verification succeeds.
- Document a concrete rollback procedure.

If target data conflicts or ownership is ambiguous, stop the conflicting mutation and report the specific issue while continuing independent work.

Use fictional fixtures for tests and local adapters for all payment/notification verification.

# Acceptance criteria

S1. The existing application starts against the intended Supabase PostgreSQL target, with evidence identifying the target without exposing secrets.

S2. Existing migrations and their journal work correctly on the actual target version.

S3. Product, cart, order and inventory changes persist across an application restart.

S4. Better Auth owner sign-in, MFA and deactivation behavior remain correct.

S5. Customer and guest ownership checks continue to deny unauthorized access.

S6. Last-unit allocation, paid-stock commitments and concurrent/unknown refund protections still pass.

S7. Paid cancellation before dispatch and late-payment reconciliation still pass on the target.

S8. API-facing roles cannot access private commerce or Better Auth internals beyond explicitly intended access.

S9. The local switch preserves required data and does not duplicate outbox effects.

S10. Recovery/restore verification leaves Supabase system objects and unrelated applications intact.

S11. Dependency installation is reproducible from the committed files, or any remaining lockfile issue is precisely identified without hiding it.

S12. Documentation describes the actual connection, authentication boundary, migration procedure, rollback and verified status.

# Verification

Run the existing relevant checks and meaningful integration tests against the actual target version.

Include:

- Formatting, lint, types and build.
- Existing money/business-rule tests.
- Database concurrency and refund tests.
- Owner MFA and unauthorized-request checks.
- Customer/guest order access.
- Product and order persistence after restart.
- A practical owner inventory/order workflow in the browser.
- Data API access-denial checks for internal objects.
- Outbox behavior during restart/switch.
- An isolated application-data restore exercise.

Use the existing A1–A11 refinement tests as regression coverage where relevant.

Distinguish:

- Tests executed against the original database.
- Tests executed against Supabase PostgreSQL.
- Local adapter checks.
- Unexecuted external-provider checks.

Do not label database connectivity alone as successful migration or commercial readiness.

# Documentation and delivery

Update README and the affected Architecture, DATA, API, SECURITY, DELIVERY, Memory, Phases and other canonical documents as needed.

Record:

- Actual target topology and PostgreSQL version.
- Server-only configuration variables.
- Connection and migration modes.
- How to start the application against the target.
- How test databases are isolated.
- How the switch and rollback work.
- The lockfile investigation and verified dependency state.
- Actual commands, results and remaining limitations.

Provide a final report with:

1. Changes made and their purpose.
2. S1–S12 passed, failed or unverified.
3. Tests run against the actual target.
4. Data and authentication preservation results.
5. Local commit and Git status.
6. Disposition of the pre-existing lockfile change.
7. Any remaining missing configuration or conflicts.
8. Exact startup instructions.

Keep payment-provider verification, real message delivery, production deployment and commercial launch as separate milestones.

No remote push, public deployment, live payment or real customer message is included in this task.
