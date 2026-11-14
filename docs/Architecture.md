# System Architecture

**Purpose:** authoritative current structure and architectural decisions. **Status:** current local implementation contract; real-provider and commercial release gates remain open. **Updated:** 2026-11-14. **Related:** [PRD](PRD.md) · [DATA](DATA.md) · [API](API.md) · [SECURITY](SECURITY.md) · [DELIVERY](DELIVERY.md) · [Phases](Phases.md)

## Implemented structure

One merchant, BDT, Bangladesh, one initial stock location. A Next.js App Router/TypeScript modular monolith uses PostgreSQL for durable commerce, Better Auth for password/session/TOTP/recovery codes, and an owner-only console. Locked versions are in package-lock.json (Next 16.4.6, React 19.3.1, Better Auth1.7.23); verified local runtime is Node 24.22.3/PostgreSQL 18.6. No hosting/account/service has been assumed or provisioned.

```mermaid
flowchart LR
 Browser[Storefront / owner browser] --> Routes[Next.js route handlers]
 Routes --> Auth[Better Auth + permission checks]
 Routes --> Core[Commerce / catalog modules]
 Core --> DB[(PostgreSQL)]
 Routes --> Dev[Guarded development payment events]
 DB --> Worker[One-batch outbox worker]
 Worker --> Sink[Local notification sink]
 Owner[Owner] --> Courier[Manual courier booking and tracking]
```

Server modules own prices, locks, commitments, funding/refund capacities and transitions. UI components carry selected identities and show eligibility; they never grant permission or set paid stock. Browser filters/search/sort operate on the small published catalog; PostgreSQL/search-service search remains a measured future option, not current architecture. Public media is sourced URL/alt/order with browser previews; object storage/native uploads are not implemented. Native claims from the former proposed stack are superseded.

## Boundaries, flows and transactions

Catalog modules separate product family, variant, exact model fit and structured source-backed specs. Owner editor/inventory/order/COD components are independent from shared customer/access/money presentation. The money-input boundary parses BDT strings exactly; server/API/database use integer poisha.

Checkout locks SKUs and discount, reprices, captures snapshots, holds inventory, creates order/attempt and outbox atomically. Payment events verify local input, dedupe and either commit the same hold or enter reconciliation without fulfillment. Cancellation releases only predispatch holds; refunds reserve global funding and exact unit capacity under transaction locks. Return receipt/inspection/disposition and payout are separate operations. COD collection funds customer payment; remittance later matches courier receivables. Network/provider calls do not occur while holding commerce transactions open. Owner detail fetch locks its selected order for a consistent short transaction; stale UI actions still revalidate.

API is consolidated /api/store, detailed in API. Auth endpoints are library-owned. The database outbox worker runs one batch via notifications:run, with durable failures and local-only template rendering. Automatic scheduling/real delivery is a production task. Manual courier is valid implemented scope.

## Components and deployment

`src/app` contains routes; `src/components` holds customer, access and owner task workspaces; `src/modules/commerce` owns money/stock/order transitions; `src/modules/catalog` owns typed fit/spec/media edits; `src/modules/store` reads catalog; `src/lib` owns DB/auth/money; `db/migrations`, `scripts` and `tests` reproduce setup and evidence. Customer/admin use the same commerce database and domain code. Temporary UI state cannot substitute for committed records.

Private order/account/admin APIs use no shared cache. Published catalog content can later be cached with invalidation, but currently client fetches authoritative API data. Production topology would be TLS web hosting + private PostgreSQL + worker + reviewed external adapters; it is not deployed. Dev/test/prod credentials/databases must be isolated.

## Decisions

| ADR  | Current decision                                         | Tradeoff/status                                                                     |
| ---- | -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| A-01 | Next.js/TypeScript/PostgreSQL modular monolith           | Confirmed user baseline, implemented; simple transactions over independent services |
| A-02 | Small catalog browser search/filter/sort                 | Implemented; scale/relevance limits documented, database search future              |
| A-03 | Provider-independent state + guarded development adapter | Local tested only; bKash/SSLCOMMERZ selection/onboarding/sandbox open               |
| A-04 | Manual courier booking/tracking                          | Implemented; automation not required for local operation                            |
| A-05 | Better Auth PostgreSQL + owner MFA                       | Implemented/tested; real password-reset/recovery delivery still open                |
| A-06 | PostgreSQL outbox + one-batch worker/local sink          | Implemented/tested; scheduling/real notification adapter before commercial release  |

Earlier proposals for managed auth/storage/search and alternative REST endpoints are superseded, not parallel current contracts. Useful prior alternatives are preserved in Git `20c856b` and Memory history. Sources accessed2026-11-14: installed Next.js current docs `node_modules/next/dist/docs`, https://nextjs.org/docs/app, https://better-auth.com/docs/integrations/next, https://better-auth.com/docs/plugins/2fa, https://www.postgresql.org/docs/current/. Provider discovery sources https://www.bkash.com/business and https://developer.sslcommerz.com/ do not establish eligibility, endpoints, fees or access.

Risks/release work: unverified real adapters, merchant approval, approved policies/rates/coverage/battery acceptance, product-source quality, native uploads if later authorized, operational monitoring/backup/retention and legal/tax/invoice review. Growth should follow measurement; no microservices/multiwarehouse dependency was added.

## A-07 — Supabase as PostgreSQL host (2026-11-14)

**Decision:** confirmed by user for this task; connection/switch to the intended installation remains unverified. Retain the modular monolith, `pg`, transaction/advisory-lock behavior and Better Auth. No Supabase Auth/SSR replacement, client commerce access or paid infrastructure is required. The working-copy Supabase SDK additions predate this task and are unused; committed dependency evidence is in the run record.

A shared server/CLI [database-config](../src/lib/database-config.ts) constructs commerce10 and auth5 pools per process, plus migration1. Every connection starts with the validated schema followed only by `pg_catalog`; private schema lookups cannot fall through to `public`. Runtime and migration roles are distinct for Supabase. The supported local topology requires the same explicitly verified direct/session endpoint/database with different users; transaction pooling is rejected because migrations/bootstrap use **session** advisory locks and connections carry schema state. Business commands retain their transactional row/advisory locks. URL query options cannot silently override TLS/schema settings. README owns executable setup instructions.

The recommended private schema is `store_private`, with fresh `ecommerce_owner` migration and `ecommerce_runtime` DML-only roles. The preparation tool emits SQL but never applies it; collisions require inspection, not overwriting. Better Auth's factory accepts the appropriate pool: runtime never migrates, migration introspection uses the private `current_schema()`, and Supabase-managed `auth` remains separate. Preserve `BETTER_AUTH_SECRET`, origin/cookie configuration and all identity relations when switching. Better Auth cookies do not create a Supabase session or `auth.uid()`.

**Actual topology known:** original configuration points to stopped-at-inspection embedded PostgreSQL `127.0.0.1:55432/mobile_store`, public application schema. Supabase HTTP `localhost:8000` was unreachable; no intended compose location, PostgreSQL endpoint/version/tenant, dedicated/shared status or exposure list has been established. No real switch occurred. A disposable standalone PostgreSQL18.6/private-schema fixture at55434 proves preparation behavior only; it is not the intended installation. Hosting version compatibility remains a target-version test gate.

Tradeoffs: one database host and one login system keep the existing code/invariants; restricted roles/private schema add explicit provisioning and app-only backup steps. Operator must verify real PostgREST exposure and role access, not assume private naming or RLS defaults provide protection. Multi-process pool sizing, TLS and verified target topology remain deployment decisions. The source-public to destination-private transfer requires isolated staging and conflict checks; see README/DELIVERY. No microservices or second auth authority was introduced.

Research accessed2026-11-14: [Supabase changelog](https://supabase.com/changelog.md), [self-hosting with Docker](https://supabase.com/docs/guides/hosting/docker), [Data API security](https://supabase.com/docs/guides/api/securing-your-api). Official guidance distinguishes schema exposure/grants from row-level security. The skill's CLI migration preference does not replace this project's explicitly retained SQL runner/journal. No official source establishes the user's actual version/configuration; the self-hosting Markdown endpoint could not be fetched in this run.
