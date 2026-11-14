# Project Conventions

**Purpose:** concise future project conventions. **Status:** proposals; subordinate to repository instructions and explicit user requirements. **Updated:** 2026-11-14. **Related:** [Architecture](Architecture.md) · [DATA](DATA.md) · [API](API.md) · [SECURITY](SECURITY.md) · [Design](Design.md) · [DELIVERY](DELIVERY.md) · [Phases](Phases.md).

No existing application or contribution conventions were found; items below are proposals, not established repo policy.

- Organize by business module and keep Next.js route handlers thin; domain rules belong in server modules and database transactions, not UI components.
- TypeScript strict mode; validate external input at boundaries; infer trusted types from schemas; use explicit domain types for IDs, states and BDT minor units.
- Use canonical names/states from [DATA](DATA.md); money/time handling there is authoritative. Never use floating-point currency.
- Follow proposed operations in [API](API.md): consistent error envelope, ownership/role checks, idempotency for commerce mutations, server-side price/stock decisions.
- Keep provider code behind adapters; never fabricate capability or expose secrets. Follow [SECURITY](SECURITY.md) for authorization, logging, privacy and session safety.
- UI components follow [Design](Design.md), semantic/accessibility behavior and canonical status meanings.
- Verify proportionally to risk using [DELIVERY](DELIVERY.md); payment, inventory, permissions, refunds and privacy changes require focused integration/security evidence.
- Prefer maintained dependencies with a clear need; review license, update cadence, security and platform fit; avoid overlapping libraries and unnecessary infrastructure.
- Label assumptions and proposed choices; promote to confirmed only with owner/evidence; do not claim implementation/test/release without evidence.
- Update canonical docs together: product/business change → PRD and affected USERS/Phases; schema/state → DATA plus API/Architecture/DELIVERY; API change → API plus USERS/SECURITY/DELIVERY; visual change → Design; architecture → Architecture and affected docs; phase/acceptance change → Phases and DELIVERY; current evidence/history → Memory. Remove broken links and preserve decision history.
- Respect existing version-control and AGENTS instructions if introduced. This file creates no approval, deployment, spending, publishing, or external-contact authority and does not prohibit later authorized implementation.

## Established implementation conventions — 2026-11-14

Use the committed npm lockfile and Node24 LTS. Migrations are journaled under a database advisory lock and each file plus journal insertion commits atomically. New changes use new SQL files. Owner/customer are the only provisioned roles. Local test scripts must explicitly reject production and must preserve existing real owner data; see README. Current Next.js-generated AGENTS guidance requires installed current-version docs. Keep secrets in ignored .env.local or private test state, never screenshots/source.

The lint toolchain uses ESLint10 and a scoped minimatch11 override for the TypeScript parser dependency, verified by lint/build/tests; reassess the override when the upstream dependency is patched.
