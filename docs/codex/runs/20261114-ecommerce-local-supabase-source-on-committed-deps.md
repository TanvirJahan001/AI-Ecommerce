# Final source verification with committed dependencies

Date: 2026-11-14. Source checkout: `/tmp/ecommerce-e1abc88-deps-5tzTTN`, dependency baseline `e1abc88263832e42b992b4d33e4a161ab05aa753`. Dependencies remain from the successful isolated `npm ci --legacy-peer-deps --cache /tmp/store-clean-cache` using Node24.22.3/npm11.19.1 documented in `/tmp/dependency-report.md`.

Synced31 current changed/new src/scripts/tests files and `playwright.config.ts` (file list below). Removed only the isolated ephemeral `scripts/fixture-restart.ts`. Did not copy manifests, lockfiles, next-env.d.ts, .env files, node_modules, .git, owner data or credentials. No application server, DB tests or browser tests started for this verification. At check time the checkout contains only tracked `.env.example`, no runtime `.env` or `.env.local`.

## Actual checks

All commands use `PATH=/tmp/node-v24.22.3-linux-x64/bin:$PATH`.

| Command                                                                                                                                                                                                | Result                             | Log                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | ---------------------------------- |
| `npm run format:check`                                                                                                                                                                                 | Pass, exit0                        | `/tmp/dependency-final-format.log` |
| `npm run lint`                                                                                                                                                                                         | Pass, exit0                        | `/tmp/dependency-final-lint.log`   |
| `npm run typecheck`                                                                                                                                                                                    | Pass, exit0                        | `/tmp/dependency-final-type.log`   |
| `npm test`                                                                                                                                                                                             | Pass,25 tests across4 files, exit0 | `/tmp/dependency-final-unit.log`   |
| `NEXT_TELEMETRY_DISABLED=1 DATABASE_URL=postgresql://build_only:unused@127.0.0.1:1/build_only BETTER_AUTH_SECRET=isolated-build-placeholder-only-not-an-application-secret npm run build -- --webpack` | Pass, exit0                        | `/tmp/dependency-final-build.log`  |

Unit and build ran with authorized process escalation, necessary because sandbox disallows the CLI subprocesses used by boundary tests and Next TypeScript configuration inspection. Build used only fictional loopback/unused credentials, performed no database requests, and emitted only the known `/tmp/package-lock.json` workspace-root inference warning. Successful unit/build checks do not claim Supabase connectivity, runtime authentication, DB concurrency, external-provider or commercial readiness.

## Unchanged committed dependency hashes

- `package.json`: `c6facb08f40e930ea9c11f42a082990c40d4f58859208a6f89574c871584eb9a` (identical to committed baseline).
- `package-lock.json`: `d8fb8187bce975de968487dcd4148fcb03e24a0f249dd2378904cd5a4cb0cc13` (identical to committed baseline).

## Final synced source files

- `playwright.config.ts`
- `scripts/auth-smoke.ts`
- `scripts/db-preflight.ts`
- `scripts/db-private-schema.ts`
- `scripts/local-db.ts`
- `scripts/migrate-auth.ts`
- `scripts/migrate.ts`
- `scripts/notification-smoke.ts`
- `scripts/outbox.ts`
- `scripts/restore-check.ts`
- `scripts/schema-restore-check.ts`
- `scripts/seed.ts`
- `scripts/setup-local.ts`
- `scripts/test-owner.ts`
- `scripts/test-restart.ts`
- `src/app/api/health/route.ts`
- `src/lib/__tests__/database-config.test.ts`
- `src/lib/__tests__/db-boundary.test.ts`
- `src/lib/auth-config.ts`
- `src/lib/auth.ts`
- `src/lib/database-config.ts`
- `src/lib/db.ts`
- `tests/e2e/admin.spec.ts`
- `tests/e2e/catalog-refinement.spec.ts`
- `tests/e2e/guest-access.spec.ts`
- `tests/e2e/order-refinement.spec.ts`
- `tests/e2e/presentation-refinement.spec.ts`
- `tests/e2e/setup.ts`
- `tests/e2e/store.spec.ts`
- `tests/integration/catalog.test.ts`
- `tests/integration/commerce.test.ts`
