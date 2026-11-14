# Local Supabase PostgreSQL connection run — 2026-11-14

**Specification:** [archived user request](../inbox/20261114-ecommerce-local-supabase-postgres.md). **Base:** e1abc88263832e42b992b4d33e4a161ab05aa753. **Outcome:** independently implementable preparation completed and fixture-verified; intended Supabase identification/compatibility/switch remain blocked by missing private configuration. No live payment/message/deployment/push occurred.

## Repository and target findings

- Canonical11 docs remain in docs/, instructions/README/scripts/auth/pg/migrations inspected.16 SQL files through013, existing atomic journal/session advisory lock retained. Better Auth remains the only login/MFA authority.
- Pre-existing **package.json and package-lock.json** changes were present at entry: Supabase SDK additions plus placement/platform metadata. Neither file was changed, regenerated, reverted or staged by this task. Their working-copy SHA256 remains `b364df3ec59343afa5babfff3bee135743774b323a4c9fa91857978cc9a9ec97` / `307c963e1e08ea37ee443c9d056a4e9cb8c8e55b7964a880af101d482eb994f5`. No app code imports the new SDKs. A later generated next-env.d.ts development-path change is also preserved separately.
- Node system default22/npm9 is outside documented Node24 baseline; checks used checksum-verified earlier Node24.22.3/npm11.19.1 at `/tmp/node-v24.22.3-linux-x64`. Isolated committed install source/hash/flags and full lock-diff analysis are in [dependency evidence](20261114-ecommerce-local-supabase-dependencies.md). No lock correction was needed. npm11 install-script warnings do not establish DB readiness; actual fixture PG boot was independently exercised.
- Private `.env.local` remains original PG127.0.0.1:55432/mobile_store and original auth secret/origin. Supabase variables there identify only HTTP localhost8000 and an anon key. Secrets never printed or decoded. Endpoint unreachable even with host network access; no local Docker/Podman socket/CLI or relevant compose file found in inspected project/config locations. No hosted account/project was queried as a substitute.
- Asked for intended compose/private connection file path and dedicated/shared status. User answered “i did that”; a safe reinspection still found only original PG settings. A second concise path-only question remains unanswered. No guessed database was mutated.
- Existing process on3000 was preserved; fixture app used loopback3001. No source app/database was stopped or reset by this task. Original owner/customer records were never copied into fixtures. Supabase topology/version/extensions/exposed schemas remain unknown.

## Implemented preparation

Shared server/CLI connection validation; private-schema startup search_path on every pg connection; direct/session requirement, explicit Supabase TLS, separate runtime/migration authority, no URL-option or missing-URL fallback; Better Auth factory/migration pool separation without auth behavior changes. Runtime/admin preflight/audit are read-only. Private role/schema SQL is emitted for review, never auto-applied. Existing migration runner and Better Auth introspector remain intact.

Tests reject same-named app/test databases even across user/host/port aliases. Seed/auth/browser/notification fixtures require explicit opt-in. Embedded local setup cannot substitute for selected Supabase/different database; setup uses exclusive creation. Legacy whole-DB restore rejects Supabase. New schema-only fictional restore excludes system schemas/owner/ACL replay and compares all app table rows plus unrelated relation identities. Restart probe compares persistent commerce/auth/outbox rows and checks owner session/API. Notification smoke selects only its own job and inherits the selected environment, never a forced source env file.

Browser tests respect APP_ORIGIN and separate private fixture credentials/state. They now create their own initial order/history and explicitly isolate guest cookies; expiry test waits for actual cookie issuance. Domain money/stock/refund/ownership rules, migrations and UI were preserved.

## Executed evidence and exact scope

Authoritative acceptance/commands/scenarios are in [DELIVERY S1–S12](../../DELIVERY.md#supabase-connection-verification--2026-11-14). [Boundary report](20261114-ecommerce-local-supabase-boundary.md), [source on committed dependencies](20261114-ecommerce-local-supabase-source-on-committed-deps.md), and [sanitized artifacts](../../../artifacts/supabase-preparation/boundary-audit.json) preserve evidence.

Disposable standalone PG18.6 ran under `/tmp/ecommerce-boundary-pg` at55434, private mode0600 config `/tmp/ecommerce-boundary.env`, application `boundary_fixture/store_private`, separate `boundary_tests`, separate restore fixtures. This is **not the intended Supabase installation** despite exercising provider=supabase validation. Fake anon/authenticated/service_role and auth/storage sentinels existed only in that fixture. No actual PostgREST HTTP service was available.

- Committed dependency clean install: pass,424 installed packages, unchanged manifests, format/lint/types/12 baseline unit/build passes.
- Current source on committed dependencies: format/lint/types/25 unit/build passes; final verification evidence updated below. Fictional build URL/secret only.
  -16 commerce migrations + Better Auth each twice under restricted owner/private schema: pass;16 journal rows, six private auth/MFA/rate-limit tables.
  -24 real PostgreSQL catalog/commerce tests: pass twice against separate boundary_tests; last-unit/paidhold/concurrentunknownrefund/paidcancellation/latefunds included.
  -21 direct boundary checks: pass; twelve API-role commerce/auth/sequence/function denials, runtime CRUD/reconnect and noCREATE/noTRUNCATE, managed-schema sentinels preserved. Actual-target/DataAPI HTTP denial unverified.
- Auth smoke on new fictional owner: pass anonymous/customer denial, MFA gate/enrollment/challenge, deactivation/session revocation. Separate mode0600 fixture credentials/state; original owner's MFA never reset.
- Browser final complete run:18/18 passed in1.3m on3001. Full output `/tmp/ecommerce-supabase-preparation-browser-verified`; selected screenshots committed in artifacts/supabase-preparation. Rendered inventory/order/checkout/history inspected.
- Notification local adapter failure/retry/dedupe: pass, exactly one local delivery; no external messages.
- App restart: exact fingerprints match for products35,variants35,cart_items3,orders34,order_items34,commitments34,movements39,refunds8,outbox90,local_deliveries4,user13,account13,twoFactor1; API health/catalog/owner200 and MFA session survived. Counts reflect fictional fixture state, not business metrics. Private expected data was not committed.
- Schema-only restore: pass to store_restore_quiesced with app/worker stopped; every app table matched and unrelated auth/storage/unrelated relation identities retained. Source/destination fixtures were retained after verification, then removed at final fixture-server teardown because its embedded configuration used persistent=false; private temporary dump was deleted. Reports/screenshots remain; no business/source database was involved. No Supabase system objects or source business data tested.

Failures/repairs: initial sandbox subprocess tests EPERM→authorized repeat pass; direct Node --env-file launch of Next rejected child NODE_OPTIONS→parent environment loading; empty DB lacked historical orders→self-contained checkout fixture; inherited cookies/stale discounts→explicit blank guest contexts; cookie issuance race→readiness assertion; one transient connection timeout/signup500 under local resource pressure→final full pass, no auth checks disabled; queued notification>25 behind batch→scoped fixture ID; extracted pg_dump missing libpq→matching LD_LIBRARY_PATH then fully quiesced repeat pass. One mistaken root browser invocation was interrupted; its generated root screenshots were restored from their previously clean committed versions. Earlier captures are unchanged. No failed run is counted as pass.

## Remaining work and continuation

S1–S10 remain unverified/not performed **on the intended target**; fixture evidence is separate. S11 passes for committed dependency state/current source; current user-modified install was inspected, not independently installed. S12 documents prepared state/known topology and explicitly missing target details. No target connectivity alone is presented as migration/commercial completion.

Next input: exact private file/compose path, dedicated/shared confirmation, PostgreSQL host/port/db/user/tenant/mode, credentials saved privately and Data API exposure configuration. Then read-only discovery → actual-version disposable compatibility/negative/restore proof → protected source backup and app-owned staging/remap/import → no-conflict data/auth/outbox comparison → one-writer switch/restart/browser checks → retain source and documented rollback. Stop only conflicting mutations if target ownership/data conflicts. Never restore clusters/managed schemas or reset auth to pass tests.

README contains placeholder-only env roles, runtime-vs-CLI authority, startup and reversible switch/rollback. No actual source backup/data transfer or production mutation occurred. Real payment sandbox, external delivery, deployment, commercial readiness and previously unmet percentage-discount/production requirements remain separate. No push or remote creation occurred.

## Final local verification and version control

Final task commit and residual status are reported after selective staging; user package files and generated next-env.d.ts remain separate. No secrets/private env/customer data/automation cookies or raw provider logs belong in tracked output.

Final checks: root format/lint/type and git diff --check passed; final isolated committed-dependency source overlay format/lint/type/25 unit/webpack build passed. Canonical11-file/one-PRD manifest and local Markdown file targets passed. New sanitized evidence summary: artifacts/supabase-preparation/verification.json.

Teardown: fixture app3001 stopped; only disposable PostgreSQL55434 stopped cleanly. The subtask server had been configured persistent=false, so shutdown automatically deleted its entire fictional cluster, including restore fixture databases. Requested fixture-data retention was therefore not achieved; private env/automation files and reports remain but no running/reusable fixture is claimed. Recreate a fictional fixture for another database run. Original database directory/configuration and process3000 were untouched. No actual-target acceptance status changed because of fixture teardown.
