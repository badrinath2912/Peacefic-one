# Peacefic One — Specification

**AI Powered Learning, Placement & Institution Management Platform**

A multi-tenant MERN SaaS platform with two portals — College and Student — sharing one
design system, one component library, and one API.

Stack: Next.js 15 (App Router) · React 19 · TypeScript · Tailwind · shadcn/ui ·
Express · Mongoose · MongoDB Atlas · Redis · Socket.IO · BullMQ.

---

## Read in this order

| # | Document | What it settles |
| --- | --- | --- |
| 00 | [Overview](00-overview.md) | Product, tenancy model, roles, scope boundaries, and the resolutions for every conflicting requirement in the brief |
| 01 | [Architecture](01-architecture.md) | System shape, repo layout, backend layering, tenant isolation, frontend organisation, request lifecycle |
| 02 | [Design System](02-design-system.md) | Tokens, both themes, typography, components, validated chart palette, layout |
| 03 | [Data Model](03-data-model.md) | All 38 collections with fields, indexes, invariants, transactions |
| 04 | [Auth & RBAC](04-auth-rbac.md) | Token strategy, every auth flow, the permission catalogue, scoped authorization |
| 05 | [API Conventions](05-api-conventions.md) | Envelope, errors, pagination, filtering, bulk operations, rate limits, docs |
| 06 | [College Portal](06-college-portal.md) | Every college module: screens, endpoints, business rules |
| 07 | [Student Portal](07-student-portal.md) | Every student module: screens, endpoints, business rules |
| 08 | [Real-time](08-realtime.md) | Socket.IO rooms, event catalogue, delivery guarantees |
| 09 | [Integrations](09-integrations.md) | Storage, email, PDF, background jobs, AI seams, environment variables |
| 10 | [Security](10-security.md) | Threat model and the control answering each threat |
| 11 | [Testing & DevOps](11-testing-devops.md) | Test strategy, CI/CD, Docker, Nginx, PM2, monitoring, budgets |
| 12 | [Build Plan](12-build-plan.md) | Ten phases with entry and acceptance criteria |

`00`, `01`, and `03` are prerequisites for everything else. `05` is binding on `06` and
`07`.

---

## Decisions worth knowing before you read anything else

These resolve contradictions or gaps in the original brief. Full reasoning is in the
linked sections.

- **Tenancy** is a shared database with a `collegeId` discriminator, enforced in the base
  repository rather than by caller discipline. — [00 §2](00-overview.md), [01 §4](01-architecture.md)
- **A platform-admin surface exists**, minimally, because self-serve college registration
  without approval is not acceptable for a B2B product. — [00 §5](00-overview.md)
- **Recharts only.** Chart.js is dropped. **App Router only** — no `pages/`. **Server
  state lives in React Query, never Redux.** — [00 §6](00-overview.md)
- **The Next.js app is a client.** It never touches MongoDB. — [01 §1](01-architecture.md)
- **38 collections, not the brief's 28.** The additions cover data with nowhere to live
  (enrolments, submissions, exam attempts) and splits forced by query patterns
  (attendance sessions / records / summaries). — [03 §8](03-data-model.md)
- **Trainers are faculty with a `type` discriminator**, not a separate collection. —
  [03 §3.5](03-data-model.md)
- **Practice, assessments, and examinations are one engine** with three configurations. —
  [03 §4.8](03-data-model.md)
- **Refresh tokens are opaque and rotated**, with family revocation on reuse. Access
  tokens live in memory only. — [04 §1](04-auth-rbac.md)
- **Exam timing is server-authoritative and answer keys never reach the client.** —
  [07 §6](07-student-portal.md)
- **Placement rate counts students, not offers.** — [06 §9](06-college-portal.md)
- **The chart palette was validated** against this product's own surfaces, not inherited
  defaults; the light-mode contrast warning on three slots is binding. —
  [02 §8.2](02-design-system.md)

---

## Open questions

Eight items in [00 §8](00-overview.md) need answers. The most urgent is **expected
scale**, because index and rollup design happen in Phase 2 and are expensive to revisit
against production data. The **architecture diagram** and **Google Sheet functional
specification** referenced in the brief have not yet been provided; sections most exposed
to them are marked `[REVISIT]` in place.

---

## Working from this spec

Implement one phase — or one module within a phase — per session, and start each session
by naming the phase and the relevant documents. The acceptance criteria in
[12](12-build-plan.md) are written to be run and checked, not assessed by eye; a module
is done when they pass.
