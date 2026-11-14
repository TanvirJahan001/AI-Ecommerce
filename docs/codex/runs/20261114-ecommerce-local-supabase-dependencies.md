# Isolated dependency reproducibility evidence

Date: 2026-11-14. Read-only repository inspection; only `/tmp` files and isolated dependency/build outputs were created. No application `.env`, owner credentials, databases, migrations, browser fixture state or secrets were copied or used.

## State and command

Verified source: `git archive e1abc88263832e42b992b4d33e4a161ab05aa753`, expanded to `/tmp/ecommerce-e1abc88-deps-5tzTTN` (no Git worktree mutation). Runtime: `/tmp/node-v24.22.3-linux-x64/bin/node` v24.22.3, bundled npm v11.19.1, Linux x64. Committed `engines.node` is `>=24.0`; no committed `.npmrc`, `packageManager`, or `allowScripts` declaration. README specifies `npm ci --legacy-peer-deps`.

```bash
PATH=/tmp/node-v24.22.3-linux-x64/bin:$PATH npm ci --legacy-peer-deps --cache /tmp/store-clean-cache
```

Exit 0: added 424 packages, audited 425 packages in 4s, reported 0 vulnerabilities. Installation ran with authorized network/process escalation. npm11 warned that postinstall scripts for `@embedded-postgres/linux-x64@18.6.0-beta.19` and `esbuild@0.28.2` were not covered by allowScripts. No approval was added; tests/build below passed in this actual installed state. This does not prove embedded-postgres server initialization: no DB test was run in this isolated dependency checkout.

- `package.json` committed and after isolated install/checks: `c6facb08f40e930ea9c11f42a082990c40d4f58859208a6f89574c871584eb9a`; equal: True. Working-copy SHA256 at inspection: `b364df3ec59343afa5babfff3bee135743774b323a4c9fa91857978cc9a9ec97`.
- `package-lock.json` committed and after isolated install/checks: `d8fb8187bce975de968487dcd4148fcb03e24a0f249dd2378904cd5a4cb0cc13`; equal: True. Working-copy SHA256 at inspection: `307c963e1e08ea37ee443c9d056a4e9cb8c8e55b7964a880af101d482eb994f5`.

## Manifest/lock differences left untouched

The working-copy package manifest adds only two direct dependencies: `@supabase/ssr: ^0.12.7` and `@supabase/supabase-js: ^2.119.0`. These user changes were preserved. They are not necessary to connect the existing server-side pg pool to a PostgreSQL host, and adding them does not itself replace authentication.

Lockfile: 100 changed package paths. Changed field counts (a path may contribute several fields): dependencies 8, libc 40, dev 44, devOptional 40, engines 13, integrity 20, resolved 20, version 20, peerDependencies 2, peerDependenciesMeta 1, funding 5, license 4.

New package identities:

- `@supabase/auth-js@2.119.0`
- `@supabase/functions-js@2.119.0`
- `@supabase/phoenix@0.4.5`
- `@supabase/postgrest-js@2.119.0`
- `@supabase/realtime-js@2.119.0`
- `@supabase/ssr@0.12.7`
- `@supabase/storage-js@2.119.0`
- `@supabase/supabase-js@2.119.0`
- `cookie@1.1.1`
- `iceberg-js@0.8.1`
- `tslib@2.8.1`

Nested tslib2.8.1 occurs under the new Supabase auth/functions/postgrest/realtime/storage packages. No previously present name/version identity was removed, and no existing identity's resolved URL or integrity digest changed. The 20 resolved/integrity path changes are new/removed/rehoisted package records, not changed artifacts for an existing name/version identity.

Picomatch placement changes: top-level `picomatch` changes from2.3.2 to4.0.7;2.3.2 moves to `micromatch/node_modules/picomatch`; nested4.0.7 copies under `tinyglobby`, `vite` and `vitest` disappear in favor of the top-level copy. Existing integrity digests are retained for both versions.

40 native-platform package records remove `libc` metadata:26 `['glibc']`,14 `['musl']`. Affected families include sharp/libvips, Next SWC, rolldown, unrs resolver, and lightningcss.40 records change `dev:true` into `devOptional:true`; this is dependency classification/platform metadata, with unchanged versions/artifacts. The diff alone cannot establish which npm version or flags produced the user changes. System defaults observed by the parent are Node22.22.1/npm9.2.0, which differ from the documented runtime; attributing lockfile changes to them would be an inference, not proof.

| Package              | Committed locked version | Working-copy locked version |
| -------------------- | ------------------------ | --------------------------- |
| `next`               | 16.4.6                   | 16.4.6                      |
| `react`              | 19.3.1                   | 19.3.1                      |
| `react-dom`          | 19.3.1                   | 19.3.1                      |
| `better-auth`        | 1.7.23                   | 1.7.23                      |
| `pg`                 | 8.23.1                   | 8.23.1                      |
| `typescript`         | 5.9.3                    | 5.9.3                       |
| `eslint`             | 10.15.0                  | 10.15.0                     |
| `eslint-config-next` | 16.4.6                   | 16.4.6                      |
| `vitest`             | 4.1.12                   | 4.1.12                      |
| `@playwright/test`   | 1.65.1                   | 1.65.1                      |
| `embedded-postgres`  | 18.6.0-beta.19           | 18.6.0-beta.19              |

## Actual isolated checks

All commands used the isolated committed checkout and Node24/npm11 PATH.

| Command                                                                                                                             | Actual result                                | Evidence                     |
| ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ---------------------------- |
| `npm run format:check`                                                                                                              | Pass, exit0                                  | `/tmp/dependency-format.log` |
| `npm run lint`                                                                                                                      | Pass, exit0                                  | `/tmp/dependency-lint.log`   |
| `npm test`                                                                                                                          | Pass,12 tests in2 files                      | `/tmp/dependency-unit.log`   |
| `npm run typecheck`                                                                                                                 | Pass, exit0                                  | `/tmp/dependency-type.log`   |
| `NEXT_TELEMETRY_DISABLED=1 BETTER_AUTH_SECRET=isolated-build-placeholder-only-not-an-application-secret npm run build -- --webpack` | Pass, exit0; webpack and TypeScript complete | `/tmp/dependency-build.log`  |

Build ran outside the process sandbox after the sandbox attempt failed with `Could not parse output from TypeScript's --showConfig`. An initial escalated build without the fictional auth placeholder exited0 but emitted missing-secret BetterAuth warnings; final build with explicitly fictional build-only placeholder removes those warnings. No `DATABASE_URL` was supplied and no database/application server was started. Next warned it inferred `/tmp` as the workspace root due to pre-existing `/tmp/package-lock.json`; this is an isolated-checkout environment warning. All route compilation completed. These checks do not establish runtime authentication, DB, Supabase connectivity, browser or external-provider behavior.

## Conclusion and limits

S11 committed-state installation reproducibility passes for `e1abc88` using the documented legacy-peer-deps flag and supported Node24 runtime. No lock correction is required to obtain this demonstrated result. Working-copy Supabase dependencies and metadata changes are preserved, not overwritten, silently included, or represented as committed state. The current user-modified dependency state was inspected but not separately installed by this subtask. Parent's integration changes require their own checks; this report proves the specified committed baseline only.
