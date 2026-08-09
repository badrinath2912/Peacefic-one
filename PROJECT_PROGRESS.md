# Peacefic One — Project Progress

Updated after every session. Latest: **Session 36 — security incident containment**

---

## 🔴 Production readiness: BLOCKED

A real `.env` was committed to the **public** GitHub repository and remains in history, reachable
from `origin/main` (commit `a324fcd`). Four secrets are exposed: `MONGODB_URI`,
`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_INVITE_SECRET`.

```
Credential exposure:   CONFIRMED
Credential compromise: ASSUMED
Unauthorized access:   NOT CONFIRMED — requires Atlas evidence
```

**No deployment until all four are rotated.** The JWT access secret alone permits forging a token
for any user in any tenant, which bypasses `ScopeGuard`, RBAC and every ownership check at the
signature boundary. Full detail in the session 36 entry.

---

## Overall development completion: ~85%

Scope was fixed in session 38 to **ERP + Placement only**. The figures below are measured against
that scope, not against the full permission catalogue — which describes a much larger LMS product
that is explicitly out of scope.

| Measurement | Status | Note |
|---|---|---|
| Core implemented modules | ~98% | Unchanged |
| Navigation / UI coverage | ~92% | 3 in-scope dead routes remain |
| Permission catalogue coverage | ~75% | 96 enforced of ~129 in-scope |
| **Overall functional development** | **~85%** | ~6–8 sessions of in-scope work remain |
| Automated verification | Excellent | |
| Production readiness | **BLOCKED** | Credential rotation outstanding |

Provisional until the 32 out-of-scope permissions, four orphaned schemas and three navigation
entries are actually removed — see session 38. Against the *original* full-catalogue scope the
figure was ~72%; the denominator shrank, which is a scope change rather than progress.

**The ~98% figure describes only the modules already built — it is not the project total.** The
honest summary:

> A substantially implemented and well-tested two-portal platform at roughly 72% overall
> development completion. Core implemented modules are approximately 98% complete, but several
> planned modules and navigation areas remain unfinished. Production deployment is currently
> blocked by a confirmed public credential exposure.

| Layer | State |
|---|---|
| Shared contracts (Zod, enums, permissions) | Stable |
| Backend core (auth, tenancy, RBAC, audit) | Stable |
| Backend modules implemented | 17 routers mounted |
| Backend modules unimplemented | Tickets, Assignments, Online exams, Materials, Live classes, Certificates, Announcements; College settings / User CRUD / Role CRUD have model + repository only |
| Frontend | 90 pages; 6 dead navigation routes |
| Permissions | 96 of 161 enforced; 65 dead |
| Infrastructure (sockets, jobs, CI/CD, docs) | Not started |

**Last verified baseline** (end of session 35 — not re-run since; session 36 changed no
functional code)

```
jest                ✓  599 server tests, 20 suites
vitest              ✓  504 client tests, 31 files
typecheck           ✓  server + client
eslint              ✓  0 warnings, 0 errors
build:client        ✓  56 static pages
git diff --check    ✓
```

Placement is complete end to end, on both sides. The office runs a drive from a company record
through job postings, the sixteen-criterion eligibility builder, the eligible-student roster, the
application pipeline, interview rounds with panel scheduling, and the offer lifecycle. The student
browses drives, sees the server's eligibility verdict, applies, tracks the application, confirms or
asks to move an interview, and answers an offer — every request `/me`-scoped, with no `studentId`
the browser could substitute.

What remains is mostly outside Placement: **9 dead navigation routes** across the college and
student portals, and the infrastructure layer. Reports and Analytics are now live.

What remains on the office side is offers and the placement dashboard at `/college/placements`,
which four navigation links still point at.

---

## Completed modules

| Module | Backend | Frontend | Tests |
|---|---|---|---|
| Authentication & sessions | ✓ | ✓ | 17 |
| Tenant isolation | ✓ | n/a | 9 |
| Departments | ✓ | ✓ | 8 |
| Batches | ✓ | ✓ | 9 |
| Students | ✓ | ✓ | 30 |
| Attendance | ✓ | ✓ | 30 |
| File storage (local / S3 / Cloudinary) | ✓ | ✓ | 33 |
| Faculty | ✓ | ✓ | 28 |
| Courses | ✓ | ✓ | 23 |
| Training | ✓ | ✓ | 38 |
| Examinations | ✓ | ✓ | 154 |
| Student results & transcript | ✓ | ✓ | 31 |
| Companies & Job Postings (9A-9B) | ✓ | — | 51 |
| Student Applications (9D) | ✓ | — | 27 |
| Offers / Placements (9F) | ✓ | — | 30 |
| Placement UI — Companies | n/a | ✓ | 37 |
| Eligibility engine (9C) | ✓ | n/a | 51 |

**Student module** — list, create, edit, profile, export (CSV/XLSX), bulk actions, photo upload, import wizard.
**Faculty module** — list, create, edit, profile, delete, export, bulk delete, photo upload.
**Department module** — list, create, edit, detail with analytics and batch panel, export, bulk delete. HOD assignment routed through its own endpoint because it grants a role.
**Batch module** — list with capacity meter, create, edit, detail with student panel, promote/graduate with typed confirmation, export, bulk delete.
**Attendance** — session list, marking sheet, corrections, locking, defaulter reports.
**Dashboard** — live counts plus latest departments and batches panels.

---

**Course module** — list with catalogue stats, create, edit, detail, delete, export, bulk delete. Relationships to departments, batches, faculty and prerequisite courses. Department-scoped visibility with college-wide courses visible to everyone.

---

**Training (Phase 6A)** — backend complete: requests with a guarded approval workflow, sessions with trainer conflict detection, enrolment with capacity enforcement, calendar, analytics, export. 38 tests.

---

## In progress

**Placement** — Companies, Job Postings, Eligibility Engine, Applications and Offers are
complete (9A-9D, 9F). Interviews (9E) are not started. **No Placement UI at all** — roughly 50
endpoints have no interface and three sidebar links are dead.

---

## Pending modules

**Not started** — Placement, Companies, Company Portal, Reports & Analytics, Notifications UI, Support Tickets, Student Portal inner pages, Admin/platform portal, Certificates.

**Infrastructure** — Socket.IO, background jobs (cron), Swagger, Docker, CI/CD, E2E tests, PDF export.

---

## Architecture decisions

| Decision | Reasoning |
|---|---|
| Tenant scoping lives in `BaseRepository` | A query cannot reach Mongo without a tenant filter by accident. Escape hatch is explicit and greppable (`withoutTenantScope`). |
| Cross-tenant fetch returns 404, not 403 | A 403 confirms the record exists. |
| Permissions answer *what*, `ScopeGuard` answers *which rows* | `attendance:mark` does not mean any batch — only assigned ones. |
| Separate `*_own` permissions | `student:read_own`, `attendance:read_own`. Granting self-access must not open list endpoints that name other people. |
| Shared Zod schemas drive both sides | Client and server validation cannot drift. |
| Storage behind a driver interface | Swapping local → S3 → Cloudinary is an env var, not a code change. |
| Server-driven pagination and sorting | Sorting one page client-side misrepresents the dataset. |
| Access token in memory only | XSS cannot read it; refresh cookie is httpOnly. |
| Single-flight token refresh | Parallel refreshes would replay a rotated token and trip reuse detection. |
| Bulk actions return per-row outcomes | One blocked row must not fail the batch. |

---

## Security decisions

- **Aadhaar is never stored in full.** Last 4 digits for display, keyed HMAC for duplicate detection, Verhoeff checksum at entry. Excluded from all exports.
- **Refresh token reuse revokes the whole family.** Theft and race are indistinguishable, so the system assumes theft.
- **Login is rate-limited per IP *and* per email.** IP-only fails against distributed stuffing; email-only enables lockout griefing.
- **Uploads are validated by magic number, not declared MIME.** Per-purpose size and type limits. Virus-scan extension point.
- **S3/Cloudinary objects are private**, reached via 15-minute signed URLs with `Content-Disposition: attachment`.
- **Exports neutralise formula injection** (`=`, `+`, `-`, `@` prefixed with `'`).
- **Audit log is append-only**, enforced at the model.
- **Privilege escalation guard** blocks assigning a role holding *dangerous* permissions the actor lacks.
- **Password reset revokes all sessions.**

---

## Technical debt

| Item | Impact | Notes |
|---|---|---|
| Import wizard parses CSV only | Medium | `.xlsx` needs a client parser (SheetJS). UI tells users to save as CSV. |
| No PDF export | Medium | Needs a font-embedding decision; CSV/XLSX complete. |
| No client-side image cropping | Low | Server centre-crops to 512×512 via Cloudinary preset. Local/S3 store originals. |
| Cron jobs written but unscheduled | Medium | Attendance auto-lock and nightly summary exist as service methods; nothing invokes them. |
| Denormalised counters reconciled only in-transaction | Low | No nightly reconciliation job yet. |
| No resumable upload | Low | Files ≤10 MB; a retry costs seconds. |
| Department/Batch import wizards | Low | Only Students has one; the wizard component is reusable. |
| No dedicated permission test suite | Low | Permission denial is asserted inside each module's integration tests rather than separately. |
| No automated accessibility tests | Medium | Semantics are built in (radiogroup, aria-current, dl, native dialog, labelled controls) but nothing asserts them. A client test runner now exists (vitest + Testing Library, session 14), so axe-core is a small addition. |
| Client tests cover Examinations only | Medium | Vitest was introduced in session 14. Students, Faculty, Courses, Training and Attendance have no component tests. |

---

## Known issues

1. **Atlas connection verified** as of session 15.
2. **Atlas password exposed in chat.** Still must be rotated.
3. **`COOKIE_SAME_SITE` must be `none` for split deployment.** Vercel + Render are cross-site; a `strict` cookie is silently dropped and refresh dies in production while working locally.
4. **Docker Compose unverified** — Docker is not installed in the dev environment.
5. **Test suite timing — FIXED in session 13.** `testTimeout` had been set inside each
   `projects` entry since session 8, where **Jest silently ignores it** (it emits only a
   validation warning). Every test therefore ran on the 5s default, not the 60s intended.
   Suites passed on a fast machine and failed under contention, so green runs in sessions
   8–12 were partly luck rather than proof. `testTimeout` now sits at the root of
   `jest.config.js`, where it applies to both projects.

6. **The server suite must run alone.** Each integration suite boots its own in-memory
   MongoDB replica set. Two `jest` processes — or `jest` alongside `vitest` — contend for CPU
   and disk and produce mass spurious failures: session 14 saw 96 of 336 "fail" across two
   overlapping runs that each passed cleanly in isolation, and the run times gave it away
   (1392s and 1571s against a ~300s clean baseline). **A red run is not a result until it has been
   reproduced with nothing else running.** Session 15 saw it again: two auth failures in a 1381s
   run, then 17/17 in 31s in isolation and 345/345 in 305s on a cleared machine. The run time is
   the tell — anything much past ~350s means the box is loaded and the result is noise.

---

## Milestones

- [x] S1 — Foundation, shared contracts, tenant-safe repository
- [x] S2 — Auth verified end to end, 29 tests
- [x] S3 — Departments + Batches backend
- [x] S4 — Students + Faculty backend
- [x] S5 — Attendance backend
- [x] S6 — Client foundation, login, dashboards
- [x] S7 — Student module complete (incl. storage, photo, import)
- [x] S8 — Faculty module complete
- [x] S9 — Departments + Batches complete, dashboard live
- [x] S10 — Courses complete
- [x] S11 — Training backend (Phase 6A)
- [x] S12 — Training UI + attendance discriminator
- [x] S13 — Examinations backend (Phase 7A)
- [x] S14 — Examinations UI (Phase 7B)
- [x] S15 — Student Portal results and transcript
- [x] S16 — Placement: Companies, Jobs, Eligibility (9A-9C)
- [x] S17 — Placement: Applications (9D)
- [x] S18 — Placement: Offers (9F)
- [ ] S19 — Placement UI (office side)
- [ ] S20 — Placement UI (student side)
- [ ] S21 — Placement: Interviews (9E)
- [ ] S19 — Placement UI
- [ ] S20 — Reports, Analytics, Infrastructure

---

## Scope note — Training (Phase 6)

Training was requested alongside Courses in session 10 and was **not started**. Courses alone took a full session: new model, repository, service, controller, routes, 23 tests and four pages.

Training as specified spans eleven sub-features, and three of them depend on modules that do not exist:

| Sub-feature | Blocked by |
|---|---|
| Assessments | `Exam` / `Question` / `Attempt` models — the Examinations module, explicitly deferred |
| Certificates | `Certificate` model — not built |
| Training attendance | Would either reuse `AttendanceSession` (needs a training discriminator) or duplicate it |

Buildable now without new dependencies: Training Requests (approval workflow), Trainer Assignment, Training Sessions, Calendar, Student Enrolment, Completion Reports, Analytics. The shared `training.schema.ts` already covers the request workflow.

**Recommendation:** treat Training as its own session, and build Examinations first if certificates and assessments are wanted as specified. Otherwise Training ships with those two deferred.

---

## Next priority

**Student Portal — results and transcript.** `result:read_own` and `transcript:read_own` exist,
the endpoints serve them, and students are notified the moment results publish — but that
notification currently leads nowhere. It is the smallest remaining gap between what the backend
does and what a student can actually see.

Alternatively, **infrastructure** (Socket.IO, cron jobs, Swagger) remains worth doing: the nightly attendance auto-lock and summary jobs exist as service methods but nothing schedules them, which is a silent correctness gap in production.

## API surface added in session 10

| Method | Route |
|---|---|
| `GET` | `/courses` · `/courses/:id` · `/courses/:id/profile` · `/courses/analytics` |
| `POST` | `/courses` · `/courses/bulk/export` |
| `PATCH` | `/courses/:id` · `/courses/:id/instructors` |
| `DELETE` | `/courses/:id` · `/courses/bulk` |

## Database changes in session 10

New `courses` collection. Seven indexes: unique `(collegeId, code)` partial on `deletedAt: null`, plus `status+category`, `departmentIds`, `batchIds`, `instructorIds`, `semester`, `tags`. Denormalised `stats` sub-document for catalogue cards.

---

## Session 11 — Training Foundation (Phase 6A)

### Database changes

Three new collections:

| Collection | Purpose | Key indexes |
|---|---|---|
| `trainingrequests` | The ask and its approval workflow | unique `(collegeId, reference)`, `status+createdAt`, `approvalStatus+priority` |
| `trainingsessions` | Scheduled delivery | `startDate+status`, `trainerIds+startDate`, `startDate+endDate` (calendar) |
| `trainingenrollments` | Who is on a session | unique `(collegeId, sessionId, studentId)`, `sessionId+status` |

**Why enrolment is its own collection, not an array on the session:** a session holds up to 10,000 places, and an embedded array would be rewritten on every enrolment. It is also where attendance, assessment results and certificates attach later.

### Extension points for deferred modules

Nullable fields exist now so Examinations and Certificates attach without a migration:

| Field | Location | Waiting on |
|---|---|---|
| `assessmentExamId` | `TrainingSession` | `Exam` model |
| `certificateTemplateId` | `TrainingSession` | `Certificate` model |
| `assessmentAttemptId` | `TrainingEnrollment` | `Attempt` model |
| `certificateId` | `TrainingEnrollment` | `Certificate` model |
| `attendancePercent` | `TrainingEnrollment` | training-attendance decision (see below) |

No placeholder pages or fake endpoints were created. The fields are inert until the owning module lands.

### Remaining dependencies

| Blocked feature | Needs | Decision required |
|---|---|---|
| Training assessments | Examinations module | none — build Examinations |
| Training certificates | `Certificate` model + PDF generation | PDF library choice (font embedding for Indian names) |
| Training attendance | — | **Open:** reuse `AttendanceSession` with a training discriminator, or keep training attendance on the enrolment record. The second is simpler; the first unifies reporting. |

### Business rules enforced

- **Approval workflow is a state machine.** `draft → submitted → under_review → approved → scheduled → in_progress → completed`, with `cancelled`/`rejected` as terminal exits. Any other transition returns `INVALID_STATE_TRANSITION`, not a silent write.
- **Approving is a separate permission from editing** — the person who raises a request cannot wave it through.
- **A request cannot be edited once reviewed.**
- **Trainer double-booking is refused** across overlapping session dates.
- **Capacity is enforced on enrolment**; already-enrolled students are skipped rather than counted twice.
- **Re-enrolling a withdrawn student upserts**, so the unique index does not reject them.
- **Cancelling a session notifies every enrolled student**, carrying the reason.
- **A session with enrolments cannot be deleted** — it must be cancelled.

### Permission catalogue fix

`training:assign_trainer` was granted to **no role at all**, and `college_admin` could not approve training requests. Both were catalogue omissions rather than code bugs, caught by the tests. `college_admin` now holds approve/reject/assign_trainer; `hod` gains `training:update` and `assign_trainer`.

---

## Session 12 — Training UI + Attendance Discriminator

### Files created (13)

**Client (11)** — `training/page.tsx` (dashboard), `training/calendar/page.tsx`, `training/requests/{page,new/page,[id]/page,[id]/edit/page}.tsx`, `training/sessions/{page,new/page,[id]/page,[id]/edit/page}.tsx`
**Components (2)** — `training/training-request-form.tsx`, `training/training-session-form.tsx`
**Shared (3)** — `api/training-queries.ts`, `components/ui/reason-dialog.tsx`, `lib/form-types.ts`

### Files modified (6)

`shared/constants/enums.ts`, `shared/schemas/attendance.schema.ts`, `models/attendance-session.model.ts`, `repositories/attendance.repository.ts`, `services/attendance.service.ts`, `tests/integration/attendance.test.ts`

### Database changes

Two fields on `attendancesessions`:

| Field | Purpose |
|---|---|
| `context` | `class` \| `training` \| `workshop` \| `seminar` — which subsystem owns the session |
| `contextId` | The owning record (a `TrainingSession` id for training; null for class) |

**The unique index now includes `context` and `contextId`.** Without that, a training session and a class could not share a batch, date and period — which they legitimately do. `ATTENDANCE_SESSION_TYPE` gained `workshop` and `seminar`.

`context` and `type` are deliberately separate axes: a `training` context can hold a `lecture` or a `lab`.

### No attendance logic was duplicated

Training attendance flows through the same `createSession` → `markSession` → summary-rebuild path as class attendance, with the same locking, correction and threshold rules. A test asserts marking works identically through the existing endpoint.

### Reusable pieces added

- **`ReasonDialog`** — for actions demanding a written reason (rejections, cancellations, withdrawals). Counts down to the server's minimum rather than failing after submit. Adoptable by attendance corrections and batch promotion.
- **`FormDefaults<T>`** — maps `Date` fields to `string`, because `<input type="date">` holds strings and the API returns ISO strings. Removes the cast-through-`unknown` that was creeping into every edit page.

### Technical debt added

| Item | Impact | Notes |
|---|---|---|
| Training attendance not linked from the Training UI | Low | The backend accepts `context: 'training'`; no button creates one from a session page yet. |
| Calendar is month-view only | Low | No week or day view, no drag-to-reschedule. |
| Completion marks all enrolled as completed | Medium | The API accepts a per-student list; the UI sends everyone still enrolled. A per-student picker is the natural next step. |

---

## Session 13 — Examinations Backend (Phase 7A)

Backend only, by instruction. No pages, no placeholder UI, no mock endpoints.

### Files created (14)

**Shared (3)** — `schemas/examination.schema.ts`, `utils/grade-engine.ts`, `utils/cgpa-engine.ts`
**Models (7)** — `grade-scale.model.ts`, `exam.model.ts`, `exam-paper.model.ts`, `exam-registration.model.ts`, `exam-attendance.model.ts`, `marks-entry.model.ts`, `transcript.model.ts`
**Server (4)** — `repositories/examination.repository.ts` (7 repositories), `services/examination.service.ts`, `services/result.service.ts`, `controllers/examination.controller.ts`, `routes/v1/examination.routes.ts`

**Tests (4)** — `tests/unit/grade-engine.test.ts`, `tests/unit/cgpa-engine.test.ts`, `tests/unit/grade-scale-schema.test.ts`, `tests/integration/examination.test.ts`

### Files modified (6)

`shared/constants/enums.ts`, `shared/constants/permissions.ts`, `shared/index.ts`, `server/container.ts`, `server/routes/v1/index.ts`, `server/repositories/base.repository.ts`

### Database changes

Seven new collections:

| Collection | Purpose | Key indexes |
|---|---|---|
| `gradescales` | Configurable bands + grading policy | unique `(collegeId, code)`; **unique partial `(collegeId, isDefault)` on `isDefault: true`** — at most one default per college |
| `exams` | The examination and its lifecycle | unique `(collegeId, code)`, `status+scheduledAt`, `courseId+semester`, `batchIds+status`, sparse `trainingSessionId` |
| `exampapers` | Versioned question papers | unique `(collegeId, examId, revision)`, `examId+isReleased` |
| `examregistrations` | Who sits the paper | unique `(collegeId, examId, studentId)`, unique `(collegeId, examId, hallTicketNumber)` |
| `examattendances` | Present / absent / debarred / malpractice | unique `(collegeId, examId, studentId)`, `examId+status` |
| `marksentries` | One mark per student per attempt, with history | unique `(collegeId, examId, studentId, attempt)`, `studentId+isPass+semester` (transcripts) |
| `transcripts` | Frozen CGPA snapshots | unique `(collegeId, studentId, revision)`; **unique partial on `isCurrent: true`** — exactly one live transcript per student |

`Exam.publications[]` holds the versioned result history as a subdocument array rather than an
eighth collection: a publication only ever exists inside one exam and is read with it.

### Nothing about grading is hard-coded

Every boundary, pass mark, grade point and aggregation rule comes from the college's
`GradeScale`. Two colleges on one installation can run a 10-point and a 4-point scale side by
side. The configurable policy covers: `passingPercent`, `maxGraceMarks`, `maxGracePerSemester`,
`attendanceBonusEnabled/Threshold/Marks`, `repeatPolicy`, `countFailedCredits`,
`gpaDecimalPlaces`.

A scale is validated at the contract boundary to be **gap-free, non-overlapping, spanning
0-100, with at least one passing band** — a malformed scale would otherwise silently mis-grade
every exam using it.

### Grade engine — decisions worth knowing

- **Order of operations:** attendance bonus first, then grace, then cap at the maximum. The
  bonus is *earned* and grace is *discretionary*, so a student should not burn discretionary
  marks reaching a total the bonus would have given them anyway. Neither can push past 100%.
- **Absent, debarred and malpractice fail outright**, whatever marks are on the record.
- **The band decides the letter; the policy decides pass/fail.** They are configured
  separately, so a scale whose lowest passing band starts below the policy's pass mark must not
  quietly pass a student the policy fails.
- **A gap in the scale fails closed** (F, 0 points) rather than inventing a grade.

### CGPA engine — decisions worth knowing

- **Attempts are keyed `courseId:semester`.** The same course recurring in a *different*
  semester is a separate result, not a repeat — collapsing them would delete a grade.
- **CGPA is computed from pooled credits, not by averaging semester GPAs.** Averaging averages
  ignores that semesters carry different credit loads and produces a different, wrong number.
- **Zero-credit subjects are graded and shown but excluded from the divisor** — the correct
  behaviour for audit and non-credit courses.
- **An active backlog is a subject with no passing attempt anywhere in the history.** A cleared
  backlog leaves `totalBacklogs` but drops out of `activeBacklogs`, which is the number
  placement eligibility reads.

### Lifecycle — enforced server-side

```
draft -> scheduled -> published -> completed -> marks_entered -> results_published -> archived
```

Backward edges exist only where a real correction needs them: `scheduled -> draft` (nothing
announced yet), `published -> scheduled` (postponement), `marks_entered -> completed` (reopen
for entry). `archived` is terminal.

Preconditions a bare edge list cannot express are checked separately:

| Transition | Refused unless |
|---|---|
| to `scheduled` | the exam has a date and time |
| to `published` | at least one student is registered |
| to `marks_entered` | every student who *appeared* has a **verified** mark (absentees excluded) |
| to `results_published` | **always refused** — use the publish operation |
| `results_published` back to `marks_entered` | **always refused** — use the unpublish operation |

The last two are deliberate. Publication writes the version history and the per-student
published flags; a bare status change would leave results visible with no record of who
released them.

### Result publication workflow

- **Publish** — refuses while any mark is unverified. Locks every published mark, stamps
  `publishedVersion`, appends a `published` entry with pass/fail counts and the average,
  notifies candidates.
- **Withhold** — named students keep their computed marks but are excluded from the release
  (`isWithheld: true`, `publishedVersion: null`). This is how a pending disciplinary or fee
  matter is handled without deleting a legitimate result.
- **Unpublish** — marks survive untouched; only visibility and the exam state change. Unlocks
  entries back to `verified` and appends an `unpublished` entry. Logged at `critical`.
- **Recalculate** — re-grades from the **raw component marks** against the current scale, so a
  corrected scale or a late grace policy reaches every affected student. Raw marks are never
  altered. Entries whose grade did not move are skipped, so history records real revisions
  rather than one row per run.

### Versioned history in two places

| Where | What it records |
|---|---|
| `Exam.publications[]` | Every publish / unpublish / recalculate, with actor, reason, counts |
| `MarksEntry.history[]` | Every change to a mark after first entry — prior values, actor, reason |

A correction requires a reason of at least 10 characters and **re-enters the verification
queue** rather than inheriting the sign-off the old value carried. If the student already held
a published result, they are notified that it changed and why.

Transcripts are **frozen snapshots**, not live joins: course codes and titles are copied in, and
regeneration creates a new revision rather than rewriting a document a student may already hold.

### Training integration — extension points now filled

The nullable fields Training reserved in session 11 were inert. Both halves are now wired:

| Field | Filled when |
|---|---|
| `TrainingSession.assessmentExamId` | an exam is created naming a `trainingSessionId` (cleared if that exam is deleted) |
| `TrainingEnrollment.assessmentAttemptId` | results are published — **withheld students stay unlinked**, so a training record never shows a result the student cannot see |

A training session accepts at most one assessment; a second is refused.

Still inert, as instructed: `certificateTemplateId`, `certificateId`. No certificate model was
built this session.

### APIs added (30 routes, all under `/api/v1/examinations`)

| Method | Route |
|---|---|
| `GET` | `/grade-scales` · `/grade-scales/:id` |
| `POST` | `/grade-scales` |
| `PATCH` | `/grade-scales/:id` |
| `DELETE` | `/grade-scales/:id` |
| `GET` | `/` · `/:id` · `/:id/profile` · `/analytics` |
| `POST` | `/` · `/bulk/export` |
| `PATCH` | `/:id` |
| `DELETE` | `/:id` · `/bulk` |
| `POST` | `/:id/transition` |
| `GET` | `/:id/papers` |
| `POST` | `/:id/papers` |
| `GET` | `/:id/registrations` · `/:id/hall-tickets` |
| `POST` | `/:id/registrations` |
| `PATCH` | `/registrations/:registrationId` |
| `GET` | `/:id/attendance` |
| `POST` | `/:id/attendance` |
| `GET` | `/:id/marks` |
| `POST` | `/:id/marks` · `/:id/marks/verify` · `/:id/marks/correct` |
| `POST` | `/:id/results/publish` · `/:id/results/unpublish` · `/:id/results/recalculate` |
| `GET` | `/:id/results/history` · `/results/students/:studentId` |
| `POST` | `/transcripts` |
| `GET` | `/transcripts/:studentId` · `/transcripts/:studentId/versions` |

### Permissions added (11)

`gradescale:read`, `gradescale:manage`, `marks:read`, `marks:enter`, `marks:verify`,
`marks:correct`, `result:read_own`, `result:recalculate`, `transcript:read`,
`transcript:read_own`, `transcript:generate`.

**`marks:enter` and `marks:verify` are separate on purpose** — one person must not both set and
sign off a grade. Faculty and trainers hold `enter`; HOD and college admin hold `verify` and
`correct`. Publication stays with `result:publish`, which faculty do not have.

`STUDENT` lost `result:read` and gained `result:read_own` + `transcript:read_own`, following the
established `*_own` pattern: `result:read` also unlocks mark sheets and rank lists naming
classmates. No code referenced `result:read`, so nothing broke.

### Tests added (111)

| Suite | Tests | Covers |
|---|---|---|
| `unit/grade-engine.test.ts` | 30 | component sums, rounding drift, grace caps, attendance-bonus threshold **boundaries**, the 100% cap, band boundaries at every edge (0 / 39.99 / 40 / 89.99 / 90 / 100), absent-fails-outright, policy-stricter-than-band, gap fails closed |
| `unit/cgpa-engine.test.ts` | 22 | all three repeat policies, tie-breaking, credit weighting, `countFailedCredits` both ways, zero-credit exclusion, pooled-credit CGPA vs averaged GPAs, backlog clearing, empty input |
| `unit/grade-scale-schema.test.ts` | 7 | overlap, inverted band, gap at 0, gap at 100, no passing band, single band, policy defaults |
| `integration/examination.test.ts` | 55 | full lifecycle walk, every refused transition, registration and hall tickets, attendance, marks entry/verify/correct with history, publish/withhold/unpublish/recalculate, transcripts and versioning, analytics, **training integration (5)**, **permissions (4)**, **tenant isolation (4)** |

Tenant isolation asserts the established rule: a cross-tenant exam answers **404, not 403** —
a 403 would confirm it exists.

**Suite total: 225 -> 336 tests, 11 -> 15 suites, exit 0.**

### Two latent bugs found and fixed

1. **`BaseRepository.createMany` was unusable inside a transaction.** It hard-coded
   `ordered: false`; Mongoose rejects that outright when a session is passed
   (*Cannot call create() with a session and multiple documents unless ordered: true*).
   Any caller inserting **two or more** documents in a transaction got a 500. One document
   happened to work, which is why no existing test caught it. Now `ordered: true` when a session
   is present — inside a transaction the batch succeeds or rolls back together anyway.

2. **`version` is the optimistic-concurrency key on every schema.** `applyBasePlugin` sets
   `versionKey: 'version'`, so `ExamPaper.version` and `Transcript.version` silently collided
   with it — a freshly created transcript reported version `0`, and regenerating one hit the
   unique index. Both fields are now named **`revision`**. Any future model needing its own
   version counter must avoid the name `version`.

### Technical debt added

| Item | Impact | Notes |
|---|---|---|
| No Examinations UI | High | 30 endpoints are unreachable from the product. This is the next session. |
| Grace is capped per subject, not per semester | Medium | `maxGracePerSemester` is stored and validated but not yet enforced — enforcing it needs a semester-wide view at entry time, i.e. a cross-exam check. |
| Transcript CGPA policy comes from the college default scale | Low | Per-exam scales still decide each subject's letter and grade point; only the aggregation rules (repeat policy, decimal places, failed-credit handling) come from the default. Correct for a college running one scale; ambiguous for one mid-migration between two. |
| Hall ticket numbers are `CODE-0001` sequential | Low | Derived from the count at registration time. Adequate and unique per exam; a college wanting a statutory format needs a configurable template. |
| No PDF hall tickets or mark sheets | Medium | Same blocked font-embedding decision as the existing no-PDF-export debt. |
| Certificate model still not built | Medium | Deferred by instruction. `certificateTemplateId` / `certificateId` remain inert. |
| `eslint` import/order fails on `server/tests/**` | Low | **Pre-existing** — every integration test since session 5 groups `@/` imports before relative helper imports, which the rule rejects. The new suite matches its siblings rather than diverging. One `--fix` pass over `server/tests` clears all 18. |

### Recommended next session

**Phase 7B — Examinations UI.** The backend is complete and tested but invisible. The natural
scope is: exam list with lifecycle chips, exam detail with the transition control gated on
`allowedTransitions` (already returned by `/:id/profile`), the marks-entry grid, the publish
dialog with withhold selection, and the grade-scale editor with a live band preview using the
**same `grade-engine` functions the server uses** — they are pure and framework-free precisely
so the client can show a preview that cannot disagree with the server.

Defer Placement until Examinations is usable: placement eligibility reads `currentCgpa` and
`activeBacklogs`, and those are now written by transcript generation, which currently has no way
to be triggered from the UI.

---

## Session 14 — Examinations Frontend (Phase 7B)

Frontend only. No backend logic was changed; one client-side duplication was found and removed.

### Files created (23)

**API (1)** — `api/examination-queries.ts` — all 30 endpoints as typed hooks, with one
invalidation tree
**Lib (1)** — `lib/examination-display.ts` — labels, tones, ordering and relation helpers
**Components (8)** — `examinations/{exam-form, grade-scale-form, grade-band-preview,
marks-entry-grid, correct-mark-dialog, publish-results-dialog, register-students-dialog,
lifecycle-stepper, transition-control, exam-tabs}.tsx`
**Pages (14)** — dashboard, analytics, exam list, exam new, exam detail, exam edit, papers,
registrations, hall tickets, attendance, marks, results, grade scales (list/new/edit),
transcripts (list/detail)

**Test infrastructure (2)** — `vitest.config.ts`, `tests/setup.ts`
**Tests (4)** — `tests/{examination-display, marks-entry-grid, grade-band-preview,
publish-results-dialog}.test.tsx`

### Files modified (3)

`config/navigation.ts` (Examinations nav item), `client/package.json` (test scripts +
devDependencies), `components/examinations/marks-entry-grid.tsx` (duplication removed — see below)

### The grade preview cannot disagree with the server

Every grade the UI shows — the marks grid, the correction dialog, the grade-scale preview — is
produced by `calculateGrade` from `@peacefic/shared`, the same pure function the server calls
when it saves. There is one implementation, so drift is not possible by construction rather than
by discipline.

That is why the engine was written DB-free in session 13. The client duplicates **no** business
rule: not a band boundary, not the pass mark, not the grace cap, not the absent-fails-outright
rule. The one client-side check that looks like duplication — flagging a component mark above its
maximum — is a *display* affordance, and the server rejects the same value independently.

`vitest.config.ts` aliases `@peacefic/shared` to its **source**, not `dist`, so a test exercises
the engine the app imports rather than a stale build.

### The state machine stays on the server

The detail page reads `allowedTransitions` from `/examinations/:id/profile` and renders exactly
those buttons. The seven-state graph is not reimplemented in the client — `lib/examination-display.ts`
holds labels, tones and ordering only, and a test asserts every enum member has copy so a new
state cannot render as `undefined`.

`results_published` is filtered out of the transition control deliberately: publication writes the
version history and the per-student flags, so it goes through the publish dialog. The server
refuses the bare transition too.

### Pages

| Page | Route | Notes |
|---|---|---|
| Dashboard | `/college/examinations` | Lifecycle distribution, published-not-yet-sat, waiting-on-marks, outcomes |
| Exam list | `/college/examinations/exams` | DataTable — server pagination, sorting, filters, export, bulk delete. Accepts `?status=` so dashboard cards deep-link |
| Create / Edit | `…/exams/new`, `…/exams/[id]/edit` | `useApiForm` + `createExaminationSchema`. Live total, marks scheme locked once marks exist |
| Detail | `…/exams/[id]` | Lifecycle stepper, transition control, counts, results panel, next-step affordance |
| Papers | `…/exams/[id]/papers` | Revision composer with live section arithmetic; released revisions are read-only history |
| Registrations | `…/exams/[id]/registrations` | DataTable, batch or individual picker, block requires a reason |
| Hall tickets | `…/exams/[id]/hall-tickets` | Print layout; empty state explains they are invalid before publication |
| Attendance | `…/exams/[id]/attendance` | Radiogroup per candidate, mark-all-present, sticky save |
| Marks | `…/exams/[id]/marks` | The grid, live grades, verify, correct-with-history |
| Results | `…/exams/[id]/results` | Publish with withhold, unpublish, recalculate, publication timeline |
| Grade scales | `…/grade-scales` (+ new, edit) | Band editor with live preview probing every edge |
| Transcripts | `…/transcripts` (+ `[studentId]`) | Revision switcher, staleness warning, print layout |
| Analytics | `…/analytics` | Lifecycle distribution and per-exam pass rates |

### APIs consumed — all 30

Every endpoint shipped in session 13 is wired. Grade scales (5), exams (9 incl. analytics,
export, bulk delete, transition), papers (2), registrations (4), attendance (2), marks (4),
results (4), transcripts (3), student results (1).

### Reuse, not reinvention

`DataTable` (server pagination/sorting/selection), `SelectionBar`, `Breadcrumbs`, `PageHeader`,
`useApiForm`, `useListParams`, `useDebouncedSearch`, `Field`/`TextField`/`NumberField`/
`SelectField`/`MultiSelectField`/`FormSection`, `ConfirmDialog`, `ReasonDialog`, `StatCard`,
`EmptyState`/`ErrorState`, `Badge`, `Card`, `Alert`, `RouteGuard`, `can`/`canAny`.

Three new primitives were needed and are examination-specific rather than general: the lifecycle
stepper, the marks grid and the exam tab bar.

### Permissions honoured

Every action is gated with `can()` against the permissions added in session 13. Notably:
`marks:enter` shows the grid and the save actions; `marks:verify` shows the verify button;
`marks:correct` shows the correction picker; `result:publish`, `result:withhold` and
`result:recalculate` each gate their own control; `gradescale:manage` gates the scale editor while
`gradescale:read` still shows the list, because faculty need to see how their marks will grade.

Client checks decide what to *render*. The server re-checks every request — a user who edits
their token gets a 403, not access.

### Tests added (43)

The client had **no test runner at all** before this session. Vitest + Testing Library +
jsdom were added.

| Suite | Tests | Covers |
|---|---|---|
| `examination-display.test.ts` | 10 | every lifecycle state has label/tone/copy, stepper order matches the enum, relation and name fallbacks |
| `marks-entry-grid.test.tsx` | 15 | rendered grade equals `calculateGrade` at every band edge, grace capping, absent-fails-outright, over-maximum flagging, disabled components, locked rows, resit badge, correction count |
| `grade-band-preview.test.tsx` | 8 | live regrading, policy-overrides-band, cap warning, edge probes, half-typed bands |
| `publish-results-dialog.test.tsx` | 10 | withhold selection, payload shape, empty reason omitted, all-withheld refused, search does not silently un-withhold |

**Client: 0 → 43 tests. Server unchanged at 336. Total 379.**

### Duplication found and removed

`MarksEntryGrid` took both an `attendanceByStudent` map **and** `row.attendanceStatus` — two
sources for one fact, and they disagreed the moment a test passed one without the other. The map
prop was removed; the row carries the status, which the page already derives. Caught by the
component test rather than in review.

### Accessibility

Radiogroups for attendance (arrow-key navigation, one status per candidate), `role="status"` with
an accessible name on the live grade panel, `aria-current` on tabs and breadcrumbs, `aria-invalid`
on out-of-range marks, `<caption>` on the marks table, `rowheader` scope so a screen reader
announces which candidate a cell belongs to, `aria-live` on computed totals.

### Verification

```
npm run typecheck   ✓  shared + server + client (tests included)
npx eslint          ✓  client/src, client/tests, server/src, shared/src — zero errors
npm run build       ✓  client, 44 static pages, 77 app routes (was 20)
npx vitest run      ✓  43 tests, 4 suites
npx jest            ✓  336 tests, 15 suites
```

### Technical debt added

| Item | Impact | Notes |
|---|---|---|
| No PDF hall tickets or mark sheets | Medium | Print stylesheets carry both today. A real PDF needs the same font-embedding decision blocking every other export. |
| Seat numbers are never assigned | Low | The model carries `seatNumber` and hall tickets display it; nothing sets it. Needs a seating-plan feature. |
| Marks grid renders every row | Low | Fine to a few hundred candidates. A 2,000-candidate university exam wants virtualisation. |
| No optimistic updates | Low | Every mutation refetches the tree. Correct, but a 200-row marks save has a visible pause. |
| Transcript staleness is a client-side comparison | Low | Compares live CGPA against the issued document. A server-side `isStale` flag would be cheaper and authoritative. |
| Exam list `?status=` is read once | Low | Deep links work; the URL does not then track filter changes. Full URL-synced filters are a cross-module change. |
| Student portal has no results page | Medium | `result:read_own` and `transcript:read_own` exist and the endpoints serve them; the student portal has no page yet. |

### Recommended next session

**Student Portal — results and transcript.** The permissions (`result:read_own`,
`transcript:read_own`) and the endpoints exist, and students are notified when results publish —
but the notification currently leads nowhere. That is the smallest remaining gap between what the
backend does and what a student can see, and it closes the loop opened in session 13.

After that, **Placement**: eligibility reads `currentCgpa` and `activeBacklogs`, which transcript
generation now writes and the UI can now trigger, so the dependency is finally satisfied.

---

## Session 15 — Student Portal: Results and Transcript

Closes the loop opened in session 13: students were notified the moment results
published, but the notification led nowhere.

### The API gap, found before any code was written

All three student-relevant endpoints were unreachable by a student, and none was safe to
simply re-gate:

| Endpoint | Guard | Why it could not serve a student |
|---|---|---|
| `GET /examinations/results/students/:studentId` | `result:read` | Students hold `result:read_own` → **403**. Takes the id from the URL. Returns raw `MarksEntry` documents including `history[]` (correction reasons and actors), `status`, `enteredBy`/`verifiedBy` and examiner `remarks` — **internal audit data**. |
| `GET /examinations/transcripts/:studentId` | `transcript:read` | **403** for students. |
| `GET /examinations/transcripts/:studentId/versions` | `transcript:read` | **403**; revision history is an office concern. |

Loosening those guards would have let a student pass any `studentId`. Two new self-service
endpoints were added instead, using the `requireOwnStudent()` pattern the codebase already had
for `/students/me` and `/attendance/me`.

**No existing examination logic was modified** — the grade engine, CGPA engine, lifecycle,
publication workflow and every staff endpoint are untouched. The changes are additive.

### Files created (5)

**Client (4)** — `app/student/results/page.tsx`, `app/student/transcript/page.tsx`,
`components/student/result-card.tsx`, `tests/helpers/render.tsx`
**Tests (2)** — `tests/student-results.test.tsx`, `tests/student-transcript.test.tsx`

### Files modified (5)

`server/repositories/examination.repository.ts` (added `findWithheldForStudent`),
`server/services/result.service.ts` (added `ownResults`, `ownTranscript` and the student
projection), `server/controllers/examination.controller.ts`, `server/routes/v1/examination.routes.ts`,
`client/api/examination-queries.ts`, `client/config/navigation.ts`,
`server/tests/integration/examination.test.ts`

### APIs added (2)

| Method | Route | Permission |
|---|---|---|
| `GET` | `/examinations/me/results` | `result:read_own` |
| `GET` | `/examinations/me/transcript` | `transcript:read_own` |

Both are declared before every `/:id` route so `me` is never parsed as an exam id, and **neither
takes a student parameter** — identity comes from the token, so there is nothing for a browser to
substitute.

### The student projection

`ownResults` returns a deliberate projection, not the stored document. Absent from the payload
and from the `OwnResult` type: `history`, `status`, `enteredBy`, `verifiedBy`, `enteredAt`,
`verifiedAt`, `remarks`, `publishedVersion`, `studentId`. A server test asserts each one is
missing rather than trusting the mapping.

Present, because they explain the student's own total: the three components, raw total,
attendance bonus, grace, final total, maximum, percentage, letter, grade point, pass, absent,
attempt and credits.

### Withheld results — a design decision worth stating

`findForStudent` already excluded withheld marks, so a student would have seen *nothing at all*
for a paper they sat. That satisfies "never show a withheld result as published", but leaves the
student unable to tell a withheld result from a lost one.

The endpoint now returns a separate `withheld[]` array carrying **identity only** — exam, course,
semester, credits, attempt. No mark, no percentage, no grade, no pass flag. The page renders it
in its own section, styled as a warning, saying the result is held and is not counted in the
CGPA. Only exams that have actually published are listed, so an exam still being marked does not
masquerade as withheld.

A server test asserts the withheld payload carries no `percentage`, `letter`, `finalTotal`,
`gradePoint` or `isPass`, and that the CGPA stays at 0.

### Pages

| Page | Route | Notes |
|---|---|---|
| My results | `/student/results` | CGPA, credits, subjects passed, backlogs; per-semester SGPA; withheld section; semester filter. `DataTable` on desktop, cards below `lg` — nine columns are unreadable on a phone. |
| My transcript | `/student/transcript` | Semester-wise history, SGPA per semester, overall CGPA, credits, backlogs, attempt numbers. Print layout. Says plainly that it is a snapshot. |

Navigation gained an **Academics** section in the Student Portal with both pages, each gated on
its own `*_own` permission — so a college that has not granted them shows no dead link.

### No duplicated business logic

The client computes nothing. CGPA, SGPA, credits, backlogs, grades and pass/fail all arrive
computed from the shared engines via the API. The only client-side arithmetic is `toFixed(2)` for
display and grouping subjects by semester for layout.

### Tests added (31)

**Server — 9** (in `examination.test.ts`, run separately from the client suite):
own results with no id in the URL · no internal audit fields leak · unpublished results omitted ·
withheld reported without marks and excluded from CGPA · own transcript, null before one is
issued · caller without `result:read_own` refused · account with no student record refused ·
each student gets only their own results · the by-id staff endpoints stay refused even for self.

**Client — 22** across two suites: published rendering, marks/grade/credits, CGPA and SGPA,
withheld separation with no grade present, no withheld section when empty, empty state, loading
skeletons, error state with retry and request id, failed subject, repeat attempt, semester
filter, permission redirect · transcript rendering, semester grouping, SGPA and CGPA, backlogs
and attempts, empty state, loading, error, snapshot notice, permission redirect.

**Totals: server 336 → 345, client 43 → 65.**

### Two test mistakes I made, both caught

1. A test registered a second candidate *after* the exam had left the registration window. The
   server returned 422 — correctly. The test was rebuilt to register both up front.
2. A CGPA assertion matched `9.00` in two places, and a later version read the stat card while it
   still showed its loading skeleton. Both were bad queries, not bad pages; the assertions now
   wait for data and scope to a block.

### Technical debt added

| Item | Impact | Notes |
|---|---|---|
| No per-result detail route | Low | The card carries components, grace and bonus, which is the whole of what a student may see. A dedicated `/student/results/[id]` would add a URL to share but no new data. |
| Transcript revision history not exposed to students | Low | Deliberate — the student sees the current transcript. If a college wants students to see superseded revisions, the endpoint exists for staff and would need an own-scoped twin. |
| No PDF | Medium | Both pages print via the browser. Same font-embedding decision blocking every other export. |
| `withheld` has no reason | Low | The withhold reason lives on the publication record and is often internal ("fees outstanding"). The page tells the student to contact the office rather than surfacing it. Worth revisiting with the office. |

### Recommended next session

**Placement and Companies.** The dependency is now genuinely satisfied: eligibility reads
`currentCgpa` and `activeBacklogs`, transcript generation writes them, staff can trigger it from
the UI, and students can see the result. Nothing else in the product is blocked on Examinations.

The alternative remains **infrastructure** — Socket.IO, the unscheduled cron jobs and Swagger.
The nightly attendance auto-lock and summary jobs still exist as service methods that nothing
invokes, which is a silent correctness gap in production.

---

## Session 16 — Placement: Companies, Job Postings, Eligibility Engine (9A–9C)

Backend only. Phases 9D–9G (applications, interviews, offers, analytics) were **deliberately
not started** — each needs its own state machine, and half a state machine is worse than none.

### Scope decision

The brief listed 9A through 9G but closed with "do not attempt to build the entire Placement
module in a single partial session if that would leave half-built functionality." 9A–9C is the
coherent slice: a company register, drives posted against it, and the engine that answers who may
apply. The eligibility criteria on a posting would be inert without 9C, so stopping at 9B would
itself have been half-built.

### Files created (8)

**Shared (1)** — `utils/eligibility-engine.ts`
**Models (2)** — `company.model.ts`, `job-posting.model.ts`
**Repositories (1)** — `placement.repository.ts` (Company, JobPosting)
**Services (3)** — `eligibility.service.ts`, `company.service.ts`, `job-posting.service.ts`
**Controller (1)** — `placement.controller.ts` (CompanyController, JobPostingController)
**Routes (1)** — `placement.routes.ts` (companyRoutes, jobRoutes)
**Tests (2)** — `unit/eligibility-engine.test.ts`, `integration/placement.test.ts`

### Files modified (7)

`shared/constants/enums.ts` (two file purposes), `shared/constants/permissions.ts` (role fix),
`shared/schemas/placement.schema.ts` (fields the brief required), `shared/index.ts`,
`server/services/storage/file-validator.ts`, `server/services/storage/storage.service.ts`,
`server/container.ts`, `server/routes/v1/index.ts`

**No Examination, Grade Engine, CGPA Engine, Training, Attendance, Student Results or Transcript
logic was touched.**

### Database changes

Two new collections:

| Collection | Key indexes |
|---|---|
| `companies` | **unique `(collegeId, nameKey)`** on the folded name; `status+isVerified`; `industry`; `companyType`; `stats.lastDriveAt`; text on `name`/`industry` |
| `jobpostings` | `companyId+status`; `status+applicationCloseAt`; `jobType+status`; `driveDate`; `eligibility.departmentIds+status`; `eligibility.batchIds+status`; text on `title` |

**Why `nameKey`:** the unique index folds case, so a college cannot end up with "Infosys",
"infosys" and "INFOSYS" as three records each holding a third of the drive history.

### APIs added (24)

**Companies** — `GET /companies` · `GET /companies/:id` · `GET /companies/:id/profile` ·
`GET /companies/analytics` · `POST /companies` · `PATCH /companies/:id` · `DELETE /companies/:id` ·
`DELETE /companies/bulk` · `POST /companies/bulk/export` · `POST /companies/:id/verify` ·
`POST /companies/:id/blacklist` · `POST /companies/:id/reinstate` · `POST /companies/:id/logo`

**Jobs** — `GET /jobs` · `GET /jobs/:id` · `GET /jobs/:id/profile` · `GET /jobs/analytics` ·
`POST /jobs` · `PATCH /jobs/:id` · `DELETE /jobs/:id` · `DELETE /jobs/bulk` ·
`POST /jobs/bulk/export` · `POST /jobs/:id/transition` · `POST /jobs/close-expired` ·
`GET /jobs/:id/eligible-students` · `GET /jobs/:id/eligibility/:studentId`

**Student self-service** — `GET /jobs/me/openings` · `GET /jobs/me/eligibility/:id`

Both self-service routes are declared before every `/:id` route so `me` is never parsed as an id,
and neither takes a student parameter — identity comes from the token.

### Permissions

No new keys were needed: `company:*` and `job:*` already existed from session 1. One **catalogue
defect** was found and fixed.

**`college_admin` could not run placement at all.** It held only `company:read` and `job:read` —
no create, update, verify, blacklist, publish or close. Every other module grants the college
admin the full set; this was an omission, caught by the tests rather than by reading. It now
holds the complete company and job set.

### The eligibility engine

Pure, framework-free, in `@peacefic/shared` beside the grade and CGPA engines. It takes a
`StudentSnapshot` and an `EligibilityInput` and returns
`{ eligible, reasons: [{ rule, message }] }`.

**It reports every failure, not the first.** A student told only "you need 7.0 CGPA", who fixes
nothing because they also have two backlogs, has been failed twice.

**It knows nothing about Mongo, CGPA computation or attendance aggregation.** `EligibilityService`
assembles the snapshot from `academics.currentCgpa`, `academics.activeBacklogs` and the
Attendance module's overall summary — all written by modules that already own them. Rule 10 of
the brief, honoured by construction rather than by discipline.

Rules supported: placement bar · already placed · department · batch · graduation year · CGPA ·
active backlogs · total backlogs · class 10 / 12 / diploma marks · attendance · year gap · gender
restriction · required skills · qualifications.

Three decisions worth stating:

- **Null is not zero.** A student with no published results has no CGPA; they cannot clear a
  minimum, and the message says why rather than implying they scored 0.
- **`customCriteria` is never evaluated.** It is narrative ("must hold a valid passport"), shown
  to the student and left to a human. An engine that guessed would fail people wrongly.
- **`eligibilityPrefilter` is an optimisation, never the verdict.** It narrows 4,000 students to a
  workable set with the rules a Mongo query can express; the engine then decides on what survives.
  Skills, qualifications and attendance are deliberately absent from it.

### The job lifecycle

```
draft → published → closed → completed
```

`cancelled` is reachable from anywhere except a completed drive — a company can withdraw a role at
any point. `completed` is terminal.

Publishing computes the eligible cohort and **refuses when nobody qualifies** — publishing to
silence is a mistake, not a drive. It also refuses a posting whose window has already closed.

**Eligibility is frozen once anyone applies.** Changing the criteria mid-drive would silently
re-rank a set of people who already committed to the terms as stated.

### Security decisions

1. **Recruiter contact details are redacted for students.** Students hold `company:read` so they
   can see which companies visit campus, which is useful. They must not get HR names, direct dials
   and personal addresses — those were given to the placement office, not to 4,000 students.
   Contacts, switchboard email and phone are stripped unless the caller holds `company:update`.

2. **`/jobs/:id/eligible-students` was gated on `job:read` — which students hold.** That leaked
   every classmate's roll number, CGPA and backlog count. Caught by a test, now gated on
   `application:read_all`. This was a hole I introduced in this session.

3. **Verification is its own permission.** It is a statement that someone checked the company is
   real, which a student relies on before sharing their details. A placement officer can create
   and edit companies but cannot verify one.

4. **Blacklisting cannot be lifted by an ordinary update.** A status edit back to `active` is
   refused; reinstatement goes through its own endpoint where a reason lands in the audit log.

5. **A company with drive history cannot be deleted** — that would orphan every application and
   placement pointing at it. Blacklisting is the intended exit.

6. **A blacklisted or inactive company cannot post new roles.**

### Tests added (102)

**Unit — 51** (`eligibility-engine.test.ts`): every rule, both sides of every boundary
(CGPA 6.99/7.0/7.01, backlogs at and over the cap, attendance 74.9/75), null-versus-zero handling,
case-insensitive skill matching, qualifications as alternatives, the all-failures guarantee, and
the prefilter's deliberate omissions.

**Integration — 51** (`placement.test.ts`): company CRUD, case-folded duplicate names, two-primary
rejection, verification, blacklist/reinstate, delete guards, per-row bulk outcomes · permissions
across college admin, placement officer, faculty and student · **tenant isolation** (404 not 403,
scoped lists, same name in two colleges, cross-tenant job and company) · job validation (CTC
inversion, window inversion, round gaps, blacklisted company, unknown department) · lifecycle
(publish, refuse-when-nobody-eligible, refuse-expired, illegal transition, terminal completed,
auto-close) · eligibility over real data (CGPA, backlogs, department, batch, placed, barred,
frozen-after-applications, structured reasons) · student self-service · **formula injection in
both exports** · analytics.

**Totals: server 345 → 447, client unchanged at 65.**

### Technical debt added

| Item | Impact | Notes |
|---|---|---|
| Phases 9D–9G not built | High | Applications, interviews, offers and placement analytics. The eligibility engine and job lifecycle they depend on are complete and tested. |
| No Placement UI | High | 24 endpoints, no pages. Companies and jobs both need list/detail/form screens. |
| `closeExpired` is manual | Medium | Exposed as `POST /jobs/close-expired` rather than scheduled, because the project still has no job runner. A posting that keeps accepting applications past its deadline is worse than one closed by hand. |
| `stats.eligibleCount` is a snapshot | Low | Recomputed on publish and when the eligible list is fetched. A student whose CGPA changes afterwards is not reflected until one of those happens. The live check on apply will be authoritative. |
| Company documents unused | Low | `company_document` upload purpose and limits exist; only the logo endpoint consumes storage so far. |
| Qualification matching is exact-string | Low | "B.E. Computer Science" must match exactly, case-insensitively. A college using inconsistent programme names will see false negatives. |

### Recommended next session

**Phase 9D — Student Applications.** It is the natural next unit: one model, one state machine
(`applied → under_review → shortlisted → in_process → selected/rejected/withdrawn`), and the
eligibility engine already answers the hard question of who may apply. The security requirements
in the brief — own-applications-only, server-decided eligibility, duplicate prevention,
closed/expired refusal — all have their foundations in place.

Interviews (9E) and offers (9F) then attach to an application, and analytics (9G) is the
aggregation over all of it. Building 9D first keeps each session a whole unit.

---

## Session 17 — Placement: Student Applications (9D)

Backend only. Interviews, offers and analytics (9E–9G) remain unstarted.

### Files created (3)

`models/job-application.model.ts` · `services/job-application.service.ts` · plus the
`JobApplicationRepository`, `JobApplicationController` and `applicationRoutes` added to the
existing placement files.

### Files modified (6)

`repositories/placement.repository.ts`, `controllers/placement.controller.ts`,
`routes/v1/placement.routes.ts`, `routes/v1/index.ts`, `container.ts`,
`shared/constants/permissions.ts`, `tests/integration/placement.test.ts`

### Database changes

One new collection, `jobapplications`:

| Index | Purpose |
|---|---|
| **unique `(collegeId, jobPostingId, studentId)`** | One application per student per posting |
| `jobPostingId+status` | The office's shortlist view |
| `studentId+appliedAt` | A student's own history |
| `companyId+status` · `departmentId+status` · `batchId+status` | Office filters |

**Why the unique index matters:** two requests arriving together both pass a "have you applied?"
check and both insert. The database is what actually prevents the duplicate; the service catches
the resulting `11000` and reports it as a conflict.

### APIs added (13)

**Student self-service** — `POST /jobs/:id/apply` · `GET /applications/me` ·
`GET /applications/me/:id` · `POST /applications/me/:id/withdraw` ·
`POST /applications/me/:id/decline-offer`

**Office** — `GET /applications` · `GET /applications/:id` · `GET /applications/analytics` ·
`POST /applications/bulk/export` · `POST /applications/bulk/shortlist` ·
`POST /applications/bulk/reject` · `POST /applications/:id/shortlist` ·
`POST /applications/:id/advance` · `POST /applications/:id/reject` ·
`POST /applications/:id/select`

Every `me` route is declared before `/:id` and takes no student parameter.

### The application state machine

```
applied → under_review → shortlisted → in_process → selected
```

`rejected`, `withdrawn` and `offer_declined` are terminal. A candidate can be rejected from any
live stage.

**The split of authority is enforced, not conventional:**

- A student may drive only `withdrawn` and `offer_declined`, and only on their own application.
- The office may drive everything else, and is **refused** if it tries to withdraw on a student's
  behalf — walking away is the student's act.
- Once `selected`, withdrawing is refused and the student is pointed at declining the offer. The
  two are different events and a placement report must be able to tell them apart.

Every transition goes through one private method, so the edge list, the history entry, the
denormalised counters and the notification cannot disagree about what happened.

### Security

- **Identity always from the token.** `apply` reads the student from `requireOwnStudent()`; there
  is no student parameter anywhere in the student-facing surface.
- **Eligibility is decided server-side on every apply**, against the live record, by the same
  engine that rendered the button. A client claiming "eligible" proves nothing.
- **Cross-student access answers 404, not 403** — a 403 would confirm the application exists.
- **`GET /applications/:id` accepts either permission** and falls back to the own-application path
  for a caller without `application:read_all`, so a student passing a classmate's id gets a 404.
- **Closed, cancelled, draft, not-yet-open and past-deadline postings all refuse applications**,
  each with a message saying which.
- **Selections cannot exceed openings.**

### The eligibility snapshot

`eligibilitySnapshot` freezes the student's CGPA, backlog counts and attendance at apply time.
A later CGPA change must not rewrite the basis on which someone was admitted to a drive, and a
dispute months later needs the figures as they stood.

### Permission catalogue defect (second of this class)

`college_admin` held `application:read_all` but **not** `application:read`, `application:shortlist`,
`application:reject`, `placement:create`, `placement:update`, `placement:verify`, or any interview
permission. It could see applications and do nothing with them. Now holds the full set — the same
omission found for companies and jobs in session 16, in the same role.

### A real bug the tests caught

`withdraw` and `declineOffer` called `myApplication()`, which **populates** relations for display,
then passed those populated documents into repository calls whose parameters are typed as
ObjectIds. Mongo cast them as `_id` and returned `"_id" is not a valid value`.

It surfaced only on decline, because that is the one path where a `selected → not selected`
transition triggers `adjustStats` on the populated company.

Fixed at the class level rather than the symptom: mutation paths now use a private
`requireOwnApplication()` that returns the **unpopulated** record after the ownership check, and
`myApplication()` stays the populated read path.

### Tests added (27)

All in `placement.test.ts`, bringing it to 78: application creation with a frozen snapshot ·
counter updates · duplicate refusal · ineligible refusal carrying the reason · draft, closed,
past-deadline and not-yet-open refusals · own-applications-only listing · cross-student read,
withdraw and office-list refusals · cross-tenant 404 · full applied→selected walk with history ·
illegal transition · terminal rejected · withdraw and second-withdraw refusal · selected→decline
with the withdrawal refusal in between · decline-without-offer refusal · office-withdrawal
refusal · openings cap · bulk per-row outcomes · counter sync · analytics · formula injection.

**Server total: 447 → 474.**

### Two environment notes worth recording

1. **A stale `tsconfig.tsbuildinfo` silently breaks the shared build.** `shared/dist` had been
   deleted while the buildinfo remained, so `tsc` reported success and emitted nothing, and the
   server then failed to resolve `@peacefic/shared`. `rm shared/tsconfig.tsbuildinfo` before
   rebuilding is the fix; `npm run clean --workspace=shared` does not remove the buildinfo.

2. **Force-killing a test run leaves the in-memory Mongo unable to start.** A subsequent run
   fails every test with `Instance failed to start within 10000ms`, which looks like a total
   breakage and is not. Wait for a run to finish, or clear processes and re-run.

### Technical debt added

| Item | Impact | Notes |
|---|---|---|
| 9E–9G not built | High | Interviews, offers and placement analytics. |
| No Placement UI | High | 37 endpoints across 9A–9D, no pages. |
| Withdrawn students cannot reapply | Medium | Deliberate — the unique index covers withdrawn rows, so reapplying needs the office. A `reapply` endpoint or a partial index excluding `withdrawn` would change that; it should be a policy decision, not an accident. |
| `selected` does not create a Placement record | Medium | Selection sets the status and bumps the company's offer count. The `Placement` model belongs to 9F, where offer details, joining date and acceptance live. |
| Counter sync is a full recount per transition | Low | `statsForJob` aggregates on every change. Correct and cheap at drive scale; an increment would be faster and harder to keep honest. |
| No notification on withdrawal | Low | The office is not told when a student withdraws. It shows in the list, but a shortlist being assembled would benefit from a push. |

### Recommended next session

**Phase 9F — Offers**, before 9E. Selection currently ends the flow with a status and no offer
record: no CTC, joining date, acceptance or decline tracking beyond the application status. That
is the larger gap, and `placement:create` is already wired to the select endpoint.

Interviews (9E) are additive scheduling on top of a shortlisted application and can follow.

---

## Session 18 — Placement: Offers (9F)

Backend only, as agreed. Interviews (9E) and the Placement UI remain unstarted.

### The naming decision

An offer concept **already existed** in the shared contracts under the name `Placement`:
`PLACEMENT_STATUS` (`offered · accepted · declined · joined · offer_revoked · not_joined`),
`createPlacementSchema` with every field a `JobOffer` would need, `placement:*` permissions
assigned to roles, `StudentRepository.recordPlacement()` written but never called, an
`offer_letter` file purpose, and `Student.placement{isPlaced, placementCount, highestPackage}`.

Introducing `JobOffer` would have orphaned all of it and left two vocabularies for one record.
**9F implements `Placement`.** The only missing pieces were the model, repository, service,
controller and routes.

### Files created (2)

`models/placement.model.ts` · `services/placement.service.ts`, plus `PlacementRepository`,
`PlacementController` and `placementRoutes` appended to the existing placement files.

### Files modified (7)

`shared/constants/permissions.ts` · `repositories/placement.repository.ts` ·
`repositories/student.repository.ts` (added `clearPlacement`) ·
`controllers/placement.controller.ts` · `routes/v1/placement.routes.ts` · `routes/v1/index.ts` ·
`container.ts` · `services/job-application.service.ts` (decline sync) ·
`tests/integration/placement.test.ts`

No Examination, Grade Engine, CGPA Engine, Training, Attendance, Student Results, Transcript,
Company, Job Posting or Eligibility logic was changed.

### Database

One new collection, `placements`:

| Index | Purpose |
|---|---|
| **unique `(collegeId, applicationId)`** | One offer per application — the real duplicate guard |
| **unique partial `(collegeId, studentId, academicYear, isPrimaryOffer)` on `isPrimaryOffer: true`** | At most one primary offer per student per year |
| `studentId+status` · `companyId+status` | Student and recruiter views |
| `departmentId+academicYear` · `batchId+academicYear` | Department- and batch-wise reports |
| `status+offerDate` · `academicYear+package.ctc` | Report ordering and CTC figures |

The service catches `11000` and returns a conflict, exactly as the application service does.

### APIs added (13)

**Student** — `GET /placements/me` · `GET /placements/me/:id` · `POST /placements/me/:id/accept` ·
`POST /placements/me/:id/decline`

**Office** — `GET|POST /placements` · `GET|PATCH /placements/:id` · `POST /placements/:id/revoke` ·
`POST /placements/:id/joined` · `POST /placements/:id/not-joined` · `POST /placements/:id/verify` ·
`GET /placements/analytics` · `POST /placements/bulk/export`

### Selection integration — Option B

Selection sets `selected`; the office then records the offer explicitly. Chosen because
`createPlacementSchema` requires a designation, location, package and academic year that exist on
neither the application nor the posting, and because `isPrimaryOffer` is a judgement no automatic
step can make for a student weighing several offers.

### The offer state machine

```
offered → accepted → joined
offered → declined
```

`declined`, `joined`, `not_joined`, `offer_revoked` terminal.

**Answering is student-only.** `placement:respond` — the one new permission — is held by students
alone. The office holds `placement:update` and can revoke, record joining or correct details, but
`accept` and `decline` are refused for staff even where the edge is legal. A placement report has
to be able to say the student chose.

### Consistency between the two records

A declined offer marks its application `offer_declined`, and the pre-existing
`POST /applications/me/:id/decline-offer` now declines any linked offer. Both directions are
covered, so a report can never show an application declined against an offer still open. The
application endpoint keeps working unchanged for a selection with no offer recorded — backward
compatible.

### Permission audit (no fourth gap)

| Role | Placement |
|---|---|
| `platform_admin` | wildcard |
| `college_admin`, `placement_officer` | read_all, create, update, verify, report |
| `hod` | read_all |
| `faculty`, `trainer` | none |
| `student` | read, **respond** |

### Tests added (30)

Bringing `placement.test.ts` to 108. Covers all 18 of the brief's required cases plus:
cross-tenant 404, malformed-id rejection, unauthenticated 401, **database-level duplicate
protection asserted by bypassing the service**, incoherent-id rejection, relation population,
placed-flag set and cleared, `highestPackage` retained after a decline, primary-offer demotion,
analytics including median CTC and department breakdown, and formula injection in the export.

**Server total: 474 → 504.**

### Two decisions worth stating

1. **`highestPackage` survives a decline.** It is the best offer the student ever received, and
   declining does not unmake that. `clearPlacement` only flips `isPlaced`.

2. **The median CTC is reported alongside the mean.** One outlier offer skews a mean badly on a
   cohort of a few hundred, and the median is the more honest headline for a placement report.

### A test that caught the system working correctly

The primary-offer demotion test initially failed publishing a second drive with 422. The cause
was correct behaviour: the first offer had marked the student placed, and the default eligibility
excludes placed students, so nobody was eligible. The test now sets `allowPlacedStudents: true` —
which is exactly how a college configures a "dream offer" drive.

### Technical debt added

| Item | Impact | Notes |
|---|---|---|
| 9E (Interviews) not built | Medium | Scheduling on top of a shortlisted application. Contracts already exist in `placement.schema.ts`. |
| No Placement UI | High | ~50 endpoints across 9A–9F, no pages. `navigation.ts` links to `/college/placements`, `/student/jobs`, `/student/applications` — all still dead. |
| Offer letter upload not wired | Low | The model carries `offerLetter`, and `company_document`/`offer_letter` purposes exist. No endpoint sets it yet. |
| `placementCount` never decrements | Low | `clearPlacement` floors it rather than decrementing, so it reads as "offers ever held". Intentional but worth naming. |
| Placement report is offer-shaped | Low | `placementPercentage` divides live primary offers by active students college-wide; it does not yet respect an `academicYear` filter on the denominator. |

### Recommended next session

**The Placement UI**, not 9E. Roughly fifty endpoints across 9A–9F have no interface, three
navigation links are dead, and the module cannot be used by anyone. Interviews would add a
seventh backend slice to a module nobody can reach.

The natural first slice is the office side — companies, jobs, applications, offers — since that
is where a drive is actually run, followed by the student side.

---

## Session 19 — Placement UI, phases 1–2: API layer and Companies

The first placement interface. Scope was agreed up front: **Interviews omitted** (9E has no
backend), **phases 1–2 only**.

### Files created (7)

**API and lib (2)** — `api/placement-queries.ts`, `lib/placement-display.ts`
**Component (1)** — `components/placement/company-form.tsx`
**Pages (4)** — `college/placements/companies/{page, new/page, [id]/page, [id]/edit/page}.tsx`
**Tests (2)** — `tests/placement-display.test.ts`, `tests/companies-page.test.tsx`

### Files modified (1)

`config/navigation.ts` — added Companies under the existing Placement section.

No backend file was touched.

### The API layer

`placement-queries.ts` types **all 57 placement endpoints** across companies, jobs, applications
and placements, plus the student self-service surface. It mirrors `examination-queries.ts`:
types → `placementKeys` → queries → mutations sharing one `useInvalidatePlacement`. Four exports
come from one factory rather than four near-identical hooks.

Typing the whole domain now means phases 3–6 add pages only, not plumbing.

### Three things the API layer encodes

- **`Company.contacts` arrives empty for students.** The server strips recruiter details for
  anyone without `company:update`. `contactsWithheld()` distinguishes "not visible to you" from
  "none recorded" — they need different empty states, and the detail page renders each.
- **`usePlacementAnalytics` takes an `enabled` flag**, because it needs `placement:report`, which
  is narrower than `placement:read_all`. HOD holds the latter only.
- **`useSelectApplication` is separate from shortlist and reject**, because selecting needs
  `placement:create`.

### Companies UI

| Page | What it does |
|---|---|
| List | `DataTable` with server pagination/sort, search, industry/type/status filters, four stat tiles, selection bar with export and bulk remove |
| New | `useApiForm` + `createCompanySchema`, contact array with a radio-style primary toggle |
| Detail | Logo upload, drives list, verification panel, recruiter contacts, blacklist/reinstate, delete |
| Edit | Same form, pre-filled; warns when the company is blacklisted |

Everything is reused: `DataTable`, `SelectionBar`, `Breadcrumbs`, `PageHeader`, `StatCard`,
`ConfirmDialog`, `ReasonDialog`, `EmptyState`/`ErrorState`, `Badge`, `Card`, `Alert`,
`RouteGuard`, `useApiForm`, `useListParams`, `useDebouncedSearch`, the `FormSection`/`TextField`
family. No new design primitives were introduced.

### RBAC in the UI

Every action is gated with `can()`: `company:create` for the add button, `company:update` for
edit/bulk-delete/logo, `company:verify` for the verification panel, `company:blacklist` for
blacklist and reinstate. `RouteGuard` gates the routes on `company:read`. Client checks decide
what renders; the server re-checks every request.

Tests assert the negative cases — a caller with only `company:read` sees no create button and no
bulk delete, and a caller without it is redirected.

### Tests added (37)

| Suite | Tests | Covers |
|---|---|---|
| `placement-display.test.ts` | 24 | Every enum has a label and tone; the pipeline excludes terminal states; lakh/crore formatting and its boundaries; CTC range collapsing; relation and name fallbacks; redaction detection |
| `companies-page.test.tsx` | 13 | Row rendering, server-side list params, stat tiles, verified/blacklisted distinction, filter population, filter refetch, empty/loading/error states, and four RBAC cases |

**Client total: 65 → 102.** Server unchanged at 504.

### Verification

```
build:shared            ✓
typecheck               ✓  shared + server + client
eslint client/src+tests ✓  zero errors
vitest                  ✓  102 tests, 8 suites
jest                    ✓  504 tests, 17 suites (run separately)
build:client            ✓  36 routes (was 34)
```

### Contract findings carried forward

1. **Interviews have no backend.** `interview:*` permissions are assigned to every role and the
   target UI lists Interviews in both portals, but 9E was never built. Omitted rather than
   stubbed.
2. **`/college/placements` and `/college/reports` remain dead**, as does `/student/jobs` and
   `/student/applications`. Pre-existing; they land in phases 5–6.
3. **HOD can reach neither companies nor jobs** (`company:read`/`job:read` absent) but holds
   `placement:read_all`. The eventual placement dashboard must render for them without those
   sections.

### Technical debt added

| Item | Impact | Notes |
|---|---|---|
| Four sidebar links still dead | Medium | Unchanged from before this session; phases 3–6 close them. |
| No company detail page test | Low | The list page and the pure helpers are covered. The detail page has four dialogs and a file upload, which want their own suite. |
| Locations entered as a comma string | Low | Uncontrolled input writing an array on change. Fine for a handful of cities; a chip input would be better. |
| Logo upload has no client-side size check | Low | The server enforces 5 MB per purpose and returns a clear error; the UI just relays it. |

### Recommended next session

**Phase 3 — Job Postings.** The largest form in the module: compensation, selection rounds and
the eligibility builder with fifteen criteria. It also unlocks the eligible-students view, which
is the first place the eligibility engine becomes visible to a user.

---

## Session 20 — Placement UI, phase 3: Job Postings

The spine of the placement module: company → posting → eligibility → applications. Built entirely
on the existing backend; **no server, model or schema file was touched**.

### Files created (8)

**Components (3)** — `placement/job-form.tsx`, `placement/eligibility-builder.tsx`,
`placement/eligibility-summary.tsx`
**Pages (5)** — `college/placements/jobs/{page, new/page, [id]/page, [id]/edit/page,
[id]/eligible-students/page}.tsx`

### Files modified (4)

| File | Change |
|---|---|
| `api/placement-queries.ts` | Added `useBulkDeleteJobPostings` — the only missing hook of the 18 job endpoints |
| `lib/placement-display.ts` | Added job type, work mode, round type and eligibility-rule labels; widened `relationField` to accept interfaces |
| `components/form/form-field.tsx` | Added `CommaListField`; `nullable` on `NumberField` and `DateField` |
| `config/navigation.ts` | Job postings under the existing Placement section, gated on `job:read` |

### Two form bugs found by the new tests

Both were latent in the shared form layer, not specific to this module.

1. **An empty optional date submitted `''`**, which `z.coerce.date()` reads as an Invalid Date, so
   a posting with no drive date could never be saved. `DateField` now takes `nullable`, mapping an
   empty box to `null`.
2. **An empty optional number submitted `NaN`** for the same reason — `valueAsNumber` on a blank
   input. `NumberField` now takes `nullable`. Twelve of the sixteen eligibility criteria are
   optional numbers, so every one of them was affected.

Existing callers are untouched: both props are opt-in.

### The eligibility builder

All **16** criteria from `eligibilitySchema`, extracted from the schema rather than assumed, in
four groups an officer can read: Cohort, Academic record, Backlogs/attendance/gaps, Skills and
other conditions.

No rule is evaluated in React. The builder collects; the shared engine on the server decides. The
page says so where it matters — `customCriteria` carries an explicit note that free text is shown
to students but never checked, which is exactly what the engine does with it.

Two backend guards are surfaced rather than reimplemented:

- **Eligibility locks once anyone applies.** The `fieldset` disables and states why, because the
  server refuses the key outright — the edit page also omits `eligibility` from the patch in that
  case rather than resending it unchanged.
- **A posting cannot change company.** The update endpoint has no such field, so the picker is
  disabled on edit rather than silently ignored.

### Selection rounds

Add, remove and reorder. `order` is the backend's own field and the schema insists it runs 1…n
without gaps, so a move rewrites the whole column rather than swapping two numbers.

### The state machine stays on the server

The detail page renders `allowedTransitions` straight from `/jobs/:id/profile`. It holds no copy
of `JOB_TRANSITIONS`, so an illegal move is never offered and the two cannot drift. Closing and
cancelling ask for a reason; the rest confirm.

### Eligible students

`GET /jobs/:id/eligible-students` returns a plain array — no pagination, no search, ids not
populated, and no application status. So search and the department/batch filters run over what
arrived, department and batch names are resolved from the existing hooks, and no
application-status column was invented. The criteria that produced the list are shown above it.

### RBAC

| Action | Permission |
|---|---|
| Reach the list, detail, export | `job:read` |
| Create | `job:create` |
| Edit | `job:update` |
| Delete, bulk delete | `job:delete` |
| Publish, close, cancel, complete | `job:publish` |
| Eligible students | `application:read_all` |

The last is the one that matters: the roster names classmates with their CGPA and backlog count,
so `job:read` — which every student holds — is not enough. Two tests assert it, including that the
roster is never even requested without the permission.

HOD holds none of `job:*`, so the section stays hidden for them; they hold `placement:read_all`,
which the phase-5 dashboard will serve.

### Tests added (52)

| Suite | Tests | Covers |
|---|---|---|
| `jobs-page.test.tsx` | 13 | Rows, server-side list params, five stat tiles, status filter, company filter population, debounced search, empty/loading/error states, four RBAC cases |
| `job-detail-page.test.tsx` | 13 | Overview, rounds in order, only-set criteria rendered, custom-criteria disclaimer, exactly the server's transitions, publish confirm, cancel reason, delete blocked after applications, error state, five RBAC cases |
| `job-form.test.tsx` | 15 | Sections, company picker, required validation, CTC range rule, round add/remove/reorder/bounds, all 16 criteria present and grouped, eligibility lock, submitted payload shape, locked company |
| `eligible-students-page.test.tsx` | 11 | Roster, placed marker, criteria shown, client-side name/department filtering without refetch, clear, empty/loading/error, two RBAC cases |

**Client total: 102 → 154.** Server unchanged at 504.

### Verification

```
build:shared            ✓
typecheck               ✓  shared + server + client
eslint client/src+tests ✓  zero errors
vitest                  ✓  154 tests, 12 suites
jest                    ✓  504 tests, 17 suites (run separately)
build:client            ✓  38 static pages (was 36), 67 app routes (was 62)
```

### Backend gaps found

None blocking. Three contract facts worth recording:

1. **Job search covers `title` only.** Searching by company name needs a `searchableFields` change
   on `JobPostingRepository`; the company filter covers the common case meanwhile.
2. **`eligible-students` is unpaginated.** Fine at a few hundred students, not at several
   thousand. It also recomputes eligibility for the whole college on every call.
3. **No application-status join on the roster**, so "has this student already applied" cannot be
   shown there. The applications list in phase 4 answers it from the other direction.

### Technical debt added

| Item | Impact | Notes |
|---|---|---|
| No edit-page test | Low | The form and its lock are covered directly; the page is a thin adapter. |
| Eligible-students filtering is client-side | Medium | Correct for the current payload; becomes wrong if the endpoint ever paginates. |
| Comma-separated lists | Low | `CommaListField` is uncontrolled by necessity — re-rendering from the split value would eat the comma as it is typed. A chip input would be better. |
| `attachments` not editable | Low | The schema allows up to 10 and the create form sends `[]`. No UI yet; nothing depends on it. |

### A note on the figure previously called "routes"

Sessions before this one recorded "36 routes", which was in fact Next.js's **static page** count, not
the number of app routes. Both are now recorded: 38 static pages and 67 app routes. The five new
pages here are two static (the jobs list and the create page) and three dynamic.

### Recommended next session

**Phase 4 — Applications.** The pipeline view, bulk shortlist and reject, and selection. It is the
first place the office acts on students rather than on records, and it closes the loop from a
published posting to an offer.

---

## Session 21 — Placement UI, phase 4: Applications

The office side of the pipeline, from applied through to selected. **No backend file was touched**,
and **no new API hook was needed** — all nine office endpoints were already typed in session 19.

### Files created (3)

**Pages (1 route pair)** — `college/placements/applications/{page, [id]/page}.tsx`
**Tests (2)** — `tests/applications-page.test.tsx`, `tests/application-detail-page.test.tsx`

### Files modified (2)

| File | Change |
|---|---|
| `lib/placement-display.ts` | Office transition mirror, action labels and descriptions, the reason-requiring set |
| `config/navigation.ts` | Applications under the existing Placement section, gated on `application:read_all` |

### Two contract facts that shaped the UI

**There is no search.** `JobApplicationRepository` declares `searchableFields: []`, and
`BaseRepository.buildSearch` returns `null` when that list is empty — so `?search=` is silently
dropped. A search box would have looked like it worked and done nothing. The page offers four real
filters instead (status, role, company, department), and a test asserts no search box is rendered.

**`GET /applications/:id` returns no `allowedTransitions`**, unlike `/jobs/:id/profile`.
`APPLICATION_TRANSITIONS` lives only in the server service — not in `shared`, not on the wire. So
`OFFICE_APPLICATION_TRANSITIONS` in `placement-display.ts` is a deliberate, documented mirror,
narrowed to the transitions staff may drive. The server stays the authority: an illegal move still
fails with a 422 that the UI surfaces.

This is the one place in the placement UI where the client holds a copy of a state machine. See the
backend gaps below for the minimal fix.

### The authority split is respected

`withdrawn` and `offer_declined` are absent from the office mirror because they belong to the
student — `advance()` throws `'Withdrawing and declining an offer are the student's own actions.'`
for a staff caller. The office is never shown a button that would fail. A test asserts neither
action appears.

### Selecting is not shortlisting

Each action is gated on its own permission, resolved per target:

| Target | Permission |
|---|---|
| `under_review`, `shortlisted`, `in_process` | `application:shortlist` |
| `rejected` | `application:reject` |
| `selected` | **`placement:create`** |

Selecting is what creates an offer, so it carries the placement permission. A caller who may
shortlist and reject but not create placements sees every action except Select — asserted directly.

Selecting also does not create the offer record. The page says so rather than implying otherwise.

### Permissions, verified against the catalogue

| Role | What they get |
|---|---|
| `college_admin`, `placement_officer` | Full: list, detail, shortlist, reject, select |
| **`hod`** | `application:read_all` and nothing else — reads everything, drives nothing |
| `student` | No access to this module at all |

HOD is a real read-only case, so the detail page states it rather than rendering an empty toolbar.
Two further negatives are covered: `placement:read_all` does **not** open the applications list, and
neither does a student's `application:read`.

### Redaction

The populate config selects `rollNumber userId academics` and populates `userId` with
`firstName lastName email`. When `userId` comes back unpopulated the page says **"Contact details
are not visible to you"** — not "no contact information available", which would be a different and
false claim. Tested.

### History

Rendered with the existing `Timeline` from the server's own `history[]`: every status change, who
acted (student or office), when, and the reason given. Nothing is inferred or synthesised.

### Tests added (35)

| Suite | Tests | Covers |
|---|---|---|
| `applications-page.test.tsx` | 15 | Rows with frozen CGPA, server-side list params, absence of a search box, six stat tiles, status and role filters, empty/loading/error, bulk shortlist, bulk reject reason dialog, four RBAC cases |
| `application-detail-page.test.tsx` | 20 | Candidate, submission, history with actors, links out, legal-only actions, no student-owned actions, terminal status, advance/reject/select endpoints, redaction, withdrawal, error, six RBAC cases |

**Client total: 154 → 189.** Server unchanged at 504.

### Verification

```
build:shared            ✓
typecheck               ✓  shared + server + client
eslint client/src+tests ✓  zero errors
vitest                  ✓  189 tests, 14 suites
jest                    ✓  504 tests, 17 suites (run separately)
build:client            ✓  39 static pages (was 38), 69 app routes (was 67)
```

**A note on the session 20 server run.** The first full run reported 502/504 with a 3046s runtime
against a normal ~300–540s. The failing suite was `attendance.test.ts`; re-run alone it passed 30/30
in 39s, and a clean full re-run passed **504/504 in 537s**. Nothing in sessions 20 or 21 changed
server or shared source. This is the contention flakiness already recorded under Known Issues, and
the run time is the reliable tell.

### Backend gaps found

| Gap | Why it matters | Minimal fix |
|---|---|---|
| `APPLICATION_TRANSITIONS` is server-only | The client mirrors it, so the two can drift | Move the map into `shared/src/constants/`, or return `allowedTransitions` from `GET /applications/:id` as `/jobs/:id/profile` already does |
| No searchable fields on applications | Cannot find a candidate by name or roll number | Add `searchableFields` — but the searchable text lives on the populated `Student`, so this needs an aggregation, not a one-line change |
| No documents beyond `resumeUrl` | No document panel can be built honestly | None needed unless the product wants one |

None of these were changed. All three are reported rather than patched.

### Technical debt added

| Item | Impact | Notes |
|---|---|---|
| Client-side copy of the application state machine | Medium | The only one in the placement UI. Pinned by tests, but a shared constant would remove the class of bug. |
| No per-round detail on shortlist | Low | `POST /:id/shortlist` accepts `roundOrder`, `score` and `feedback`; the UI uses `/advance` for stage moves and does not capture a score. Interviews (9E) is where that belongs. |
| Bulk actions do not show per-row outcomes | Low | The toast reports counts and the first server reason, matching the companies and jobs pattern. A per-row result panel would be better. |

### Recommended next session

**Phase 5 — Offers and the placement dashboard.** The last office-side gap: recording an offer
against a selected application, the offer lifecycle already built in session 18, and the dashboard
at `/college/placements` that four navigation links still point at. HOD holds `placement:read_all`
without `company:read` or `job:read`, so that dashboard is the one placement page they can actually
use — it needs to render without the sections they cannot see.

---

## Session 22 — Placement UI, phase 5: Offers, the dashboard, and one shared state machine

Closes the office side of placement. `/college/placements` is no longer dead.

### Part A — the duplicated state machine is gone

`APPLICATION_TRANSITIONS` existed twice: once in the server service, once as a literal in
`placement-display.ts`. Both maps now live in **`shared/src/constants/state-machines.ts`**, together
with `PLACEMENT_TRANSITIONS` and the two student-owned sets.

- The server imports and **re-exports** them, so every existing import path still resolves and no
  validation changed — an illegal transition still throws `InvalidStateTransitionError` (422).
- The client **derives** its office view with `officeTransitions(map, studentOwned)` rather than
  restating it. The literal is deleted.
- `PLACEMENT_TRANSITIONS` moved at the same time. It was about to be copied into the client for the
  offer UI, so moving it prevented the very duplication Part A removes.

No circular dependency: `state-machines.ts` imports two types from `./enums` and nothing else.

### Files created (6)

**Shared (1)** — `constants/state-machines.ts`
**Component (1)** — `components/placement/offer-form.tsx`
**Pages (3)** — `college/placements/page.tsx`, `placements/offers/{page, [id]/page, new/page}.tsx`
**Tests (3)** — `placement-state-machines`, `offer-detail-page`, `placement-dashboard`

### Files modified (6)

| File | Change |
|---|---|
| `shared/src/index.ts` | Export the new constants module |
| `server/.../job-application.service.ts` | Import + re-export `APPLICATION_TRANSITIONS`; `STUDENT_TRANSITIONS` built from the shared set |
| `server/.../placement.service.ts` | Same for `PLACEMENT_TRANSITIONS` and `STUDENT_ONLY` |
| `client/.../placement-display.ts` | Derive both office maps; add offer action labels and the reason set |
| `client/.../placement-queries.ts` | `useCompanies` takes an `enabled` flag |
| `client/.../applications/[id]/page.tsx` | "Record the offer" link on a selected application |
| `client/.../navigation.ts` | Offers under Placement, gated on `placement:read_all` |

Server behaviour is unchanged. No model, schema, route or controller was touched.

### Three corrections to the brief

1. **`placement:revoke` does not exist.** The catalogue holds exactly seven placement permissions.
   Revoking, recording a joining and recording a no-show are all `placement:update`.
2. **HOD holds `placement:read_all` and not `placement:report`**, so `/placements/analytics` — which
   requires the reporting permission — is gated behind an `enabled` flag rather than called and
   failed.
3. **`Placement.offerLetter` is readable but unwritable.** See below.

### Part C — the offer letter

`Placement.offerLetter` exists on the model and in the client type. `POST /files/upload` accepts
`purpose: 'offer_letter'` (10 MB, PDF only). But **nothing writes the field**: neither
`createPlacementSchema` nor `updatePlacementSchema` carries it, and the service never sets it.

So the detail page **links a letter when one is present and shows no upload control**, with an empty
state saying plainly that uploading is not available yet. A working-looking upload button that
dropped the key on the floor would have been worse than nothing.

Minimal fix, not made: add `offerLetter` to `updatePlacementSchema` and assign it in
`PlacementService.update`, reusing the storage service the company logo already uses.

### Part D — the dashboard, gated section by section

The roles that reach `/college/placements` differ sharply, so every section is a permission
decision, not decoration:

| Section | Gate | Why |
|---|---|---|
| Headline stats, package spread, status split | `placement:report` | `/placements/analytics` requires it |
| By department | `department:read` | The aggregation returns bare ids; names need the departments endpoint |
| Top recruiters | `company:read` | Same, for company names — HOD does not hold this |
| Recent offers | `placement:read_all` | The route guard itself |
| Drives link | `job:read` | HOD cannot open a drive |

A HOD therefore sees the recent-offers table and an explanation of why the figures are absent —
rather than an empty dashboard or a wall of 403s. **Three tests assert that the analytics, companies
and departments endpoints are never even requested** without the matching permission.

The status split is a proportion bar built from `Card` and a div, not a new chart dependency.

### Part B — the offer workflow

```
selected application → Record the offer → offered
   → student accepts or declines (never the office)
   → office records joining, a no-show, or revokes
```

`OFFICE_PLACEMENT_TRANSITIONS` leaves the office exactly `offer_revoked` from `offered`, and
`joined | not_joined | offer_revoked` from `accepted`. Accepting and declining never appear — the
shared map removes them and the API needs `placement:respond`, which only students hold. The page
says so where an officer might otherwise look for the button.

`/offers/new` reads its application by id and carries the four relations through as fixed defaults,
because the API derives an offer from one specific application; re-picking them would invite a
mismatch the server would reject at the end. Arriving without an `applicationId` is an empty state
pointing back at the application, not a blank form.

### Tests added (51)

| Suite | Tests | Covers |
|---|---|---|
| `placement-state-machines.test.ts` | 12 | Both shared maps cover their enums, name no target outside them, match the documented lifecycles, treat terminals as terminal; `officeTransitions` filters, preserves keys and does not mutate; the office views never contain a student-owned target and equal the filtered shared map |
| `offer-detail-page.test.tsx` | 21 | Package formatting per component, primary/verified badges, history, links out, no upload control, letter link when present, no accept/decline for the office, per-status actions, revoke reason, joining without a reason, verify, declined state, redaction, loading/error, three RBAC cases |
| `placement-dashboard.test.tsx` | 15 | Headline figures, all four package figures, department and recruiter name resolution, recent offers, academic-year filter, empty/loading/error, seven RBAC cases including the three "never requested" assertions |

One existing test was updated: the application detail page's "Selected" copy changed when the
"Record the offer" link was added, and a new case asserts that link is hidden without
`placement:create`.

**Client total: 189 → 240.**

### Verification

```
build:shared            ✓
typecheck               ✓  shared + server + client
eslint                  ✓  client/src, client/tests, shared/src, server/src — zero errors
vitest                  ✓  240 tests, 17 suites
jest                    ✓  504 tests, 17 suites, 837s (run separately)
build:client            ✓  42 static pages (was 39), 73 app routes (was 69)
```

The server run matters more than usual this session: Part A changed two services. All 504 pass
unchanged, which is the point — moving the maps into `shared` was meant to alter nothing.

### Backend gaps found

| Gap | Impact | Minimal fix |
|---|---|---|
| No write path for `offerLetter` | The field can never be populated | Add it to `updatePlacementSchema` and assign it in `PlacementService.update` |
| Placement analytics returns ids, not names | Every consumer must resolve departments and companies itself, and cannot when it lacks the permission | `$lookup` the name into the aggregation, or accept the client-side join |
| `GET /placements/:id` returns no `allowedTransitions` | Mitigated, not fixed — the map is now shared rather than duplicated | Return it, as `/jobs/:id/profile` already does |

### Technical debt added

| Item | Impact | Notes |
|---|---|---|
| No offer edit page | Low | `PATCH /placements/:id` exists and is unused by the UI. Joining date, designation, location and the primary flag are all updatable; only the transitions are wired. |
| Academic years are computed, not fetched | Low | A five-year window rolling on a June turnover. There is no endpoint listing the years actually in use. |
| Dashboard `byBatch` unused | Low | Rendered nowhere; batch names would need another lookup for a third breakdown of the same figures. |

### Recommended next session

**Phase 6 — the student placement portal.** `/student/jobs` and `/student/applications` are the last
dead links, and the self-service API is complete and typed: `useMyOpenings`, `useMyEligibility`,
`useApplyToJob`, `useMyApplications`, `useWithdrawApplication`, `useMyOffers`, `useAcceptOffer`,
`useDeclineOffer`. Accepting and declining an offer live there — they are the half of the offer
lifecycle this session deliberately did not build.

---

## Session 23 — Phase 6: the student placement portal

The last two dead links are gone. A student can now find a drive, see whether they qualify, apply,
track the application, and answer an offer — all through the self-service API, with **no backend
change**.

### Files created (7)

**Components (3)** — `student/eligibility-notice.tsx`, `student/apply-dialog.tsx`,
`student/offer-panel.tsx`
**Pages (4)** — `student/jobs/{page, [id]/page}.tsx`, `student/applications/{page, [id]/page}.tsx`
**Tests (3)** — `student-jobs`, `student-applications`, `student-application-detail`

### Files modified (1)

`api/placement-queries.ts` — added `useDeclineApplicationOffer`, the one endpoint that had no hook.

`config/navigation.ts` was **not** touched: both entries already existed with the right permissions
(`job:read`, `application:read`). They were dead because the routes were missing, not the nav.

### Identity is never in the browser's hands

Every request goes to a `/me` path — `/jobs/me/openings`, `/applications/me`, `/applications/me/:id`,
`/placements/me` — and the server resolves the student from the token through `requireOwnStudent`,
`requireOwnApplication` and `requireOwnPlacement`. There is no student picker, no id in any URL the
UI builds, and three tests assert no request ever carries a `studentId`.

A 404 on `/applications/me/:id` is rendered as "It may have been removed, or it is not yours" —
the server answers that way deliberately, because confirming the record exists would leak that it
does.

### Eligibility stays on the server

The list carries `eligible` and `reasons` per drive, decided by the shared engine; the detail page
calls `/jobs/me/eligibility/:id`. `EligibilityNotice` renders the verdict and the server's own
wording. React computes nothing, so the screen cannot disagree with what `apply` will do — and apply
re-checks eligibility, the window and duplicates regardless of what the UI believed.

### Two API shapes that shaped the build

1. **`myOpenings` and `myApplications` return plain arrays** — no pagination, no server search. So
   search and the engagement/work-mode/eligibility filters run over what arrived, and a test asserts
   filtering never refetches. No control is offered that the endpoint could not honour.
2. **`myOpenings` does not say whether you already applied.** The applied badge is joined from
   `/applications/me` — two responses the student is already entitled to, rather than an invented
   field.

### The two decline paths, and why both exist

`POST /placements/me/:id/decline` sets the application to `offer_declined`; `POST
/applications/me/:id/decline-offer` sets the placement to `declined`. The server keeps both records
in step whichever end is used.

The offer panel owns the answer whenever a `Placement` exists. The application page offers decline
only in the window where the office has selected the candidate but not yet recorded a written offer
— which is the only case the application endpoint uniquely serves. That window is also stated on
screen rather than left as an empty space.

### What the student cannot do

`withdraw` is offered only from `applied`, `under_review`, `shortlisted` and `in_process`, matching
`WITHDRAWABLE` in the service — once selected the service refuses it and tells you to decline the
offer instead, so the UI offers decline there rather than a button that would fail.

Accept and decline appear only while an offer is `offered`. Once answered they are gone, not
disabled.

No office hook is imported anywhere under `components/student` or `app/student`. Two tests assert
it: one sweeps for nine office action labels, two more assert every request URL begins `/jobs/me`,
`/applications/me` or `/placements/me`.

### Offer letter

Read-only, as recorded in session 22. The panel links a letter when the record carries one and says
plainly that none is attached when it does not. No upload control — there is still no write path.

### Tests added (41)

| Suite | Tests | Covers |
|---|---|---|
| `student-jobs.test.tsx` | 12 | Cards with package and deadline, the server's eligibility verdict, no `studentId` in any request, client-side search/engagement/eligibility filters that never refetch, applied badge joined from own applications, empty/loading/error, redirect without `job:read`, self-service URLs only |
| `student-applications.test.tsx` | 9 | Own applications only, no student id, offer matched to its application, status filter, empty/loading/error, redirect, self-service URLs only |
| `student-application-detail.test.tsx` | 20 | Self-service path, status/round/frozen record, timeline with actors, withdraw with reason, no withdraw once selected or terminal, offer panel, accept, decline with reason, accepted/declined/revoked/joined states, decline on the application when no offer exists, 404 handling, loading, no office action, self-service URLs only, redirect, withdraw hidden without the permission |

**Client total: 240 → 281.**

### Verification

```
build:shared            ✓
typecheck               ✓  shared + server + client
eslint                  ✓  client/src, client/tests, shared/src, server/src — zero errors
vitest                  ✓  281 tests, 20 suites
jest                    ✓  504 tests, 17 suites, 749s (run separately)
build:client            ✓  44 static pages (was 42), 77 app routes (was 73)
```

### Backend gaps found

None new. The three already recorded still stand: no write path for `Placement.offerLetter`,
placement analytics returning ids rather than names, and `GET /placements/:id` not returning
`allowedTransitions`.

One observation rather than a gap: `myOpenings` could carry an `applied` flag, which would remove
the client-side join on the jobs page. The join is correct today and costs one request the page
already makes.

### Technical debt added

| Item | Impact | Notes |
|---|---|---|
| Jobs and applications filter client-side | Medium | Correct for arrays capped at 500 server-side. If either endpoint ever paginates, both pages need reworking. |
| No student offers route | Low | Offers are surfaced inside the application they belong to. A standalone `/student/offers` would suit a student holding several. |
| Apply captures no screening answers | Low | `applyToJobSchema` accepts up to 20 question/answer pairs; the dialog sends `[]` because no posting field defines the questions. |

### Recommended next session

**9E Interviews**, or hardening. Interviews is the last unbuilt placement phase: `interview:*`
permissions are assigned to every role and the schemas exist in `placement.schema.ts`
(`scheduleInterviewSchema`, `bulkScheduleInterviewSchema`, `rescheduleInterviewSchema`,
`recordInterviewResultSchema`), but there is no model, service, controller or route. The catalogue
therefore advertises a capability the API does not have — worth closing either by building 9E or by
removing the permissions until it exists.

---

## Session 24 — Phase 9E-A: the Interviews backend

The contract layer for interviews had existed since before 9E was postponed — five permissions,
six Zod schemas, three enums, two socket events and an email template — with **no executable code
behind any of it**. The permission catalogue was advertising five capabilities the API could not
serve. This session closed that.

### Files created (5)

`shared/src/constants/state-machines.ts` *(extended)* · `server/src/models/interview.model.ts` ·
`server/src/services/interview.service.ts` · `server/src/controllers/interview.controller.ts` ·
`server/tests/integration/interview.test.ts`

### Files modified (5)

`shared/src/constants/permissions.ts` · `server/src/repositories/placement.repository.ts`
(+`InterviewRepository`) · `server/src/routes/v1/placement.routes.ts` (+`interviewRoutes`) ·
`server/src/routes/v1/index.ts` (mount) · `server/src/container.ts` (2 registrations)

### One permission added, to one role

`interview:respond` — **student only**. All seven roles audited afterwards: college_admin and
placement_officer keep the four office permissions, HOD keeps `read_all` alone, faculty and trainer
hold none, platform_admin is wildcard.

Confirming a slot and asking for another time are student actions. Gating them on `interview:read`
would have made reading an interview imply the right to change one.

### 12 endpoints

Office (8): list, get, schedule, bulk-schedule, reschedule, cancel, transition, record-result, plus
analytics. Student (4, all `/me`-scoped): list, get, confirm, request-reschedule.

### Four indexes, each earning its place

`{collegeId, applicationId, roundOrder}` **unique** on `deletedAt: null` — the duplicate guard, at
the database rather than only in the service, because bulk scheduling writes many rows at once and
two overlapping requests would each pass a service-level check. Then `{collegeId, studentId,
scheduledAt}` for the student list, `{collegeId, jobPostingId, status}` for the office list, and
`{collegeId, scheduledAt, status}` for the day view. A `companyId` index was dropped — reachable
through `jobPostingId`.

### Recording a result does not move the application

The load-bearing decision. `interview:record_result` and `application:shortlist`/`reject` are
separate permissions held by separate people, so writing the application from the interview service
would let anyone with the first drive a candidate's progress without ever holding the second. The
service returns `suggestedApplicationStatus` instead, and the office acts on it through the
application API. A test asserts the application stays at `shortlisted` after a `cleared` result.

### Tests added (39)

Auth, scheduling, duplicate protection, bulk slot layout across panels, lifecycle, illegal
transitions, results, student self-service, RBAC across four roles, tenancy, analytics, malformed
ids, persistence.

Four of my expectations were wrong rather than the code: body validation returns **400**, not 422,
and an illegal transition **409**. A fifth failure was a real fixture bug — two emails of equal
length produced identical roll numbers.

### Verification

```
build:shared            ✓
typecheck               ✓  shared + server + client
eslint server/src+shared/src ✓  zero errors
jest                    ✓  543 tests, 18 suites, 938s (was 504/17)
```

### Reported, not built

`SOCKET_EVENTS.INTERVIEW_SCHEDULED`, `INTERVIEW_RESCHEDULED` and the `interview-scheduled` email
template remain senderless. Notifications go through `notifySafely` with `category: 'placement'` —
the existing path. Emitting sockets from a service is not a pattern this codebase has, and adding
one would have been inventing infrastructure rather than using it.

---

## Session 25 — Phase 9E-B: the Interview UI

Both portals, no backend change.

### Files created (8)

`components/placement/reschedule-dialog.tsx` · `components/placement/result-dialog.tsx` ·
five pages · `tests/helpers/interview.ts` · two test suites

### Files modified (3)

`api/placement-queries.ts` (13 hooks) · `lib/placement-display.ts` · `config/navigation.ts`

### Routes (5)

`/college/placements/interviews`, `/[id]`, `/schedule`; `/student/interviews`, `/[id]`

### No client copy of the state machine

`OFFICE_INTERVIEW_TRANSITIONS` derives from the shared map via `officeTransitions`. `confirmed`
drops out on its own because it is student-owned, and a test asserts the office is never shown a
confirm button.

### Two API limitations found, and one bug avoided

**A date filter was built and then removed.** `interviewListQuerySchema` carries no `scheduledAt`,
and `validate` strips unknown query keys — the control would have looked functional and changed
nothing. A test now asserts its absence.

I also nearly used `field:op` for the filter operator; the real syntax is **`field[op]`**. Caught by
reading `buildFilterFromQuery` rather than assuming.

**Search is real but narrow** — `roundName` is the repository's only searchable field, so the box
says "Search round name" rather than implying it searches candidates.

### Tests added (45) — client 281 → 326

Including: the result dialog posts to `/interviews/:id/result`, renders the suggestion with
"Nothing has changed on the application", and **no `/applications` endpoint is called**.

### Verification

```
typecheck               ✓  shared + server + client
eslint (4 scopes)       ✓  zero errors
vitest                  ✓  326 tests, 22 suites
build:client            ✓  47 static pages, 82 app routes (was 44/77)
```

---

## Session 26 — Final placement audit, and two P1 authorization fixes

A read-only audit across twenty headings, then the two P1 findings it produced.

### What the audit confirmed

- All 24 placement pages carry a `RouteGuard`, and each permission matches its endpoint.
- **Zero client-side state-machine duplication** — a grep for a transition literal in `client/src`
  returns nothing; all three derive from `shared/src/constants/state-machines.ts`.
- Student pages call only `/me` endpoints, plus `GET /jobs/:id`, which students legitimately hold
  `job:read` for.
- Cross-tenant reads return 404, not 403.

### The two P1 findings — same class, both real

`application:read_all` and `interview:read_all` open their pages to **HOD**, who holds neither
`company:read` nor `job:read`. Both pages fired those lookups ungated, earning 403s and leaving
filters looking merely empty. The dashboard had already solved this; these two diverged from it.

**Fixed in 3 files.** `useJobPostings` gained an `enabled` parameter — the same signature
`useCompanies` and `useInterviews` already carry. The applications page gained three gates, not
two: `useDepartments` was also ungated, and although HOD happens to hold `department:read` so it
never 403'd, leaving one of three ungated would have been the same latent bug. Filters that cannot
be populated are now hidden rather than rendered empty.

### One fixture correction

The `HOD` fixture in `applications-page.test.tsx` lacked `department:read`, understating the role's
real access and making a new assertion pass for the wrong reason. Corrected against the catalogue.

### Tests added (7) — client 326 → 333

Four applications, three interviews. They assert the request **is never made** — inspecting
`apiGetPaginated.mock.calls` — not that a 403 is handled. Each is balanced by a positive case
proving a placement officer still receives both requests and both filters.

### Verification

```
typecheck               ✓  shared + server + client
eslint (4 scopes)       ✓  0 errors each, run separately
vitest                  ✓  333 tests, 22 suites
build:client            ✓  47 static pages, 82 app routes
jest                    ✓  543 tests — 513 in-run + student.test.ts 30/30 isolated
```

**On the server figure.** The full run reported 30 failures, all in `student.test.ts`, none of them
an assertion: `MongoMemoryServer Instance failed to start within 10000ms` at `tests/setup.ts:21`, so
the in-memory replica set never came up and the suite aborted at the harness level. Re-run alone it
passes 30/30 in 63s. This session changed no server or shared source. Recorded as "513 in-run + 30
isolated" rather than claiming one clean 543 run.

### Remaining, unchanged

**P2:** `POST /jobs/close-expired` has no hook or UI, so `job:close` is advertised but unreachable ·
`placementKeys.studentEligibility` is defined and unused · 24 pre-existing `import/order` errors in
`server/tests`, which has never been in lint scope · `slotsPerPanel` is required by the schema and
unused by `slotFor`.

**P3:** no write path for `Placement.offerLetter` · placement analytics returns ids, not names ·
neither `GET /placements/:id` nor `GET /applications/:id` returns `allowedTransitions` · interview
socket events and email template have no sender.

### Recommended next session

**The 13 dead non-placement routes** — `/college/reports`, `/college/analytics`, `/college/audit`,
`/college/support`, `/college/roles`, `/college/settings`, and seven student routes. This is the
largest remaining body of work and the honest reason overall sits at ~96% rather than higher.
`/college/reports` is the highest-value single target: `report:generate` and `report:export` are
assigned to four roles and the export service already exists.

---

## Session 27 — `/college/reports`

The first of the thirteen dead routes. It began with a finding that changed the plan.

### There is no report module

`find -iname "*report*"` across `shared/src`, `server/src` and `client/src` returns nothing. No
report model, repository, service, controller, route or schema exists.

`report:generate` and `report:export` are defined in the catalogue and assigned to four roles, but
**no server route reads either**. Their only occurrence outside `permissions.ts` was the navigation
entry. That is the same defect class as `interview:*` before 9E — a permission advertising a
capability the API cannot serve.

So there was no report-generation API to build a form around, and none was invented.

### What was built instead

A permission-aware index over the **9 analytics endpoints and 11 export endpoints that genuinely
exist**, each request gated on the permission the *server* enforces rather than on `report:*`.
`report:generate` decides who reaches the page; it does not decide what they may read.

### Files created (2) · modified (5)

`app/college/reports/page.tsx` · `components/reports/report-section.tsx`

Six analytics hooks gained an `enabled` flag — `useExaminationAnalytics`, `useCourseAnalytics`,
`useTrainingAnalytics`, `useCompanyAnalytics`, `useJobAnalytics`, `useApplicationAnalytics` — the
same signature `usePlacementAnalytics` already carried. No new API architecture, no backend change.

### Exports require two permissions, not one

`report:export` **and** the module's own export permission. The first is what the catalogue says the
feature means; the second is what the server checks. Either alone would be half a gate.

Four roles produce four genuinely different pages. Faculty is the sharpest: they reach the page and
hold no export permission at all.

### Tests added (15) — client 333 → 348

Proving the request never leaves the browser: HOD never fires `/placements/analytics`,
`/companies/analytics` or `/jobs/analytics`; faculty fires six fewer endpoints and renders zero
export controls; a caller holding only `report:generate` never calls `apiGet` at all. The academic
year filter reaches **only** `/placements/analytics` — the one endpoint that accepts it.

### One bug caught in myself

Three analytics field names were guessed — `courses.active`, `training.totalSessions`,
`training.totalRequests`. Typecheck rejected all three; the real shapes are `published`/`draft` and
nested `sessions`/`requests`/`completion` objects. The sections now render six real figures each
instead of two invented ones.

### Verification

```
typecheck               ✓  shared + server + client
eslint (4 scopes)       ✓  0 errors each, run separately
vitest                  ✓  348 tests, 23 suites
jest                    ✓  543 tests, 18 suites, 1013s — clean single run
build:client            ✓  48 static pages, 83 app routes
```

---

## Session 28 — `/college/analytics`

The second dead route, and a deliberate decision not to duplicate the first.

### The backend offers exactly two analytics endpoints

| | `GET /departments/:id/analytics` | `GET /batches/:id/analytics` |
|---|---|---|
| Permission | `analytics:read` | `analytics:read` |
| Second guard | `assertCanAccessDepartment(id)` | `assertCanAccessBatch(id)` |
| Query parameters | **none** | **none** |

Both are `validate({ params: idParamSchema })` — no query schema at all. That is the whole filter
story, and the reason this page renders **no filter controls**: any date range, academic year or
status control would be stripped by validation and change nothing.

`analytics:read_all` is held by college_admin and used by **no endpoint** — a third dead permission
alongside `report:generate` and `report:export`. Reported, not fixed.

### Why it is not a copy of Reports

Both endpoints were already surfaced on `/college/departments/[id]` and `/college/batches/[id]`,
one at a time. What no page did was put them **side by side**, so that is what this one does:
departments compared across seven figures, then batches within a chosen department.

Nothing is totalled across rows. The API publishes no college-wide figure, and summing one here
would be inventing a statistic the server never computed.

### Each row owns its request

The API is per-id, so a row fetches its own figures. That is what makes the ScopeGuard behaviour
render correctly: `assertCanAccessDepartment` denies **one row**, which is marked "Not visible to
you" while every other row still shows its figures. A single batched call could not express that.

### Files created (2) · modified (2)

`app/college/analytics/page.tsx` · `components/analytics/analytics-row.tsx`

`useBatches` gained an `enabled` flag. `useDepartmentAnalytics` and `useBatchAnalytics` already
existed with `enabled: Boolean(id)` and needed no change.

### A bug caught during implementation

`useBatches` was being called unconditionally while the batches section was permission-hidden —
exactly the P1 class fixed in session 26. A caller without `batch:read` would have fired `/batches`
and earned a 403. Now gated twice: on the permission, and on a department having been chosen.

### Tests added (15) — client 348 → 363

Including: no analytics request without `analytics:read`; no `/batches` request without
`batch:read`; no `/departments` request without `department:read`, with `apiGet` never called at
all; **no `/students` request ever**, since the page shows aggregates only; and a 403 on one
department marking that row alone while the rest still render.

### Verification

```
typecheck               ✓  shared + server + client
eslint (4 scopes)       ✓  0 errors each, run separately
vitest                  ✓  363 tests, 24 suites
jest                    ✓  543 tests, 18 suites, 1068s — clean single run
build:client            ✓  49 static pages, 84 app routes
```

Both server runs this cycle completed cleanly in a single pass, with no MongoMemoryServer startup
failure — the contention issue did not recur.

### Backend gaps recorded, not fixed

Three dead permissions now: `report:generate`, `report:export` and `analytics:read_all`, none read
by any route. The analytics endpoints also offer no aggregate — a college-wide figure would need a
new endpoint, not a client-side sum.

### Remaining dead routes (11)

`/college/audit` · `/college/support` · `/college/roles` · `/college/settings`, and seven student
routes: `/student/courses`, `/student/assignments`, `/student/exams`, `/student/attendance`,
`/student/profile`, `/student/support`, `/student/settings`.

### Recommended next session

`/college/roles` or `/college/settings` — both have real backing (`role:read`, `settings:read`) and
are small, self-contained college-portal pages. `/college/audit` is also well backed by the
append-only audit log. The seven student routes are the larger remaining block.

---

## Session 29 — `/college/roles`

The third dead route, and the second in a row where the backing API turned out not to exist.

### There is no roles API

`RoleModel` and `RoleRepository` exist, but there is **no role service, controller or routes file**,
and no `/roles` router is mounted in `routes/v1/index.ts`. The repository is used only internally,
by `auth`, `department`, `faculty` and `student` services looking a role up by key.

Four of the five role permissions are therefore dead: `role:read`, `role:create`, `role:update` and
`role:delete` are assigned to college_admin and read by **no route**. Only `role:assign` is live —
`department.routes.ts:85` uses `authorize('department:update', 'role:assign')` for appointing a head
of department.

That is now the fourth dead permission group found, after `report:generate`, `report:export` and
`analytics:read_all`.

### What was built

A read-only role catalogue that **makes no API request at all**.

The data is not invented: `ROLE_DEFINITIONS` and `DEFAULT_ROLE_PERMISSIONS` in `@peacefic/shared`
are the same source `seedRoles()` writes into the database with `isSystem: true`, and
`PERMISSION_DEFINITIONS` carries the module and description of every permission. The client already
bundles all three. So the page renders the authoritative catalogue rather than a fabrication of it.

No Create, Edit or Delete control appears — not even for a college_admin holding `role:create` —
because there is nothing behind them. The page says so plainly instead of hiding the fact.

### Files created (3)

`lib/role-display.ts` · `app/college/roles/page.tsx` · `app/college/roles/[id]/page.tsx`

### Files modified — none

`navigation.ts` already carried the entry, gated on `role:read`. No hook, no API layer and no
backend file was touched.

### Routes (2)

`/college/roles` — the catalogue, with reach, portal, permission count and sensitive count per role.
`/college/roles/[id]` — one role's permissions grouped by module, each with the catalogue's own
description, and sensitive ones marked.

`platform_admin` is deliberately excluded: it is a platform-tenant role, not a college one.

### A bug found in my own code

The first draft rendered a wildcard branch — "Every permission" — for roles holding `*:*`. A test
proved it unreachable: `platform_admin` is the only wildcard holder and it is excluded from this
page, so every role shown has an explicit, countable permission list. Both branches were removed
rather than left as dead UI, and the replacement test asserts no listed role holds the wildcard.

### Tests added (16) — client 363 → 379

Including the strongest assertion available here: **every API verb is mocked and
`everyCall()` is asserted empty**, proving the page issues no request whatsoever — on the list, on
the detail, and when the guard turns a caller away. Also asserted: no create/edit/delete control
renders even for a caller holding `role:create`; no search, filter or pagination control renders,
because no API supports them; and every permission shown exists in `PERMISSION_DEFINITIONS`.

### Verification

```
typecheck               ✓  shared + server + client
eslint (4 scopes)       ✓  0 errors each, run separately
vitest                  ✓  379 tests, 25 suites
build:client            ✓  50 static pages, 86 app routes
jest                    △  511 passed in-run; the 2 failing suites pass isolated
```

**The server run was not clean, and is not reported as though it were.** 32 tests failed and every
one of them reported `Instance failed to start within 10000ms` — the MongoMemoryServer replica set
never came up for those workers. No assertion failed. Isolated, `student.test.ts` passes 30/30 in
283s and `placement.test.ts` passes 108/108 in 197s against 1248s in-run, a sixfold contention
slowdown. All 543 tests are therefore accounted for, but across a full run plus two isolated runs —
not in one pass. This session changed no server or shared source.

### Backend gap, recorded not fixed

A roles API would need a service, controller, routes file and mount before any of
`role:read`/`create`/`update`/`delete` did anything. Custom per-college roles are already modelled —
`RoleModel` carries `collegeId` and `isSystem` — so the schema supports them and only the HTTP layer
is absent. That is a deliberate future decision, not something to add under a UI task.

### Remaining dead routes (10)

`/college/audit` · `/college/support` · `/college/settings`, and seven student routes:
`/student/courses`, `/student/assignments`, `/student/exams`, `/student/attendance`,
`/student/profile`, `/student/support`, `/student/settings`.

### Recommended next session

`/college/audit`. It is the best-backed of the three remaining college routes — the append-only
audit log is written by every module in the system and `audit:read` gates real data — so unlike
Reports, Analytics and Roles, it should not turn out to be a page over a missing API. Worth
confirming by inspection first, given three routes running.

---

## Session 30 — `/college/audit`, and the HTTP layer it needed

The fourth dead route, and the first where adding backend was the right answer rather than a
shortcut. Reports, Analytics and Roles all turned out to have no dedicated API and were built over
what existed. Audit was different: the model, the repository and the writer were all complete and
already tenant-scoped — only the HTTP layer was missing.

### Files created (6)

**Shared (1)** — `schemas/audit.schema.ts`
**Server (3)** — `controllers/audit.controller.ts`, `routes/v1/audit.routes.ts`,
`tests/integration/audit.test.ts`
**Client (3)** — `api/audit-queries.ts`, `lib/audit-display.ts`,
`components/audit/audit-detail-dialog.tsx`, `app/college/audit/page.tsx`,
`tests/audit-page.test.tsx`

### Files modified (3)

`shared/src/index.ts` (export the schema) · `services/audit.service.ts` (two read methods on the
existing service — no second audit system) · `routes/v1/index.ts` (mount).

`ActivityLogModel`, `ActivityLogRepository` and the write path were not touched. `container.ts`
needed no change: `activityLogRepository`, `auditService` and `exportService` were already
registered.

### Endpoints (2)

`GET /audit` — `audit:read` · `POST /audit/bulk/export` — `audit:export`

Both permissions were previously dead: assigned to college_admin and read by no route. They are
real now. No new permission was added.

### Two infrastructure findings that changed the design

Both were discovered by a failing test and confirmed by probing the running request, not assumed.

**1. Dotted query keys cannot reach the repository.**
`express-mongo-sanitize({ replaceWith: '_' })` rewrites `.` in query keys, so `entity.type` arrives
as `entity_type` and matches no filterable field. The probe showed
`RAW-PROBE {"entity_id":"..."}`. This is a deliberate NoSQL-injection defence and was left alone —
but it means every dotted `filterableFields` entry in the codebase is unreachable over HTTP, not
just audit's.

**2. The repository's operator syntax is unreachable over HTTP.**
`buildFilterFromQuery` looks for a literal key like `createdAt[gte]`, but Express parses that into a
nested `{ createdAt: { gte } }` before any route sees it. So `field[op]` filtering has never worked
through the API.

The date range therefore uses `from`/`to` — already on `paginationQuerySchema`, already the
convention in `attendance.service`, and intact through both the sanitiser and the parser. The
controller maps them onto `createdAt`.

This retroactively confirms the session-25 decision to drop the interview date filter: it would
indeed have done nothing.

**Nothing is declared that would be silently dropped.** The schema carries only `userId`, `action`,
`category`, `severity`, `outcome`, the pagination keys and `from`/`to`. There is no entity filter in
the schema or the UI, and a test pins the sanitiser behaviour so the limitation stays visible.

### Two bugs found and fixed

- **A half-typed date crashed the page.** A `type="date"` input reports every keystroke, so
  `new Date('2026-01-0').toISOString()` threw a `RangeError`. The filter is now only sent once the
  value parses.
- **My own test expectations were wrong twice**, not the code: signing in writes a real `auth.login`
  audit row, so the "other college has no rows" and "exactly one auth row" assertions were both
  false premises. Corrected to assert absence of *our* rows and equality with the list count.

### Security

Redaction is enforced on write — `AuditService` replaces passwords, tokens and secrets with
`[redacted]` before storage — so the read path has nothing to leak. A server test writes a real
password change through the service and asserts the API response contains neither the old nor the
new value, and a client test asserts the dialog shows the marker.

Request metadata (IP, user agent, request id) is shown deliberately: it is the point of an audit
trail, and only a college administrator can reach the page.

### Tests added (46) — server 543 → 570, client 379 → 398

| Suite | Tests | Covers |
|---|---|---|
| `audit.test.ts` | 27 | RBAC across four roles, pagination, `maxLimit`, search by action and by email, five filters, date range in three forms, cross-tenant isolation on both list and export, filters not widening across tenants, export RBAC, export honouring filters, append-only at model and HTTP, redaction end to end, the sanitiser limitation |
| `audit-page.test.tsx` | 19 | Rows, list params, every filter reaching the query, date range as `from`/`to`, no entity filter, detail dialog, redaction shown, loading/empty/error, export gated on `audit:export`, no request without `audit:read`, nothing but `/audit` requested |

### Verification

```
build:shared            ✓
typecheck               ✓  shared + server + client
eslint (4 scopes)       ✓  0 errors each, run separately
jest                    ✓  570 tests, 19 suites, 579s — clean single run
vitest                  ✓  398 tests, 26 suites
build:client            ✓  51 static pages, 87 app routes
```

### Backend limitations recorded

| Limitation | Kind |
|---|---|
| Dotted filter keys unreachable (sanitiser) | Pre-existing infrastructure, affects every module |
| `field[op]` operator syntax unreachable (Express query parsing) | Pre-existing infrastructure, affects every module |
| Export capped at 100 rows | Deliberate — `maxLimit` on the repository |

Neither infrastructure limitation was worked around by weakening the sanitiser or rewriting
`BaseRepository`; both would ripple across every module and the first is a security control.

### Remaining dead routes (9)

`/college/support` · `/college/settings`, and seven student routes: `/student/courses`,
`/student/assignments`, `/student/exams`, `/student/attendance`, `/student/profile`,
`/student/support`, `/student/settings`.

### Recommended next session

`/college/support` or `/college/settings`. Both need the same inspection-first treatment: check
whether a ticket or settings HTTP layer exists before designing anything. Given four routes running
— three with no API and one needing its layer built — assume nothing.

---

## Session 31 — `/student/attendance`

The first student-portal route closed from the consolidated student audit, and the first route in
five sessions where the backend needed nothing at all. `GET /attendance/me`, `attendance:read_own`,
`ScopeGuard.requireOwnStudent()` and the `useOwnAttendance` hook were all already in place and
tested; only the page was missing.

**No server file was touched.**

### Files created (2)

`client/src/app/student/attendance/page.tsx` · `client/tests/student-attendance-page.test.tsx`

### Files modified (1)

`client/src/api/queries.ts` — one optional parameter added to `useOwnAttendance`:

```ts
export function useOwnAttendance(params: Record<string, unknown> = {}, enabled = true)
```

Backwards compatible, so the student dashboard's existing `useOwnAttendance()` call is unchanged.
It exists for the rule established by the session-26 P1 fixes: a caller without the permission must
never *issue* the request, not issue it and handle the 403. `RouteGuard` renders after the hook has
already run, so gating has to happen at the call site. Same shape as `useAuditLogs` and
`useJobPostings`.

### Faithfulness to the contract

Every figure on the page is a server value. The percentage, the threshold, `isBelowThreshold` and
`sessionsNeededForThreshold` are rendered as sent — none of that arithmetic is repeated on the
client, so the page cannot disagree with the record. The threshold in particular is read from
`CollegeModel.settings.attendanceThresholdPercent` via the response and is never assumed to be 75; a
test pins a college on 85.

**No subject-wise attendance.** The service queries `courseId: null`, so there is no per-course
figure to show and none is derived from the session list. The page says so in a footnote, and a test
asserts no subject or course breakdown appears.

The only two query parameters offered are `from` and `to`, because those are the only two the
endpoint accepts. No status, batch, course or student filter is rendered — a test pins that too.

### The date bug, avoided rather than re-fixed

Session 30's `RangeError` came from calling `toISOString()` on a half-typed date. Here nothing
reaches the query key until the value matches `^\d{4}-\d{2}-\d{2}$` *and* survives a round-trip
check that rejects an impossible date such as `2026-02-31`. A test walks the input through every
prefix of `2026-01-01` and asserts no request is made and the page stays alive.

`to` is pushed to the last moment of the chosen day, because the server compares with `$lte` and a
"to" of 15 March should include 15 March.

### Tests added (23) — client 398 → 421

| Suite | Tests | Covers |
|---|---|---|
| `student-attendance-page.test.tsx` | 23 | Summary and all five counts, threshold met and missed, non-default threshold, no false recovery promise when the shortfall is 0, session history, unknown status handled, valid date range sent, partial and impossible dates rejected, clear, loading without misleading zeros, empty sessions keeping the server summary, error state hiding the raw message, only `/attendance/me` requested, no `studentId`, no staff surface, no request without the permission, no fabricated subject data |

### Verification

```
vitest (new suite)      ✓  23 tests
vitest (full client)    ✓  421 tests, 27 files, 240s — clean single run
typecheck (client)      ✓
eslint (changed files)  ✓  0 errors
build:client            ✓  /student/attendance emitted static, 8.39 kB
```

### Limitations recorded (backend, not fixed here)

| Limitation | Kind |
|---|---|
| No per-course attendance for a student | Functional gap — `AttendanceSummaryModel` has `courseId` and an index for it, but `findForStudent` passes `courseId: null` |
| `sessions[]` carries `sessionId` but no course or faculty name | Functional gap — not populated, and `GET /attendance/sessions` is 403 for a student |
| `/attendance/me` is unpaginated | Deliberate — returns the full record set |

None was worked around by inventing client-side data.

### Remaining dead routes (8)

`/college/support` · `/college/settings` · `/student/courses` · `/student/assignments` ·
`/student/exams` · `/student/profile` · `/student/support` · `/student/settings`.

### Recommended next session

`/student/profile`. Full backend, `GET` + `PATCH /students/me` both token-derived and already
covered by three server tests, `useOwnStudentProfile` already written. The only missing piece is a
mutation hook for the PATCH. It is the last route on the list needing no backend work.

---

## Session 32 — `/student/profile`

The second full-backend student route, and the last one on the list needing no backend work.
`GET /students/me` and `PATCH /students/me` were both already complete, token-derived and covered by
server tests; the page, the mutation hook and an honest client type were what was missing.

**No server or shared file was touched.**

### Files created (3)

`client/src/app/student/profile/page.tsx` · `client/src/components/student/profile-form.tsx` ·
`client/tests/student-profile-page.test.tsx`

### Files modified (2)

`client/src/api/queries.ts` — added the `OwnStudentProfile` interface and an optional `enabled` on
`useOwnStudentProfile`. `client/src/api/student-mutations.ts` — added `useUpdateOwnStudentProfile`.

### The client type was narrower than the payload

`useOwnStudentProfile` was typed as `Student`, which declares neither `dateOfBirth`, `bloodGroup`,
`address`, `guardian`, `skills`, `portfolioLinks` nor the populated user's `phone`. The endpoint
serialises the whole student document and `include: 'userId,...'` populates the user without a
select, so all of it was already on the wire — only the declaration was short.

`OwnStudentProfile extends Student` rather than widening `Student`, so the college list and detail
pages keep their narrower view. Both existing callers — the student dashboard and the transcript
page — are untouched and still compile.

**This was a client typing gap, not a backend mismatch.** Nothing in the contract was insufficient.

### Only changed fields are sent

The page diffs the submitted values against the loaded profile and puts only what changed in the
body. That is not an optimisation. `StudentService.updateOwnProfile` rewrites every skill as
`verified: false, verifiedVia: null` whenever `skills` is present, so a student editing their blood
group would otherwise silently strip the institution's verification from their whole skill list.

When the student does edit their skills, the UI says plainly that verification will be cleared,
rather than letting it happen quietly.

### Validation

`useApiForm` with the shared `updateOwnStudentProfileSchema`, wrapped in a `z.preprocess` that does
only what a browser form requires: `''` becomes `null`, and an all-blank address or guardian
collapses to `null` instead of failing the required lines inside a group nobody filled in. No
validation rule is defined on the client, and the server validates independently regardless.

### Tests added (26) — client 421 → 447

| Suite | Tests | Covers |
|---|---|---|
| `student-profile-page.test.tsx` | 26 | Read view, loading, error without internal detail, editable fields populated, no input for any institutional field, edit hidden without `student:update_own`, PATCH to `/students/me`, only the changed field sent, no institutional field or id in the body, success toast, no request when nothing changed, cancel restoring saved values, save disabled while pending, server field error landing on its field, form-level error, verified skill shown but ungrantable, skills sent as name and level only, blank skill row dropped, only `/students/me` read, redirect and no request without `student:read_own`, an empty profile, a complete new address, a half-entered address refused client-side |

### Bugs found and fixed

- **Two form fields shared the accessible name "Mobile number"** — the student's own and the
  guardian's. A duplicate accessible name is an accessibility fault, not only an ambiguous test
  query. Renamed to `Parent name` / `Parent mobile` / `Parent email`, matching the convention the
  college student form already uses.
- **A `DefaultValues` cast did not compile** — the form's input values are the strings an `<input>`
  produces, while the schema's output type has already coerced `dateOfBirth` to a `Date`. Cast
  through `unknown`, as `student-form.tsx` already does for its schema.

### Verification

```
vitest (new suite)      ✓  26 tests
vitest (full client)    ✓  447 tests, 28 files — clean single run
typecheck (client)      ✓
eslint (5 changed files) ✓  0 errors
build:client            ✓  /student/profile emitted static, 12.2 kB
```

### Limitations recorded (backend, not changed)

| Limitation | Kind |
|---|---|
| Any `skills` update clears verification on every skill | Deliberate server rule — a student cannot self-verify. Worked around by sending `skills` only when changed, and saying so in the UI. |
| `address` and `guardian` are all-or-nothing | Schema design — inner fields are required, so a partial address is rejected. Surfaced as field errors rather than hidden. |
| `GET /students/me` populates the whole user document | The student's own data, so no cross-user exposure, but `preferences`, `extraPermissions` and `oauthProviders` ride along unused. |

### Remaining dead routes (7)

`/college/support` · `/college/settings` · `/student/courses` · `/student/exams` ·
`/student/assignments` · `/student/support` · `/student/settings`.

### Recommended next session

`/student/settings`. Password change and session management are already real and need no permission
work; only the preferences write is missing, and that is one small endpoint. It is the smallest
remaining piece of genuine product.

---

## Session 33 — `/student/settings`

The first partial-backend route built. Password and session management are genuinely backed and are
now live; preferences are not, and were left out rather than faked.

**No server or shared file was touched.**

### Files created (3)

`client/src/api/auth-queries.ts` · `client/src/app/student/settings/page.tsx` ·
`client/tests/student-settings-page.test.tsx`

### Files modified (1)

`PROJECT_PROGRESS.md`. No existing client file needed changing: there was no auth query layer at
all before this — `client/src/api/` had no hook touching `/auth`, since the provider owned login,
logout and session bootstrap directly.

### Endpoints used (4, all pre-existing)

`PATCH /auth/change-password` · `GET /auth/sessions` · `DELETE /auth/sessions/:id` ·
`POST /auth/logout-all`

All resolve the user from `requestContext.userId()`. No id is sent on any of them.

### Two behaviours that had to be read, not assumed

They differ, and the UI wording depends on which is which:

- **`changePassword`** passes `currentSessionId` to `revokeAllForUser`, so this browser **stays
  signed in** and every other device is signed out. The page says exactly that and refetches the
  session list afterwards.
- **`logoutAll`** calls `revokeAllForUser(userId, 'logout')` with **no exception**, and the
  controller clears the refresh cookie. This browser **is** signed out. The action is in its own
  danger-toned card, is confirmed through `ConfirmDialog`, says "including this one" in both the
  card and the dialog, and hands over to the provider's existing `logout()` for the redirect.

The current session is marked "This device" and deliberately has **no** per-row sign-out: revoking
it would leave the tab half-signed-in. Ending it is what the normal sign-out is for.

### Preferences: omitted, deliberately

`UserModel.preferences` (theme, locale, emailNotifications, pushNotifications) is real, populated,
returned by `GET /auth/session` and honoured by `notification.service.ts:105`.

**No endpoint writes it.** `updatePreferencesSchema` exists in `shared/src/schemas/auth.schema.ts`
and is referenced by **zero** server or client code — an orphaned contract, the same pattern as
`assignment.schema.ts` and `ticket.schema.ts`.

No preferences section is rendered at all. A switch that cannot persist is worse than an absent one.
Two tests pin this: no request may contain `preferences`, and no theme, locale or notification
control may exist. **A preferences endpoint remains a separate backend milestone.**

### Tests added (24) — client 447 → 471

| Suite | Tests | Covers |
|---|---|---|
| `student-settings-page.test.tsx` | 24 | Both sections render, the three schema fields, masking and per-field reveal, PATCH with the exact body, no password in any URL, submit disabled while saving, success toast and full form reset, sessions refetched after a change, wrong-password error on its own field, form-level error, mismatched confirmation refused client-side, session list with real metadata, current session marked and given no row action, DELETE by id plus refresh, empty state, loading state, error state without internal detail, confirmation required before signing out everywhere, cancel, logout-all ending the current session, no user id anywhere, only the four real endpoints touched, no preferences request, no falsely editable preference control |

### Bug found and fixed

**Password labels were unreachable by their visible text.** `Field` appends an asterisk and an
`sr-only` " (required)" to a required label, so the label's text content is
`Current password* (required)` and an exact-string `getByLabelText` misses it. Fixed in the tests
with anchored regex matchers. Worth remembering for any future form using `required` fields — the
profile page's fields are not required, which is why this had not surfaced before.

### Verification

```
vitest (new suite)      ✓  24 tests
vitest (full client)    ✓  471 tests, 29 files — clean single run
typecheck (client)      ✓
eslint (3 changed files) ✓  0 errors
build:client            ✓  /student/settings emitted static, 7.7 kB
```

### Limitations recorded (backend, not changed)

| Limitation | Kind |
|---|---|
| Preferences have no write API | Functional gap — schema exists, endpoint does not. Section omitted. |
| `GET /auth/sessions` returns no user agent | Deliberate — `deviceLabel` is the readable form; nothing else is available to display. |
| Revoking the current session is permitted by the API | Server allows it; the UI does not offer it, to avoid a half-signed-in tab. |

### Remaining dead routes (6)

`/college/support` · `/college/settings` · `/student/courses` · `/student/exams` ·
`/student/assignments` · `/student/support`.

### Recommended next session

A decision rather than a route. What remains splits cleanly: `/student/exams` is a small read-only
page over `GET /examinations` but needs the draft-visibility fix first; `/student/courses` needs
batch scoping and published-only filtering server-side; and assignments, support and preferences are
three separate backend milestones. The cheapest genuine win is the preferences endpoint — one route,
one service method, a schema that already exists — which would complete this page.

---

## Session 34 — Notifications HTTP layer

The second module where the backend existed and only the HTTP layer was missing — the same shape as
Audit in session 30. `NotificationModel`, `NotificationRepository` and `NotificationService` were
complete, registered in the container and already used by seven other services; nothing could reach
them over HTTP.

**No model, repository or service was modified.** `container.ts` needed no change.

### Files created (3)

`server/src/controllers/notification.controller.ts` · `server/src/routes/v1/notification.routes.ts` ·
`server/tests/integration/notification.test.ts`

### Files modified (1)

`server/src/routes/v1/index.ts` — import and mount.

### Endpoints (5)

`GET /notifications` · `GET /notifications/unread-count` · `PATCH /notifications/:id/read` ·
`PATCH /notifications/read-all` · `DELETE /notifications/:id`

All gated on `notification:read`, previously dead and now live. Dead permissions 66 → 65.

### Three decisions worth recording

**No send endpoint.** `NotificationService.notify` accepts an explicit recipient list and performs no
check that those users belong to the caller's college — and `NotificationRepository` is
`tenantScoped: false` by design, because a notification belongs to a person rather than a college.
Exposing `notify` would therefore be a cross-tenant write. Safe audience resolution is service work,
not an HTTP layer, so `notification:send`, `announcement:create` and `announcement:publish` stay
dead. A test asserts `POST /notifications` is 404.

**Ownership is by `userId`, from the token, on every route.** No id is accepted from the client
anywhere. A test proves one college's rows stay invisible to another even though the repository is
not tenant-scoped.

**No 404 for someone else's notification.** The repository's update filter carries the caller's
`userId`, so another user's row is never matched. Answering 404 versus 200 would confirm whether a
given id exists, so both cases return an unchanged unread count instead. Two tests pin it.

### Declared only what the repository applies

The route schema `.pick()`s `page`, `limit`, `category` and `unread` from the shared
`notificationListQuerySchema`. That schema also carries `priority`, plus `sort`, `search`, `fields`
and `include` from `paginationQuerySchema` — none of which `findForUser` reads. A test pins that
those have no effect, so nobody mistakes one for a working filter. Same discipline as session 30.

### Tests added (29) — server 570 → 599

| Suite | Tests | Covers |
|---|---|---|
| `notification.test.ts` | 29 | Auth on all five routes, RBAC via a custom role lacking the permission, listing, cross-user and cross-tenant isolation, sort, pagination, category and unread filters, archived exclusion, empty inbox, unread counting, mark-read with idempotency and other-user and nonexistent and malformed ids, mark-all-read with isolation, archive with list removal and soft-archive proof, invalid category, over-limit, ignored filters, and the absence of a send endpoint |

### Verification

```
typecheck (server)      ✓
jest                    ✓  599 tests, 20 suites, 629s — clean single run
typecheck (client)      ✓
eslint (client)         ✓  0 warnings, 0 errors
vitest (client)         ✓  471 tests, 29 files
build:client            ✓  54 static pages
```

A first server run hit the project's familiar contention: 542 passed, 0 failed, but three suites
died at import with a jest `readFileBuffer` error on the `exceljs` import, in 1133s against a
previous 579s. `auth.test.ts` was one and passed 17/17 isolated. The re-run above was clean at 629s.
Recorded here because the first run is not a result to hide.

### Environment finding — dependency manifests altered outside this work

`git status` shows `server/package.json`, `client/package.json` and `package-lock.json` modified by
something other than this session (timestamped 17:53), with 2010 lines changed in the lock file.
The signature is `npm audit fix --force`:

| Package | Was | Now |
|---|---|---|
| `exceljs` (server) | `^4.4.0` | `^3.4.0` — **major downgrade**, resolves to 3.4.0 |
| `nodemailer` (server) | `^6.9.16` | `^9.0.5` |
| `file-type` (server) | `^19.6.0` | `^22.0.1` — ESM-only, fails to resolve from CommonJS |
| `vitest` (client) | `^2.1.9` | `^4.1.10` |
| `next` (client) | `15.1.3` pinned | `^15.5.23` |

Packages also landed in the wrong workspaces: `next` and `vitest` as **production** dependencies of
the server, `nodemailer` and `file-type` as dependencies of the client.

Everything still passes on the installed tree, and `file-validator.ts` turned out **not** to import
`file-type` (it uses its own magic-byte checks), so that unresolvable package is declared-but-unused
rather than a runtime break. The `exceljs` downgrade and the misplaced entries are still wrong.

**No manifest was touched.** Restoring them means `git checkout` on three files plus `npm install`,
which rewrites `node_modules` — an owner decision, not one to make mid-task.

### Remaining dead routes (6, unchanged)

`/college/support` · `/college/settings` · `/student/courses` · `/student/exams` ·
`/student/assignments` · `/student/support`.

### Recommended next session

The notifications client layer: a bell in the app shell over `unread-count` and an inbox page. The
contract is real now, and `badgeKey: 'notifications'` already sits unused in the navigation config.

---

## Session 34a — Dependency manifests restored

Follow-up to the notification work, resolving the manifest changes recorded above. **No source file
was touched.**

### What was reverted

`git checkout -- package-lock.json server/package.json client/package.json`, then `npm install`.
The three manifests were backed up first, so the audit-fixed state is recoverable.

Both manifest diffs were confirmed to contain **only dependency lines** — no scripts, no config —
and `server/src/routes/v1/index.ts` was confirmed to contain only the notification import and mount.
The notification files are untracked and were never at risk from a targeted checkout.

### Why — the exceljs downgrade never worked

The decisive evidence was in `npm audit` against the modified tree:

```
uuid <11.1.1 (moderate)
  exceljs >=3.5.0
  Depends on vulnerable versions of uuid
```

`^3.4.0` resolves to **exceljs 3.10.0**, which is still `>=3.5.0`. The downgrade gave up a supported
major and kept the very advisory it was meant to fix. Together with `next` and `vitest` sitting in
the server's **production** dependencies, and `nodemailer` and `file-type` in the client's, reverting
to the committed state was the correct call.

### Restored versions

```
server exceljs 4.4.0 · nodemailer 6.10.1     client next 15.1.3 · vitest 2.1.9
next/vitest in server/package.json:          0
nodemailer/file-type in client/package.json: 0
```

### Verification after restore — all green

```
typecheck (server)  ✓        typecheck (client)  ✓
jest                ✓  599 tests, 20 suites, 678s — clean single run
eslint (client)     ✓  0 warnings, 0 errors
vitest (client)     ✓  471 tests, 29 files
build:client        ✓  54 static pages
```

### The correction worth recording

Calling the whole change corrupt was too broad. Against the restored baseline
(**12 vulnerabilities — 2 critical, 4 high, 6 moderate**) part of it was doing real work:

| Change | Verdict |
|---|---|
| `next` 15.1.3 → 15.5.23 | **Good** — clears 1 critical + 2 high (postcss, sharp); an in-range minor, and build + 471 tests were observed passing on it |
| `vitest` 2 → 4 | **Good** — clears a moderate (esbuild), dev-only; 471 tests observed passing on it |
| `nodemailer` 6 → 9 | **Probably good** — clears a high, but unproven at runtime; tests never open SMTP |
| `exceljs` 4.4.0 → `^3.4.0` | **Pointless** — same advisory, older major |
| Packages in the wrong workspace | **Wrong** — Next.js as a production dependency of an Express API |

### Recommended, awaiting approval — targeted, never `--force`

1. `client`: `next` → `^15.5.23` — clears the critical and two highs
2. `client` devDeps: `vitest` → `^4.1.10` — clears a moderate
3. `server`: **remove `file-type`** — `file-validator.ts` uses its own magic-byte checks and imports
   it nowhere, so an unused dependency is clearing a moderate for free
4. `server`: `nodemailer` → `^9.0.5` — clears a high; review `email.service.ts` first
5. `server`: **keep `exceljs` at `^4.4.0`** — the uuid advisory has no working fix; wait for upstream

Roughly 12 → 2, with workspace boundaries intact and no `next@16`.

**Not applied.** Items 1, 2 and 4 are version bumps that were asked to be planned deliberately.

---

## Session 35 — Notification client layer

The UI over the notification API built in session 34. Both portals, one shared inbox.

### Files created (6)

**Client (6)** — `api/notification-queries.ts` · `components/notifications/notification-bell.tsx` ·
`components/notifications/notification-inbox.tsx` · `app/college/notifications/page.tsx` ·
`app/student/notifications/page.tsx` · plus `tests/notification-bell.test.tsx` and
`tests/notification-inbox.test.tsx`

### Files modified (4)

`components/layout/app-shell.tsx` · `components/layout/topbar.tsx` ·
`components/layout/sidebar.tsx` · `config/navigation.ts`

**No backend file was touched.** No contract mismatch was found.

### Shape

Each portal route is a four-line page rendering the shared `NotificationInbox`, so the shell,
sidebar and guards all come from the portal layout the user is already inside. The bell lives in the
shared `Topbar` and takes its destination as a prop, so one component serves both portals without
knowing which it is in.

### `badgeKey` is real for the first time

`sidebar.tsx` now consumes `badgeKey`. Each key gets its own small component so the data hook is
called unconditionally inside it — a `switch` wrapped around a hook would break the rules of hooks.
`tickets` deliberately renders nothing: there is no ticket backend, so there is no count. The key
stays in the config for when that module lands.

### A correction to the handoff, worth recording

The brief said `badgeKey: 'notifications'` already existed in the navigation config and should be
reused. It did not. The union *type* permitted the value, but no nav item used it and `sidebar.tsx`
never read `badgeKey` at all — the only two uses were `badgeKey: 'tickets'` on the two Support
entries. That imprecision came from an earlier summary of mine. The badge mechanism had to be built,
not reused.

### Bug fixed — broken Profile link in both portals

`topbar.tsx` linked Profile to `` `${settingsHref}/profile` ``, producing
`/student/settings/profile` and `/college/settings/profile`. **Neither route exists**, so every user
clicking Profile in the user menu got a 404.

The student portal now points at the real `/student/profile`. The college portal has **no** profile
page, and inspection confirmed none exists — so rather than invent a route, `profileHref` is `null`
for college and the menu item is omitted. `AppShell` owns that mapping.

### Only the filters the API honours

Category and read-state, and nothing else. No priority, sort or search control appears anywhere, and
a test asserts none of those keys ever reach a request URL. The server pins the order to
newest-first and ignores the rest, so offering them would be a promise it does not keep.

### Tests added (33) — client 471 → 504

| Suite | Tests | Covers |
|---|---|---|
| `notification-bell.test.tsx` | 12 | Renders and reads the count, badge shown, no badge at zero, 99+ cap, links to the correct portal inbox for both portals, loading, count failure not breaking the shell, renders nothing without the permission, no request without the permission, no user id |
| `notification-inbox.test.tsx` | 21 | Listing, action link, unread marking, loading, empty, error without internal detail, mark one read, no mark-read on an already-read row, mark all read with its message, mark-all hidden at zero unread, archive, list refreshed after an action, failed action surfaced without breaking the list, category and unread filters, no unsupported filter offered or sent, pagination, single-page hiding, redirect without the permission, no request without it, only `/notifications*` touched, no send affordance |

### Verification

```
typecheck (client)  ✓  exit 0
eslint (client)     ✓  0 warnings, 0 errors
vitest (client)     ✓  504 tests, 31 files
build:client        ✓  56 static pages, both new routes emitted static
git diff --check    ✓  exit 0
```

`package-lock.json` shows as modified but `git diff --numstat` reports zero content changes — the
working copy differs only by LF/CRLF normalisation.

### Remaining dead routes (6, unchanged)

`/college/support` · `/college/settings` · `/student/courses` · `/student/exams` ·
`/student/assignments` · `/student/support`.

Note that `/college/settings` is now reachable from two places that 404 — the sidebar Settings item
and the topbar Settings link — which is the strongest argument yet for building it next.

---

## Session 38 — Product scope decided

No code changed. Security remains the blocker; rotation is still unconfirmed. Two decisions were
taken that materially reshape the remaining roadmap.

### Decision 1 — Hall tickets: student self-service

`GET /examinations/:id/hall-tickets` currently returns every registration for an exam and is gated
on `exam:read`, which students hold — so a student can enumerate classmates (exam finding #3).

**Agreed fix:** staff keep the full roster; a student receives **only their own** ticket, resolved
via `ScopeGuard.requireOwnStudent()`. This matches `/attendance/me` and `/students/me`, needs no new
permission, and lets the student portal offer a hall-ticket download.

### Decision 2 — Product scope: ERP + Placement only

**In scope:** college settings · student preferences · student exams · users CRUD · roles CRUD

**Out of scope:** tickets/support · assignments · course materials · live classes · online exams ·
question bank · certificates · announcements

This is the decision that has been distorting every completion figure. The permission catalogue and
four orphaned shared schemas describe a much larger product — a full LMS — than is actually wanted.

### What this changes

**32 of the 65 dead permissions belong to out-of-scope modules** and should be removed from the
catalogue rather than implemented: ticket (7), assignment (6), liveclass (5), question (4),
material (4), certificate (4), announcement (2).

**Four shared schema files become dead contracts** and should be deleted with them:
`assignment.schema.ts`, `ticket.schema.ts`, `exam.schema.ts` (the online-exam/proctoring contract),
and the announcement half of `notification.schema.ts`.

**Three navigation entries should be removed**, not built: `/college/support`, `/student/support`,
`/student/assignments`. Dead routes drop from 6 to 3 — `/college/settings`, `/student/exams`,
`/student/courses`.

**`/student/courses` is now a judgement call.** The Courses backend exists, but materials and live
classes are out of scope, so the page can only list courses with no content inside them. Worth
confirming whether it stays or is dropped too.

### Revised completion figures

The denominator shrank, so the percentages move. This is a scope change, not progress.

| Measurement | Before | Now | Why |
|---|---|---|---|
| Overall development completion | ~72% | **~85%** | ~6–8 sessions of real work remain, against ~35 already spent |
| Core implemented modules | ~98% | ~98% | Unchanged |
| Navigation / UI coverage | ~85% | ~92% | 3 dead routes remain of ~37, once the out-of-scope entries are removed |
| Permission catalogue coverage | ~60% | ~75% | 96 enforced of ~129 in-scope, once 32 are pruned |
| Production readiness | BLOCKED | **BLOCKED** | Unchanged — credential rotation still outstanding |

**These figures are provisional until the out-of-scope permissions, schemas and nav entries are
actually removed.** Nothing has been deleted yet; that work is blocked with everything else.

### Remaining in-scope work

| # | Task | Sessions |
|---|---|---|
| 0 | **Credential rotation + Atlas review + repo strategy** | user action |
| 1 | Dependency security (Next 15.5.23, Vitest 4, drop `file-type`, keep ExcelJS 4.4.0) | ~½ |
| 2 | Exam security fixes — draft visibility, unreleased papers, hall tickets | ~1 |
| 3 | Student preferences | ~½ |
| 4 | College settings (backend + UI) | ~1–2 |
| 5 | Student exams UI | ~1 |
| 6 | Users CRUD + Roles CRUD | ~2 |
| 7 | Scope cleanup — remove out-of-scope permissions, schemas, nav | ~½ |

Roughly **6–8 sessions** to a coherent, in-scope, production-ready product.

### Priority 3 pre-design — student preferences (read-only inspection)

Everything needed already exists; only the write path is missing.

- `updatePreferencesSchema` is defined in `shared/src/schemas/auth.schema.ts`, exported from the
  shared index, and referenced by **zero** code — theme (`light|dark|system`), locale,
  `emailNotifications`, `pushNotifications`, all optional.
- `AuthenticatedUser` in `shared/src/types/api.ts:92` **already carries `preferences`**, and
  `getSession` returns them — so the client has the current values in `useAuth().user.preferences`
  with no extra request.
- `notification.service.ts:105` already honours `emailNotifications`, so the setting is live the
  moment it becomes writable.
- The auth provider already exposes `updateUser()` to sync local state after a save.

Implementation shape, following the existing self-service pattern (`change-password`, `sessions`):
`PATCH /auth/preferences`, authenticated, **no permission** — consistent with the other
`/auth` self-service routes; `AuthService.updatePreferences(userId, input)` writing via
`userRepository.updateById` with dot-notation for the nested partial; a controller method resolving
the user from `requestContext.userId()`; a client mutation hook; and a Preferences card added to the
existing `/student/settings` page.

**Related gap noticed:** `updateProfileSchema` (firstName, lastName, phone, avatarUrl) is also
defined, exported and referenced by nothing — users cannot edit their own name or avatar. Small, and
a natural companion to preferences.

---

## Session 39 — Examination security fixes, fully verified

Three audited defects fixed, plus a fourth found during testing. **No new permission was
introduced** and no unrelated code was touched.

### Files modified (2)

`server/src/services/examination.service.ts` (+87 lines, 1 deletion) ·
`server/tests/integration/examination.test.ts` (+347 lines, 14 tests)

### The staff/student discriminator

Staff hold `exam:update`; a student holds `exam:read` alone. That existing distinction is the whole
mechanism — `isExamStaff()` checks it, following the idiom already used by
`attendance.service.canOverrideLock`. Every security change is guarded by `!this.isExamStaff()`, so
staff paths are provably unchanged, which the staff-side tests confirm independently.

### Defect 1 — draft exams visible to students

`STUDENT_VISIBLE_LIFECYCLE` is `published`, `completed`, `marks_entered`, `results_published` —
taken from the service's own transition table, which documents `scheduled → published` as the point
where "students can see it and hall tickets are valid".

In `listExams` the status filter is assigned **after** the caller's filter is spread, so
`?status=draft` narrows within the allow-list rather than escaping it. `assertExamVisible` applies
the same list, with the same 404 the department check uses.

### Defect 2 — unreleased question papers exposed (highest severity)

`listPapers` returned every revision regardless of `isReleased`. An unreleased paper carries the
question `sections` and an `attachment.url` pointing at the actual paper file, so a student holding
`exam:read` could fetch the exam before it was sat.

`ExamPaperRepository.findReleased()` already existed and was already used by `getExamProfile` —
`listPapers` simply never called it. Students now receive the released paper only; staff keep the
full revision history, which is what the versioning is for.

### Defect 3 — hall-ticket enumeration

Students receive their own ticket via `ScopeGuard.requireOwnStudent()`, mirroring `/attendance/me`
and `/students/me`. Staff keep the roster. Only the staff path writes the audit entry: issuing a
roster is an administrative act, a student viewing their own ticket is an ordinary read.

### Defect 4 — found while testing, not by the audit

`assertExamVisible` compared `String(exam.departmentId)` against the allowed set, but `getExam`
**populates** `departmentId` — so that stringified the Mongoose document, never the id.

**Fail-closed, so not a security hole** — but it meant no department-scoped caller could open any
exam by id at all. It stayed invisible because college admins are college-wide and take the early
return, and no existing test had a student fetch an exam by id. It would have blocked the entire
`/student/exams` feature. Fixed by unwrapping `_id` before comparison, so populated and raw paths
both work.

### Tests added (14) — examination 64 → 78, server 599 → 613

Published visible · draft hidden · scheduled hidden · `?status=draft` cannot bypass · unpublished
404 by id · **staff still see drafts** · released paper only · unreleased paper, sections and
attachment URL never leaked · **staff keep full revision history** · student gets own ticket only ·
**staff keep whole roster** · unregistered student gets nothing · tenant scoping · placement officer
still 403.

No existing test was removed, skipped or weakened.

### Verification — all executed this session

```
jest (full server)      PASS  613/613 tests, 20/20 suites, 1068.8s, exit 0
  examination.test.ts   PASS  78/78   (isolated 112.7s, and in-run 180.0s)
  notification.test.ts  PASS  29/29   (isolated 114.1s, and in-run 71.9s)
typecheck (server)      PASS  exit 0
vitest (client)         PASS  504/504 tests, 31 files, exit 0
typecheck (client)      PASS  exit 0
eslint (client)         PASS  0 warnings, 0 errors
build:client            PASS  compiled, 56 static pages
git diff --check        PASS  exit 0
```

### An earlier full run was not clean — recorded rather than hidden

A prior attempt returned 611/613 with `notification.test.ts` failing on
`MongoNetworkTimeoutError → PoolClearedOnNetworkError`, cascading into
`E11000 duplicate key: colleges.code "PIT"` because `beforeEach` cleanup never completed. That suite
took **1350.4s** in the failed run against **71.9s** in the clean one — an ~19× difference on
identical code. Environmental contention, not a regression; my changes touch only examination files.

### Percentages — deliberately unchanged

```
Overall ~85% · Backend ~88% · Frontend ~84%
Core ~98% · Navigation ~92% · Permissions ~75%
Production readiness: BLOCKED
```

**Backend stays at ~88%.** This session hardened a module that was already built and added
regression coverage; it did not ship any of the five remaining backend modules (college settings,
preferences, profile, users CRUD, roles CRUD). Test and security *quality* improved; implementation
*coverage* did not. Those are different axes and are not merged here.

```
Credential exposure:   CONFIRMED
Credential compromise: ASSUMED
Unauthorized access:   NOT CONFIRMED — requires Atlas evidence
```

---

## Session 40 — Registration page (fixing the /register 404)

### Root cause

`client/src/app/(auth)/login/page.tsx:139` links to `/register`, but `client/src/app/(auth)/`
contained only `login/`. **The page was never built.** Not a routing bug, not a broken link, not a
guard — a missing file. The backend API had existed all along.

### Backend: reused, not rebuilt

`POST /auth/register/college` already exists, validated by `registerCollegeSchema`, rate-limited by
`registerRateLimit`, and covered by 10 assertions in `auth.test.ts`. **No server file was touched
and no new API, permission or schema was added.**

The endpoint answers `201 { email, message }` and deliberately creates **no session** — the address
is verified by email, then a reviewer approves the institution. The page mirrors that: success shows
what happens next instead of redirecting into a portal the account cannot yet reach.

`registerStudentSchema` exists but has **no route**, so `/register` is institution-only. That is
consistent with `allowStudentSelfRegistration` being an unreachable college setting.

### Files created (2)

`client/src/app/(auth)/register/page.tsx` · `client/tests/register-page.test.tsx`

### Files modified (2)

`client/src/app/(auth)/layout.tsx` — the container was `max-w-sm`, which a 22-field form cannot
use. Width now belongs to each page. `client/src/app/(auth)/login/page.tsx` — one class added so
sign-in keeps exactly the column it had.

### Form

Every field comes from `registerCollegeSchema`; none was invented. Institution (name, code, type,
year, affiliation, website, email, phone), address, and administrator (name, email, phone,
designation, password, confirm) plus the terms checkbox — grouped into three sections.

`zodResolver(registerCollegeSchema)` is the same schema the server validates against, so the rules
cannot drift. Server `details[].field` paths map onto nested inputs, so a duplicate code lands on
the code field rather than in a banner. `establishedYear` converts empty to `undefined` so the
schema reports a required field rather than a type error on `NaN`.

### Tests added (16) — client 504 → 520

Renders · three sections · empty submission blocked · invalid email · password mismatch · terms
required · posts to `/auth/register/college` · nested college/admin shape with `acceptTerms: true` ·
success shows next steps and does **not** sign in · submit disabled while pending · **no double
submit** · duplicate code on its own field · server error as a banner · unexpected failure not
leaking the transport error · link back to sign in · nothing requested on load.

### Verification

```
vitest (register)     PASS  16/16
vitest (full client)  PASS  520/520, 32 files
typecheck (client)    PASS  exit 0
eslint (client)       PASS  0 warnings, 0 errors
build:client          PASS  57 static pages — /register emitted at 6.12 kB
git diff --check      PASS  exit 0
jest (server)         PASS  613/613, 20/20 suites — unchanged, verified earlier this session
```

Static pages 56 → 57. The new route in the build output is the evidence the 404 is gone.

### Percentages

Unchanged. This restored an intended route rather than adding scope.

```
Overall ~85% · Backend ~88% · Frontend ~84%
Core ~98% · Navigation ~92% · Permissions ~75%
Production readiness: BLOCKED
```

---

## Session 41 — Password reset flow (fixing the /forgot-password 404)

Same class of gap as `/register`: `login/page.tsx:125` links to `/forgot-password`, and no page
existed. **The backend was already complete.** No server file was touched.

### The backend flow, read rather than assumed

`resetPasswordSchema` requires **both** a `token` and an `otp`, which turned out to matter. The
reset is deliberately two-factor:

`AuthService.forgotPassword` returns silently for an unknown address (no enumeration), signs a
password-reset JWT carrying a `jti` which is stored on the user so the link is single-use, emails a
six-digit OTP, **and** emails a link to `${config.clientUrl}/reset-password?token=…`.

`AuthService.resetPassword` verifies the token, checks the `jti` still matches, verifies the OTP
separately with attempt counting, refuses reuse of a previous password, then in one transaction
consumes the OTP, sets the password, clears the token id and **revokes every session** — because a
reset is usually a response to compromise.

The `/reset-password` route name is dictated by that `resetUrl`, not chosen here.

### Files created (3)

`client/src/app/(auth)/forgot-password/page.tsx` ·
`client/src/app/(auth)/reset-password/page.tsx` ·
`client/tests/password-reset-pages.test.tsx`

### Files modified

**None.** The `(auth)` layout already carried per-page widths after session 40.

### Security decisions

The success panel repeats the server's own wording — "If an account exists for…" — rather than
softening it into a confirmation that the address was found. A test asserts the rendered page never
says *found*, *no account*, or *does not exist*.

The token goes from the query string into a registered hidden field and straight into the request
body. It is never rendered, stored or logged; a test asserts the token string appears nowhere in
the document. A link arriving with no token is refused up front rather than failing on submit.

Rate limiting (`forgotPasswordRateLimit`) is untouched; its 429 surfaces as a banner.

### Tests added (19) — client 520 → 539

**Forgot password (10):** renders · email required · invalid email rejected client-side · posts to
`/auth/forgot-password` with the exact body · submit disabled while sending · confirms **without
revealing account existence** · rate limit surfaced · unexpected failure not leaking the transport
error · link back to sign in.

**Reset password (9):** renders with a token · refuses a link with no token · **never displays the
token** · sends token + code + passwords exactly · mismatch rejected client-side · weak password
rejected by the shared rules · invalid code lands on the code field · expired/reused link explained
· success states that every device was signed out · submit disabled while resetting.

### Verification

```
vitest (new suite)    PASS  19/19
vitest (full client)  PASS  539/539, 33 files
typecheck (client)    PASS  exit 0
eslint (client)       PASS  0 warnings, 0 errors
build:client          PASS  59 static pages
git diff --check      PASS  exit 0
jest (server)         NOT RUN — no server file changed; last verified 613/613, 20/20
```

All four auth routes now emit:

```
○ /forgot-password   3.70 kB
○ /login             5.04 kB
○ /register          6.12 kB
○ /reset-password    4.25 kB
```

Static pages 57 → 59.

### Percentages — unchanged

Two intended routes were restored; no scope was added.

```
Overall ~85% · Backend ~88% · Frontend ~84%
Core ~98% · Navigation ~92% · Permissions ~75%
Production readiness: BLOCKED
```

---

## Session 42 — /change-password, shared branding, and the safe dependency subset

### The authentication route set is now complete

`/change-password` was the last gap, and the worst of the three. `route-guard.tsx:36` redirects
anyone with `mustChangePassword` there and lets only that path through — so with no page, an invited
user landed on a 404 with **no way forward at all**. A lockout, not a cosmetic 404.

```
/login · /register · /forgot-password · /reset-password · /change-password
```

**Backend: existing, unchanged.** `PATCH /auth/change-password` already existed with
`changePasswordSchema`, and `UserRepository.setPassword` already sets `mustChangePassword: false`.

**The detail that mattered:** the server clears the flag, but the client still holds the session it
bootstrapped with. Without `refreshUser()` before navigating, `RouteGuard` reads stale state and
bounces the user straight back — a loop. The page refreshes first, then redirects via
`homeRouteFor`. Tests assert the refresh happens and that no redirect ever targets
`/change-password`.

The page sits **outside** the `(auth)` group on purpose: that group is wrapped in `GuestGuard`,
which ejects a signed-in user, and this page requires one. `RouteGuard` with no permissions gives it
"signed in, nothing more". It also offers "Sign out instead" — the only exit for someone who cannot
complete it.

### Branding consolidated into one component

`client/src/components/layout/brand-logo.tsx` — a single `<BrandLogo>` with `size`,
`showWordmark` (for the collapsed rail) and `tone` (inverse for the dark panel). The mark and
wordmark had been written out separately in `sidebar.tsx` and `(auth)/layout.tsx`, which is how two
versions of a logo drift apart; both now render this component, as does the change-password page.
Auth pages get it once from the layout rather than each carrying their own.

**No logo artwork was supplied.** The brief said an image was attached; none arrived, and the
repository has no `client/public` directory and no image asset of any kind. The component therefore
renders the `GraduationCap` mark the product already used, with an explicit documented swap point —
replacing it is a change to one `<Mark>` function plus dropping the file in `client/public/images/`.
No placeholder artwork was invented.

### Dependencies — the safe subset only

```
next       15.1.3 → 15.5.23   applied
file-type  removed            zero references across all source, tests and configs
exceljs    4.4.0              unchanged
vitest     2.1.9              MIGRATION BLOCKED — not attempted
npm audit  12 (6 mod, 4 high, 2 critical) → 11 (5 mod, 5 high, 1 critical)
```

**Why Vitest 4 remains blocked.** It ships Vite 7 with Rolldown, which replaced esbuild with oxc.
`@vitejs/plugin-react` still emits `esbuild` options, so the JSX transform is silently discarded and
every `.tsx` suite fails to parse with `RolldownError: Unexpected JSX expression`. Upgrading the
plugin to 5.2.0 (peer range covers Vite 4–8) did **not** help. Going further means guessing at
Rolldown/oxc config APIs. This needs its own scoped migration task; the repository is left entirely
on the working configuration, not half-migrated.

Remaining advisories and why they stand: `nodemailer` (high) is outside the approved plan;
`postcss` and `sharp` (high) live inside Next's own tree and need Next 16, which is not approved;
`uuid` (moderate) comes via exceljs and has no fix that is not a major downgrade; `esbuild`
(moderate) is dev-only and tied to the blocked Vitest upgrade.

### Tests added (18) — client 539 → 557

Renders and explains why · brand shown · three schema fields · empty submission blocked · weak
password rejected by the shared rules · mismatch rejected · new-password-equals-current rejected ·
exact endpoint and body · **session refreshed so `mustChangePassword` clears** · redirect to the
role's portal · **never redirects back to change-password** · submit disabled while pending · wrong
current password on its own field · reuse rejection as a banner · unexpected failure not leaking the
transport error · all fields masked · **no password value ever rendered as page text** · sign-out
escape hatch.

### A flakiness fix, not a weakening

Five register tests began timing out at 5s — a different set each run, timeouts rather than
assertion failures. The cause was my own helper typing 16 fields character-by-character. Fixed with
`userEvent.setup({ delay: null })`; every assertion is unchanged.

### Verification — all executed

```
vitest (change-password)  PASS  18/18
vitest (register)         PASS  16/16
vitest (full client)      PASS  557/557, 34 files
typecheck (client)        PASS  exit 0
typecheck (server)        PASS  exit 0
eslint (client)           PASS  0 warnings, 0 errors
build:client              PASS  60 static pages, compiled in 117s
jest (server)             PASS  613/613, 20/20 suites, 1158.3s, exit 0
git diff --check          PASS  exit 0
```

All five auth routes emit:

```
○ /change-password  7.58 kB   ○ /forgot-password  3.70 kB   ○ /login  5.04 kB
○ /register         6.12 kB   ○ /reset-password   4.25 kB
```

### Percentages — unchanged

A lockout was fixed, branding was consolidated, and two dependencies moved. No in-scope module
shipped.

```
Overall ~85% · Backend ~88% · Frontend ~84%
Core ~98% · Navigation ~92% · Permissions ~75%
Production readiness: BLOCKED
```
