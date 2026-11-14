# Project Conventions

**Purpose:** established implementation and maintenance conventions. **Status:** current local implementation contract; real-provider and commercial release gates remain open. **Updated:** 2026-11-14. **Related:** [Architecture](Architecture.md) · [DATA](DATA.md) · [API](API.md) · [SECURITY](SECURITY.md) · [Design](Design.md) · [DELIVERY](DELIVERY.md) · [Phases](Phases.md)

- Explicit user instructions and existing AGENTS govern; this file creates no deployment, spending, publication or contact authority.
- Use Node 24 LTS and committed npm lockfile. Installed current-version Next.js docs take precedence over remembered framework behavior.
- Keep route authorization and validation server-side; commerce/catalog modules own authoritative rules. Owner UI carries context and never substitutes for permission/state checks.
- BDT entry uses money-input exact decimal conversion; integer poisha remain API/database contract. Dates and quantities follow DATA; no float currency arithmetic or client-set payment/stock truth.
- Routine owner controls use recognizable records, typed fields and BDT. UUIDs/JSON remain implementation/advanced details, not required normal inputs. Preserve unedited structured values and immutable purchase snapshots.
- Reuse the access, specification, money and feedback components; follow Design for responsive states and SECURITY for auth/ownership/secrets.
- Migrations are additive, journaled and protected by advisory lock; file plus journal insertion commits atomically. Never reset existing owner/business records to make a migration/test pass.
- Keep transaction lock ordering and consequential idempotency; unknown payment/refund outcomes require reconciliation, not blind retry or capacity release.
- Verification follows DELIVERY proportional to risk: money/stock/refund/auth changes require meaningful real PostgreSQL and direct-request evidence; UI changes require rendered mobile/keyboard checks. Format/lint/types/build are separate evidence.
- Local adapter/fixture scripts reject production. Keep credentials in ignored env/private state; exclude generated test reports from lint/source control; screenshots must not expose secrets.
- Dependency changes need a concrete purpose, compatible locked versions and relevant checks. ESLint10/scoped minimatch11 override addresses the previously identified development advisory; reassess on upstream upgrades.
- Update PRD for product requirements/decisions, USERS for functional permission intent, DATA for schema/invariants/statuses, API for transport/commands, SECURITY for enforcement/privacy, Architecture for composition, Design for presentation, DELIVERY for evidence/release, Phases for sequence/gates, Memory for dated actual state. Keep related links and IDs consistent.
- Label future/unmet requirements explicitly. A document or local mock does not complete an application/provider/release. Preserve superseded history in Memory/Git rather than competing present-tense sections.
