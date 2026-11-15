# Docker database and self-hosted Supabase

## Local development

Start Docker Desktop, select its `desktop-linux` context, and run from this repository:

```bash
npm run setup:docker
npm run dev
```

Use Node.js 24 LTS and `npm ci --legacy-peer-deps` on a new checkout. On a Linux server with Docker Engine, use its working context instead of `desktop-linux`.

The Compose project is `ecommerce-local`; Docker Desktop displays `ecommerce-local-db-1`. The pinned image is the PostgreSQL component used by [Supabase's official Compose configuration](https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml): `supabase/postgres:17.6.1.136` (PostgreSQL 17.6). This is a database-only local setup. Studio, Supabase HTTP APIs and their API keys are not part of it. The store uses direct PostgreSQL connections and Better Auth, including MFA.

| Setting                                 | Local value                                        |
| --------------------------------------- | -------------------------------------------------- |
| Host / port                             | `127.0.0.1:55432` (direct PostgreSQL, not HTTP)    |
| Application database                    | `mobile_store`                                     |
| Private schema                          | `store_private`                                    |
| Runtime role                            | `ecommerce_runtime` (DML, no DDL/admin privileges) |
| Migration role                          | `ecommerce_owner` (owns application schema/tables) |
| Disposable integration database / owner | `mobile_store_test` / `ecommerce_test`             |
| Data volume                             | `ecommerce-local_database`                         |
| Database configuration/key volume       | `ecommerce-local_database-config`                  |

`npm run setup:docker` is repeatable. It retains passwords and existing data, applies outstanding migrations and performs a runtime preflight. Only a newly initialized application boundary receives fictional seed data. It backs up a previous `.env.local` before switching and preserves `BETTER_AUTH_SECRET` and `APP_ORIGIN`. Existing remote data is neither imported nor changed.

| Private ignored file                         | Purpose                                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `.env.local`                                 | Next.js runtime settings and the isolated test URL; no administrator or migration URL      |
| `.local-data/docker/database.env`            | Compose administrator password plus generated role passwords; retain with the data volumes |
| `.local-data/docker/migration.env`           | Owner URL, loaded only by `db:migrate` / `auth:migrate`                                    |
| `.local-data/docker/env-before-docker-*.env` | Previous configuration, including any previous remote connection                           |

Do not commit or publish those files. Existing Supabase HTTP settings in a previous `.env.local` are retained, but no application code uses them. `db:up` starts the existing container after a Docker restart. `db:stop` retains data. `setup:docker` requires the original credential file when reusing volumes; deleting it does not reset database passwords. Avoid `docker compose down -v`, which deletes the database.

```bash
npm run db:status
npm run db:check
npm run db:migrate
npm run auth:migrate
npm run test:db
```

The integration suite loads `.env.local` and creates/drops isolated schemas in `mobile_store_test`; it refuses the application database. To create your first owner interactively, use `npm run owner:bootstrap -- --enable`, then enroll MFA at `/login`. The flag enables this invocation only; retain `OWNER_BOOTSTRAP_ENABLED=false` in `.env.local`. No owner password is generated automatically.

## The development terminal error

The reported `TurbopackInternalError: connect_task ... task ... no longer exists` is an internal Turbopack failure. The project's `dev` script selects Next.js's documented `--webpack` option, so `npm run dev` bypasses that bundler. Stop a previously running development server with Ctrl+C before restarting. The project is on a mounted volume; the reported slow-filesystem warning may still affect compilation speed.

If a port is already occupied, stop the old project process or intentionally choose another port and update `APP_ORIGIN` to match; auth and same-origin checks depend on it.

## Use an existing self-hosted Supabase server

Install/manage the full Supabase stack separately using the [official self-hosting guide](https://supabase.com/docs/guides/self-hosting/docker). Upload this application's source and lockfile to your app server. Keep the database in your existing Supabase installation; do not run `setup:docker` against it. That command always creates/switches to the local development fixture.

Use a confirmed direct PostgreSQL endpoint or a verified **session** pooler endpoint. Port `8000` is the Supabase HTTP gateway. Transaction pooling is unsupported because migrations and store commands use session state/advisory locks. For an app process running on the same host as a loopback-bound database/pooler, use the actual published localhost port. An app in another container needs the database service's DNS name on a shared private Docker network, not `127.0.0.1`. Keep the existing installation's managed database/schema names intact.

For an **empty application boundary**, connect with the installation administrator (`supabase_admin` or the installation's equivalent authorized role), confirm the target database and exposed PostgREST schemas, then:

1. Verify `store_private`, `ecommerce_owner` and `ecommerce_runtime` are unused. Do not overwrite an existing deployment's objects or passwords.
2. Create the two restricted roles and assign distinct strong passwords privately with psql's `\password` prompts:

   ```sql
   CREATE ROLE ecommerce_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
   CREATE ROLE ecommerce_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
   \password ecommerce_owner
   \password ecommerce_runtime
   ```

3. Verify/install `pgcrypto` as administrator in the installation's intended extension schema. The historical first commerce migration requires its presence; do not give runtime extension administration.
4. In a transaction, apply [`db/provision-private-schema.sql`](../db/provision-private-schema.sql). It creates only the private application boundary and its grants. The administrator must be authorized to create a schema owned by the migration role and set its default privileges.
5. Leave `store_private` out of PostgREST's exposed schemas and extra search paths. Never grant the runtime role to API roles. Application tables are accessed through the Next.js server's authorization checks.

Create a private runtime `.env.local` from the runtime portion of `.env.supabase.example`:

```dotenv
DATABASE_PROVIDER=supabase
DATABASE_URL=postgresql://ecommerce_runtime:URL_ENCODED_PASSWORD@VERIFIED_HOST:PORT/EXISTING_DATABASE
DATABASE_SCHEMA=store_private
DATABASE_CONNECTION_MODE=direct
DATABASE_SSL_MODE=verify-full
APP_ORIGIN=https://your-store.example
BETTER_AUTH_SECRET=YOUR_PRIVATE_AUTH_SECRET
STORE_DEV_ADAPTERS=false
STORE_TEST_FIXTURES=false
OWNER_BOOTSTRAP_ENABLED=false
```

Use `session` only for a confirmed session pooler, including its actual tenant-qualified usernames where required. Supply `DATABASE_SSL_CA` for a private CA when necessary. Use `disable` only for a verified trusted local/private transport without TLS. Preserve the original auth secret when moving auth/MFA records. Set a separate disposable `TEST_DATABASE_URL` only if running integration tests on that server.

Put only the owner connection in a **separate private file**, such as `/private/store-migration.env`:

```dotenv
MIGRATION_DATABASE_URL=postgresql://ecommerce_owner:URL_ENCODED_PASSWORD@VERIFIED_HOST:PORT/EXISTING_DATABASE
```

Runtime and migration URLs must select the same verified host, port and database, with distinct logins. On an empty installation:

```bash
STORE_MIGRATION_ENV_FILE=/private/store-migration.env npm run db:migrate
STORE_MIGRATION_ENV_FILE=/private/store-migration.env npm run auth:migrate
npm run db:check
npm run build
npm start
```

Do not upload `.local-data/docker/migration.env` from your laptop; create the server's own credentials. Normal application startup must not load the migration or administrator URL. Run the existing `scripts/db-private-schema.ts --audit` with a separate audit-only configuration and the actual exposed-schema list, then verify HTTP denial on the full Supabase installation before using real data. Local database-only tests do not exercise the Supabase HTTP services.

## Back up or transfer local application data

Schema migrations above create an empty server store. They do not copy local orders/users. Normally keep fictional local test data out of the real store.

To intentionally transfer a local development snapshot, stop this store's web process and notification worker first. From the repository root, make a private application-schema archive using the container's matching PostgreSQL tools:

```bash
mkdir -p .local-data/backups
chmod 700 .local-data/backups
docker compose --env-file .local-data/docker/database.env exec -T db \
  pg_dump -U supabase_admin -d mobile_store --schema=store_private \
  --format=custom --no-owner --no-acl > .local-data/backups/store.dump
chmod 600 .local-data/backups/store.dump
```

The dump contains private application data and the migration journal, not Supabase's managed schemas. Copy it privately to the target. Use compatible PostgreSQL restore tools (17 or newer); verify target-version compatibility on a disposable database first.

On an **empty** target, create the roles and private boundary first, but do not run migrations or seed before a full-schema restore. Inspect the archive's `pg_restore --list` output; omit its `SCHEMA store_private` creation entry because provisioning already created the schema. Restore remaining entries using the owner login with `--no-owner --no-acl --exit-on-error --single-transaction` and that reviewed list. Objects then belong to `ecommerce_owner` and inherit its runtime grants. Never use `--clean` against an existing store. Keep the original `BETTER_AUTH_SECRET` for copied auth data, rerun both migration commands, audit privileges, and compare table counts/IDs and auth/commerce behavior before enabling a writer. Keep the source intact for rollback.

To test local persistence, stop the application, run `npm run db:stop`, then `npm run db:up` and `npm run db:check`; the same named volume and products should remain. Database major upgrades require a reviewed dump/restore procedure; changing the image tag alone is not a major-version migration.
