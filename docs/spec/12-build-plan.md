# Build Plan

Depends on: all preceding documents.

---

## 1. How to use this plan

Each phase has **entry criteria**, **deliverables**, and **acceptance criteria**. A phase
is not done because the files exist; it is done when the acceptance criteria pass. The
acceptance criteria are written to be checkable — run this, see that — rather than
"module complete".

The order is dependency-driven, not feature-priority-driven. Phases 1–5 build almost no
user-visible functionality and are the reason phases 6–9 go quickly. Compressing them is
the most reliable way to make this project take longer.

**Working with Claude Code across sessions:** implement one phase, or one module within a
phase, per session. Start each session by stating which phase and module, and pointing at
the relevant spec documents. Long sessions that span many modules produce worse code than
several focused ones, because the context that matters gets diluted.

---

## Phase 1 — Foundation

**Entry:** none.

**Deliverables**

- npm workspaces root; `client`, `server`, `shared` workspaces.
- TypeScript configs (strict, path aliases) per workspace.
- ESLint including the boundary rules from `11-testing-devops.md` §4; Prettier; Husky;
  lint-staged; commitlint.
- `server`: Express bootstrap, `config/env.ts` with Zod validation, Winston + Morgan,
  error hierarchy and terminal error middleware, response envelope helpers, health
  endpoints, `AsyncLocalStorage` request context, graceful shutdown.
- `client`: Next 15 App Router, Tailwind with the tokens from `02-design-system.md` §2,
  shadcn/ui initialised, providers (Query, Theme, Redux), axios instance with
  interceptors, root layout with the pre-paint theme script.
- `shared`: constants, enums, the first Zod schemas.
- `docker-compose.yml` with Mongo, Redis, MailHog.
- `.env.example` complete, and the CI check that keeps it complete.
- CI workflow: lint, typecheck, build.

**Acceptance**

1. `npm install && npm run dev` at the root starts client and server.
2. `docker compose up` gives a working local stack.
3. Deleting a required variable from `.env` makes the server refuse to boot with a clear
   message naming the variable.
4. `GET /health/ready` returns 200 with Mongo and Redis both reported healthy.
5. `npm run lint && npm run typecheck` pass clean.
6. An import of a Mongoose model from a service file fails lint.

---

## Phase 2 — Data layer

**Entry:** Phase 1 accepted.

**Deliverables**

- Every model in `03-data-model.md`, with indexes, validation, virtuals, the base-fields
  plugin, and soft-delete hooks.
- `BaseRepository<T>` with automatic tenant scoping, soft-delete filtering, pagination,
  the whitelisted filter/sort/search query builder, and the explicit
  `withoutTenantScope()` escape hatch.
- One concrete repository per collection.
- The DI container.
- `npm run seed` (reference data) and `npm run seed:demo`, with the production guard.
- Migration runner and the initial migration.

**Acceptance**

1. `npm run seed` on an empty database is idempotent — running it twice changes nothing.
2. Every index in `03-data-model.md` exists (verified by a script that diffs declared
   indexes against `getIndexes()`).
3. **Tenant isolation test passes for every tenant-scoped repository**: two colleges
   seeded, no query returns the other's documents.
4. A soft-deleted document is absent from normal queries and its unique field is
   immediately reusable.
5. `npm run seed:demo` refuses to run with `NODE_ENV=production`.

---

## Phase 3 — Authentication and authorization

**Entry:** Phase 2 accepted.

**Deliverables**

- All flows in `04-auth-rbac.md`: college registration, email verification, student
  invite, join code, login, refresh with rotation and reuse detection, logout,
  logout-all, session listing, forgot/reset password, OAuth linking.
- Middleware: `authenticate`, `requireActiveAccount`, `tenantContext`, `authorize`,
  `validate`, rate limiters.
- `ScopeGuard` with all scope assertions.
- Audit logging service, wired to every event in `04-auth-rbac.md` §9.
- Client: auth pages, `middleware.ts` route guards, `PermissionGate`, the axios refresh
  interceptor with de-duplicated concurrent refresh.

**Acceptance**

1. Full registration → verification → approval → login journey works end to end.
2. Presenting a rotated refresh token revokes the whole family, writes a `critical`
   audit entry, and forces re-login.
3. Six failed logins lock the account for 15 minutes and email the user.
4. `POST /auth/forgot-password` returns an identical response and takes comparable time
   for an existing and a non-existent email.
5. Every protected endpoint returns 403 (or 404 where existence is hidden) for an
   under-privileged token — tested, not assumed.
6. Password reset revokes every session.
7. Auth module coverage ≥ 95%.

---

## Phase 4 — Design system and shell

**Entry:** Phase 3 accepted.

**Deliverables**

- All tokens, both themes, typography, spacing, radius, elevation.
- `AppShell`, `Sidebar`, `Topbar`, permission-filtered navigation, command palette.
- `DataTable` complete: server pagination/sort/filter via URL state, search, column
  visibility, density, selection, bulk actions, export, skeletons, empty and error
  states, `mobileRender`.
- Form system: `FormField` and every control wrapper.
- `PageHeader`, `StatTile`, `StatusBadge`, `EmptyState`, `ErrorState`, `ConfirmDialog`,
  `FileDropzone`, `DateRangePicker`, `Timeline`, `PermissionGate`.
- Chart wrappers with the validated palette, tooltips, legends, table-view toggle,
  empty states.
- Motion primitives honouring `prefers-reduced-motion`.
- A Storybook-style component gallery route (development only).

**Acceptance**

1. Every component renders correctly in both themes with no hardcoded colours — a lint
   rule rejects raw hex outside the token file.
2. `DataTable` drives a real endpoint with pagination, sort, filter, and search all
   reflected in the URL, surviving a refresh.
3. Keyboard-only navigation works across shell, table, form, and dialog.
4. `jest-axe` passes on every shared component.
5. Charts render correctly in both themes; the table-view toggle works; the light-mode
   relief rule (`02-design-system.md` §8.2) is satisfied wherever slots 3–5 are used.
6. Layouts are correct at 375px, 768px, 1280px.

---

## Phase 5 — Core institutional modules

**Entry:** Phase 4 accepted.

**Deliverables:** Departments, Batches, Faculty, Students — full stack for each
(repository → service → controller → routes → Swagger → client feature), including the
student and faculty import wizards with dry run, and export.

**Acceptance**

1. Full CRUD for all four, with scope enforcement per `04-auth-rbac.md` §5.
2. Student creation is transactional across `users`, `students`, and both `stats`
   counters; an induced failure mid-way leaves no partial write.
3. The import dry run reports row-level errors and writes nothing; confirmation imports
   only valid rows and reports the rest.
4. A 1,000-row import completes as a background job with live socket progress.
5. Batch capacity enforcement, with the audited override path.
6. Integration tests cover every endpoint; Swagger is generated and accurate.

---

## Phase 6 — Academics

**Entry:** Phase 5 accepted.

**Deliverables:** Courses, modules, materials, enrolments; Attendance (sessions, marking,
summaries, reports, defaulters, calendar heatmap); Assignments and submissions with
grading; Exams — the full engine covering practice, assessments, and examinations, with
questions, attempts, autosave, server-authoritative timing, proctoring signals, and
grading; Results with publication; Certificates with PDF rendering and public
verification.

**Acceptance**

1. Attendance marking is a single request per session and updates summaries
   transactionally.
2. Crossing the attendance threshold notifies student, advisor, and guardian.
3. Session auto-lock works; override requires the permission and a reason, and appends
   to `modifiedHistory`.
4. **The student-facing exam payload contains no `isCorrect` key** — asserted by a test
   that walks the whole response tree.
5. An exam submitted after `expiresAt` is recorded as `auto_submitted`; a client with a
   manipulated clock cannot extend its time.
6. Answers autosave; killing and reopening the browser resumes the attempt intact.
7. Late assignment submission applies and displays the stored penalty.
8. Publishing a result updates CGPA and re-evaluates placement eligibility in one
   transaction.
9. A certificate renders to PDF and verifies through the public endpoint; the public
   response exposes no PII beyond name, title, college, and dates.

---

## Phase 7 — Placement

**Entry:** Phase 6 accepted.

**Deliverables:** Companies; job postings with the multi-step form and live eligible
count; the eligibility engine; applications with kanban and bulk actions; interviews with
calendar, bulk scheduling, and conflict detection; placements with verification and offer
letters; placement reports and exports; the student-side jobs, applications, and
interviews screens; the resume builder.

**Acceptance**

1. Eligibility is evaluated server-side and snapshotted onto the application.
2. **Placement rate counts students, not offers**, and a student with three offers counts
   once — asserted by a test with exactly that fixture.
3. The live eligible-count preview matches the actual eligible list.
4. Interview conflict detection catches clashes with other interviews and exams.
5. Students see only their own applications and interviews — asserted by a test calling
   the endpoints with another student's ids.
6. Ineligible jobs display the specific failing criterion.
7. Reports export to PDF and XLSX with figures matching the on-screen analytics.

---

## Phase 8 — Operations and insights

**Entry:** Phase 7 accepted.

**Deliverables:** Training requests with the full state machine; notifications and
announcements with fan-out; Socket.IO complete per `08-realtime.md`; support tickets;
audit log viewer with cursor pagination; analytics across all five tabs; the report
builder with scheduling; settings for both portals.

**Acceptance**

1. Every illegal training-request transition returns 409.
2. A 5,000-recipient announcement fans out as a background job without blocking the
   request, and online users receive it over the socket.
3. Socket rooms are server-assigned; a client-supplied join is rejected — tested.
4. A socket whose access token expires re-authenticates without dropping, and a revoked
   session disconnects the socket.
5. Internal ticket notes are absent from the raiser's response — tested.
6. Audit logs cannot be updated or deleted through any route.
7. Analytics run as aggregation pipelines; no endpoint exceeds its p95 budget on the
   demo dataset.
8. Every chart satisfies `02-design-system.md` §8, including the one-axis rule.

---

## Phase 9 — Hardening

**Entry:** Phase 8 accepted.

**Deliverables:** every control in `10-security.md`; the complete E2E suite from
`11-testing-devops.md` §3; performance work against the budgets; accessibility audit;
Swagger and Postman finalised; user documentation.

**Acceptance**

1. All seven security test requirements (`10-security.md` §13) pass.
2. Coverage thresholds met, including 95% on auth, permissions, and tenant scoping.
3. All ten E2E journeys pass.
4. Performance budgets met.
5. WCAG 2.1 AA verified by automated and manual checks.
6. `npm audit` clean at high severity; CodeQL and gitleaks clean.
7. Swagger documents every endpoint accurately.

---

## Phase 10 — Deployment

**Entry:** Phase 9 accepted.

**Deliverables:** production Dockerfiles; Nginx and PM2 configuration; staging and
production workflows with the approval gate; migration runner integrated into deploy;
monitoring, error tracking, and alerts; backup configuration and a tested restore;
runbooks.

**Acceptance**

1. Staging deploys automatically on merge to `develop` and passes smoke tests.
2. Production deploys on tag with manual approval, and rolls back automatically on a
   failed health check.
3. A migration runs before the new version is live and is backwards-compatible with the
   previous one.
4. Alerts fire correctly in a deliberate failure test.
5. **A restore from backup has been performed successfully into a scratch environment.**
6. Zero-downtime reload verified under load.

---

## 2. Sequencing notes

**What can run in parallel:** within phases 5–8, modules are largely independent once the
foundation exists — Students and Faculty can proceed alongside each other, as can
Placement and Academics after Phase 5. With more than one developer, this is where to
split.

**What must not be parallelised:** Phases 1–4. Every later module depends on the base
repository, the auth middleware, and `DataTable`, and building modules against a moving
foundation means rewriting them.

**Where the risk concentrates:**

- *The exam engine* (Phase 6) is the most intricate piece in the product — server-side
  timing, autosave, resumability, random pools, proctoring, and mixed grading. Budget
  more than it appears to need.
- *The eligibility engine* (Phase 7) is deceptively hard because the rules vary per
  institution and per drive. It is the section most exposed to the Google Sheet
  specification, and building it before that arrives risks rework.
- *Attendance at scale* (Phase 6) is the main performance risk, being the highest-volume
  collection. The summary rollup is what makes it viable and should not be deferred as
  an optimisation.
- *Analytics* (Phase 8) is where aggregation pipelines get written under time pressure
  and end up as application-side loops. Hold the line.

---

## 3. Before Phase 5 — resolve the open questions

The eight items in `00-overview.md` §8 should be answered before the modules they affect
are built:

| Question | Blocks |
| --- | --- |
| Architecture diagram + Google Sheet | Phases 5–7 detail |
| Live class provider | Phase 6 live classes |
| Assessments vs Examinations | Phase 6 exam engine |
| Attendance source (biometric?) | Phase 6 attendance |
| Certificate authority | Phase 6 certificates |
| Expected scale | Phase 2 index design — **this one is worth answering first** |
| Eligibility rules | Phase 7 eligibility engine |
| Deployment target (Vercel or Hostinger) | Phase 10 |

Scale is listed as most urgent because index and rollup decisions are made in Phase 2 and
are the most expensive to revisit once there is production data.
