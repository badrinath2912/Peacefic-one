# Peacefic One — Product Overview

**Tagline:** AI Powered Learning, Placement & Institution Management Platform

This document is the entry point for the specification. It defines what the product
is, who uses it, what is in scope, and the decisions that every other spec document
depends on. Read this before any other file in `docs/spec/`.

---

## 1. What the product is

Peacefic One is a multi-tenant B2B2C SaaS platform. The tenant is a **college**.
A college subscribes to the platform, onboards its departments, faculty and students,
and uses the platform to run training programmes, track attendance and assessments,
and manage campus placement. Students of that college get their own portal for
learning, assessment, certification and job applications.

Two portals ship in this scope:

| Portal | Primary users | Purpose |
| --- | --- | --- |
| College Portal | College admin, HOD, faculty, placement officer | Manage the institution: people, batches, attendance, training requests, placement reporting, analytics |
| Student Portal | Students | Learn, practice, get assessed, get certified, apply for jobs, track interviews |

Both portals are served from one Next.js application and share one design system,
one component library, and one backend API. They differ only in navigation, route
group, and the permissions attached to the signed-in user.

---

## 2. Tenancy model

**Decision: single database, shared collections, tenant discriminator column.**

Every tenant-scoped document carries a `collegeId: ObjectId`. Isolation is enforced
in the repository layer (see `01-architecture.md` §4), not left to individual
controllers. A query that reaches Mongo without a tenant filter on a tenant-scoped
collection is a bug, and the base repository is written so that this is hard to do
by accident.

Rejected alternatives, recorded so they are not re-litigated:

- *Database per tenant* — operationally heavy on Atlas at the expected tenant count,
  and makes cross-tenant platform analytics painful.
- *Collection per tenant* — breaks indexing economics and Mongoose model registration.

Non-tenant-scoped (global) collections: `users` (a user belongs to a college but the
login lookup is global by email), `roles`, `permissions`, `colleges`, `companies`,
`systemsettings`. Everything else is tenant-scoped.

---

## 3. Actors and roles

Roles are stored in the database (`roles` collection) and carry permission strings,
so a deployment can add roles without a code change. These are the roles seeded by
default:

| Role key | Portal | Scope | Summary |
| --- | --- | --- | --- |
| `platform_admin` | Internal | All colleges | Onboards and approves colleges, manages global settings and companies. Not part of the two shipping portals' UI, but required for college registration approval — see §5. |
| `college_admin` | College | Own college | Full control of their college: users, departments, batches, settings, billing contacts, reports. |
| `hod` | College | Own department(s) | Everything a faculty can do, plus manage faculty and batches inside their department, and approve training requests for it. |
| `faculty` | College | Assigned batches | Mark attendance, create and grade assignments, publish results, view their batches' analytics. |
| `trainer` | College | Assigned batches | Same as faculty for course delivery, but employed/assigned via a training request rather than the college's payroll. Distinguished for reporting, not for permissions. |
| `placement_officer` | College | Own college | Manages companies and job postings visible to the college, shortlists students, schedules interviews, records placements. |
| `student` | Student | Self | Learns, submits, applies, tracks. Reads only their own records. |

A user has exactly one primary role per college (`users.roleId`) plus an optional
list of extra permission grants (`users.extraPermissions`). Multi-role users are
modelled as multiple `userCollegeMembership`-style entries only if a real requirement
appears; **for this scope, one user = one college = one role.** This is a deliberate
simplification and is called out here so it is a conscious decision rather than an
accident.

The full permission matrix lives in `04-auth-rbac.md`.

---

## 4. Module inventory

### College Portal

Registration · Login · Dashboard · Student Management · Faculty Management ·
Department Management · Batch Management · Attendance · Training Requests ·
Placement Reports · Analytics · Reports · Notifications · Settings · Audit Logs ·
Support Tickets

Specified in `06-college-portal.md`.

### Student Portal

Registration · Login · Dashboard · Courses · Live Classes · Practice · Assignments ·
Assessments · Examinations · Attendance · Certificates · Resume Builder · Placement ·
Job Applications · Interview Tracking · Notifications · Settings

Specified in `07-student-portal.md`.

---

## 5. Onboarding flow (resolves an ambiguity in the brief)

The brief lists "Registration" under the College Portal but does not say who approves
a new college. Self-serve registration that instantly creates a live tenant is not
acceptable for a B2B platform — anyone could claim to be an institution and start
inviting students.

**Decision:**

1. A college representative self-registers at `/register/college`. This creates a
   `colleges` document with `status: 'pending'` and a `users` document with role
   `college_admin` and `status: 'pending_approval'`.
2. Email verification (OTP) proves the representative controls the email address.
3. A `platform_admin` approves or rejects the college. Approval flips the college to
   `status: 'active'` and the admin user to `status: 'active'`, and sends a welcome
   email.
4. Only then can the college admin sign in and start inviting faculty and students.

Students **cannot** self-register into a college arbitrarily. Student registration is
one of:

- **Invite flow (default):** college admin imports or creates the student; the
  student receives an invite link with a signed, single-use token and sets a password.
- **Join-code flow (optional, per-college setting):** the college enables a join code
  scoped to a batch; a student registering with that code lands in `pending` state and
  must be approved by a college admin or HOD before gaining access.

This means a `platform_admin` surface is required even though it is not one of the
two shipping portals. It is kept minimal: college approval queue, company master data,
global settings. See `06-college-portal.md` §14.

---

## 6. Stack decisions and conflict resolutions

The brief lists some libraries that overlap or contradict. Resolved as follows, and
these resolutions are binding on all other documents:

| Conflict | Decision | Why |
| --- | --- | --- |
| Recharts **and** Chart.js | **Recharts only.** Chart.js is dropped. | Two charting libraries means two theming systems and double the bundle. Recharts is React-native and composes with the design tokens. |
| Next.js `app/` **and** `pages/` **and** `routes/` in the client structure | **`app/` only** (App Router). No `pages/`, no `routes/`. | Mixing routers in Next 15 is a maintenance trap. Route grouping replaces `routes/`. |
| Redux Toolkit **and** React Query **and** Context | **Strict split**: TanStack Query owns all server state; Redux Toolkit owns client-only state (theme, sidebar, table view preferences, transient auth hints); Context is used only for the design-system providers. Never cache API responses in Redux. | Caching server data in Redux duplicates React Query's job and creates two sources of truth that drift. |
| Cloudinary **and** AWS S3 **and** local disk | **One `StorageDriver` interface, three implementations**, selected by `STORAGE_DRIVER` env var. Cloudinary for images/derivatives, S3 for documents and video in production, local for development. | Keeps the call sites storage-agnostic and makes the production/dev split a config concern. |
| "Never use fake data" **and** "Seeders" | Seeders create **reference data only** (roles, permissions, system settings, sample company master). Demo/fixture data lives in a separate, explicitly-invoked `seed:demo` script and never runs in production. Application code and UI never contain hardcoded arrays standing in for API data. | The rule's intent is "no mocked UI", not "no bootstrapping". |
| API versioning `v1, v2` | **Ship `v1` only.** The routing layer is structured so `v2` can be added without touching `v1`. | Versioning a product before its first release invents work. |
| Cypress vs Playwright | **Cypress**, as specified. | User's explicit choice; no reason to override. |
| `client/src/middleware/` folder + Next.js `middleware.ts` | Next.js requires `middleware.ts` at the `src/` root. Reusable middleware helpers live in `src/lib/middleware/`. | Framework constraint. |

---

## 7. Non-goals for this scope

Recorded so scope creep is visible when it happens:

- Payments, subscriptions, invoicing.
- Native mobile applications.
- The AI features themselves. The architecture must leave clean seams for them
  (`09-integrations.md` §5), but no AI provider is called in this scope.
- Video hosting/transcoding. Live Classes integrates with an external meeting provider
  and stores metadata plus recording URLs; it does not stream video itself.
- Multi-language / i18n. Strings are centralised so it can be added, but only English
  ships.
- SCORM / xAPI course-package import.

---

## 8. Open questions for the user

These do not block the specification but will change specific sections once answered.
Each is marked in-place in the relevant document with `> **OPEN QUESTION**`.

1. **Architecture diagram & Google Sheet.** Not yet provided. Sections most likely to
   change: the data model (`03`), and the College Portal module list (`06`).
2. **Live Classes provider.** Zoom, Google Meet, Jitsi, or BigBlueButton? Affects the
   integration adapter and whether recordings are retrievable via API.
3. **Examinations vs Assessments.** The brief lists both in the Student Portal. This
   spec models them as one engine with two configurations (see `07` §6) — confirm that
   matches the real-world distinction at your institutions.
4. **Attendance source of truth.** Manual faculty marking only, or also biometric /
   RFID device import? The latter needs an ingestion endpoint and device registry.
5. **Certificate authority.** Are certificates self-issued by the college, or
   co-branded/issued by Peacefic? Affects the certificate template and the public
   verification page.
6. **Expected scale.** Students per college and colleges per deployment. Drives index
   design and whether attendance needs time-bucketing.

---

## 9. Document map

| File | Contents |
| --- | --- |
| `00-overview.md` | This file. Product, tenancy, roles, scope, conflict resolutions. |
| `01-architecture.md` | System architecture, repo layout, layering rules, request lifecycle. |
| `02-design-system.md` | Tokens, colour, typography, components, chart styling, layouts. |
| `03-data-model.md` | Every collection, field, index, relationship, and invariant. |
| `04-auth-rbac.md` | Auth flows, token strategy, session model, permission matrix. |
| `05-api-conventions.md` | REST conventions, envelope, errors, pagination, filtering, bulk ops. |
| `06-college-portal.md` | Every College Portal module: screens, data, endpoints, rules. |
| `07-student-portal.md` | Every Student Portal module: screens, data, endpoints, rules. |
| `08-realtime.md` | Socket.IO namespaces, rooms, events, delivery guarantees. |
| `09-integrations.md` | Storage, email, PDF, jobs/cron, AI seams. |
| `10-security.md` | Threat model and the controls that answer it. |
| `11-testing-devops.md` | Test strategy, CI/CD, Docker, Nginx, PM2, deployment. |
| `12-build-plan.md` | Phased implementation order with acceptance criteria per phase. |
