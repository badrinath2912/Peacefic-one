# College Portal

Depends on: `02-design-system.md`, `03-data-model.md`, `04-auth-rbac.md`,
`05-api-conventions.md`.

Route group `client/src/app/(college)/`. All routes below are prefixed `/college`.
All endpoints are prefixed `/api/v1`.

Every module section states: screens, the components used, the endpoints, and the
business rules that are not obvious from the data model. Rules are the part that
matters — the screens follow from them.

---

## 1. Navigation

```
Overview      Dashboard
People        Students · Faculty · Departments · Batches
Academics     Courses · Attendance · Assignments · Exams · Results · Certificates
Placement     Companies · Job Postings · Applications · Interviews · Placements · Reports
Operations    Training Requests · Announcements · Support Tickets
Insights      Analytics · Reports · Audit Logs
Admin         Users & Roles · Settings
```

Defined as data in `constants/navigation.ts` and filtered by permission at render.
An item with no permitted children is hidden entirely, not shown disabled — a nav full
of dead entries is worse than a shorter nav.

---

## 2. Dashboard — `/college`

**Purpose:** answer "is anything wrong today?" in one screen.

### Layout

1. **Stat tiles** (row of 4): Total Students · Total Faculty · Placement Rate ·
   Average Attendance. Each with a delta against the previous period.
2. **Attention panel** — the most important element. Pending items requiring action:
   training requests awaiting approval, unmarked attendance sessions from yesterday,
   ungraded submissions past due, open urgent tickets, students below the attendance
   threshold. Each row links directly to the action. Empty state: "Nothing needs your
   attention."
3. **Charts** (2×2): Placement trend by month (line) · Attendance by department
   (horizontal bar, sorted) · Student distribution by department (stacked bar, *not* a
   pie) · Applications funnel (horizontal bar).
4. **Upcoming** — next 7 days: drives, live classes, exam windows.
5. **Recent activity** — last 10 audit entries, `Timeline` component.

### Endpoints

```
GET /dashboard/college/stats          tiles + deltas
GET /dashboard/college/attention      pending-action items
GET /dashboard/college/charts         ?range=30d
GET /dashboard/college/upcoming       ?days=7
GET /dashboard/college/activity       ?limit=10
```

### Rules

- Every figure is computed from live data. The stat tiles read `colleges.stats` and
  `attendancesummaries` (both maintained transactionally, `03-data-model.md` §3.1, §5.3)
  rather than counting collections per request.
- Dashboard responses are cached in Redis for 60 seconds per college. A dashboard is
  re-fetched constantly and its numbers do not need to be sub-minute fresh; the
  attention panel is excluded from caching because it drives action.
- Scoped by role: an HOD's dashboard covers their department only, with the same layout.
  Same components, filtered data — no separate HOD dashboard exists.

---

## 3. Student Management — `/college/students`

### Screens

| Route | Screen |
| --- | --- |
| `/college/students` | List: `DataTable`, filters, bulk actions |
| `/college/students/new` | Create form |
| `/college/students/import` | CSV/XLSX import wizard |
| `/college/students/:id` | Detail with tabs |
| `/college/students/:id/edit` | Edit form |

**List columns:** avatar + name, roll number, department, batch, semester, CGPA,
attendance %, placement status, account status, actions.
**Filters:** department, batch, semester, status, CGPA range, attendance range,
placement status, backlogs, gender, admission year.
**Bulk actions:** assign to batch, update status, send announcement, export, soft delete.

**Detail tabs:** Profile · Academics (semester GPAs, results, backlogs) · Attendance
(summary + heatmap calendar) · Courses (enrolments and progress) · Assignments ·
Exams · Placement (applications, interviews, offers) · Certificates · Activity.

### Import wizard

Four steps, and the dry run is the point of the design:

1. Download template (`GET /students/bulk/template`) — headers, an example row, and an
   enum reference sheet.
2. Upload; parsed client-side for immediate shape feedback.
3. **Dry run** (`POST /students/bulk/import?dryRun=true`) — server validates every row
   and returns a per-row report: valid, warnings, errors, and duplicate detection
   against existing roll numbers. The UI shows this as a table with inline errors and
   lets the user download an annotated error file.
4. Confirm — real import runs, over 500 rows as a background job with socket progress.

Nothing is written until step 4. An import that half-succeeds and leaves the admin
guessing which rows landed is the failure mode this design exists to prevent.

### Endpoints

```
GET    /students                       list, paginated/filtered/sorted
POST   /students                       create (user + student, transactional)
GET    /students/:id                   detail
PATCH  /students/:id                   update
DELETE /students/:id                   soft delete
POST   /students/bulk                  bulk create
PATCH  /students/bulk                  bulk update
DELETE /students/bulk                  bulk soft delete
GET    /students/bulk/template         template download
POST   /students/bulk/import           import (dryRun query param)
POST   /students/export                async export job
POST   /students/:id/resend-invite
POST   /students/:id/reset-password    admin-triggered, forces change on next login
PATCH  /students/:id/status
GET    /students/:id/academics
GET    /students/:id/attendance        ?from=&to=
GET    /students/:id/placement
GET    /students/:id/timeline
```

### Rules

- Creating a student creates the `users` and `students` documents and increments
  `colleges.stats` and `batches.stats` in **one transaction** (`03-data-model.md` §9).
  A student who exists in one collection but not the other is an inconsistency that is
  painful to detect later.
- Roll number is unique per college among live records (partial index). Reuse after
  soft delete is permitted, because institutions do reissue numbers.
- Batch capacity is enforced on assignment; exceeding it requires `batch:update` plus an
  explicit override confirmation, and writes a `warning`-severity audit entry.
- Deleting a student is always soft. Hard deletion happens only through the data
  retention job.
- Changing a student's batch recalculates their attendance summaries and re-evaluates
  placement eligibility.
- Scope: `college_admin` sees all; `hod` sees their department; `faculty` sees students
  in `assignedBatchIds`; `placement_officer` has read access to all.

---

## 4. Faculty Management — `/college/faculty`

Structurally parallel to Students, so the same components are reused with different
columns and forms.

**List columns:** name, employee ID, department, designation, type (faculty/trainer),
experience, assigned batches, status.
**Detail tabs:** Profile · Qualifications · Assigned Batches · Courses · Attendance
Marked (a compliance view: sessions assigned vs marked) · Activity.

```
GET    /faculty · POST /faculty · GET/PATCH/DELETE /faculty/:id
POST   /faculty/bulk/import
PATCH  /faculty/:id/batches            assign/unassign batches
PATCH  /faculty/:id/status
GET    /faculty/:id/workload           batches, courses, hours
GET    /faculty/:id/attendance-compliance
```

### Rules

- Trainers are `faculty` documents with `type: 'trainer'` (`03-data-model.md` §3.5), not
  a separate collection.
- Removing a faculty member from a batch that has unmarked past sessions warns and
  requires reassignment — otherwise those sessions become nobody's responsibility.
- Setting `status: 'resigned'` revokes all their sessions and removes batch assignments,
  but retains every historical record they created.

---

## 5. Department Management — `/college/departments`

Simpler CRUD. List shows name, code, HOD, counts of students/faculty/batches, status.
Detail shows the department's batches, faculty, and a small analytics panel
(attendance, placement rate, average CGPA versus the college average).

```
GET/POST /departments · GET/PATCH/DELETE /departments/:id
PATCH  /departments/:id/hod
GET    /departments/:id/analytics
```

### Rules

- A department with live students or batches cannot be deleted; the error names the
  blocking counts rather than saying "cannot delete".
- Assigning an HOD grants the `hod` role scoped to that department, and unassigning
  revokes it. The role change is a `critical` audit event.

---

## 6. Batch Management — `/college/batches`

List: name, code, department, admission→graduation years, current semester, advisor,
student count/capacity, status.
Detail tabs: Students · Courses · Attendance · Timetable · Analytics.

```
GET/POST /batches · GET/PATCH/DELETE /batches/:id
GET    /batches/:id/students
POST   /batches/:id/students           add students (bulk)
DELETE /batches/:id/students           remove students (bulk)
PATCH  /batches/:id/advisor
POST   /batches/:id/promote            advance semester
GET    /batches/:id/analytics
```

### Rules

- `POST /batches/:id/promote` increments `currentSemester` for the batch and every
  student in it, transactionally. At the final semester it sets the batch to `completed`
  and students to `graduated`. This is irreversible through the UI and requires typed
  confirmation.
- An annual cron proposes promotions based on `colleges.academicYearStartMonth` but
  **never executes them** — it creates an attention-panel item. Automatic promotion of
  student records without a human decision is not acceptable.

---

## 7. Attendance — `/college/attendance`

### Screens

| Route | Screen |
| --- | --- |
| `/college/attendance` | Today's sessions: marked, pending, cancelled |
| `/college/attendance/mark/:sessionId` | Marking sheet |
| `/college/attendance/sessions` | All sessions, filterable |
| `/college/attendance/reports` | Reports and defaulters |
| `/college/attendance/students/:id` | Per-student detail with calendar heatmap |

**Marking sheet:** roster with large Present/Absent/Late/Excused/On-Duty controls,
"mark all present" then adjust (the common case — most students are present), a running
count, remarks per student, and keyboard shortcuts (P/A/L/E, arrow keys) because
faculty mark this daily and mouse-only marking is slow.

**Reports:** batch-wise summary, defaulters below threshold, subject-wise breakdown,
monthly trend, and an attendance calendar heatmap using the sequential blue ramp
(`02-design-system.md` §8.3).

### Endpoints

```
GET  /attendance/sessions                    ?date=&batchId=&status=
POST /attendance/sessions                    create session
GET  /attendance/sessions/:id
POST /attendance/sessions/:id/mark           mark all students in one call
PATCH /attendance/sessions/:id/records/:rid  correct one record
POST /attendance/sessions/:id/lock
POST /attendance/sessions/:id/unlock         requires attendance:override_lock
GET  /attendance/students/:studentId         ?from=&to=&courseId=
GET  /attendance/reports/batch/:batchId
GET  /attendance/reports/defaulters          ?threshold=&batchId=
GET  /attendance/summary                     ?batchId=&period=
POST /attendance/export
POST /attendance/import                      biometric/device import  [REVISIT]
```

### Rules

- Marking is **one request for the whole session**, not one per student. A 60-student
  roster must not be 60 mutations.
- Sessions auto-lock 48 hours after their date (configurable). After lock, edits need
  `attendance:override_lock`, must supply a reason, and append to `modifiedHistory`.
- Every marking recalculates the affected `attendancesummaries` and emits
  `attendance:updated` over Socket.IO to the batch room and each student's room.
- Crossing below `colleges.settings.attendanceThresholdPercent` triggers a notification
  to the student, their advisor, and (if configured) their guardian.
- Attendance cannot be marked for a future date, or for a cancelled session.
- Marking permission is scoped: faculty may only mark batches in `assignedBatchIds`
  (`04-auth-rbac.md` §5).

---

## 8. Training Requests — `/college/training-requests`

List with status, priority, type, participants, dates, and approval state.
Detail is a **timeline** of the request's lifecycle plus the approval action panel.

```
GET/POST /training-requests · GET/PATCH /training-requests/:id
POST /training-requests/:id/submit
POST /training-requests/:id/approve       { comments }
POST /training-requests/:id/reject        { reason }   — reason required
POST /training-requests/:id/request-info  { questions }
POST /training-requests/:id/assign        { trainerIds, scheduledStart, scheduledEnd }
POST /training-requests/:id/complete      { actualParticipants, report, feedbackScore }
POST /training-requests/:id/cancel        { reason }
GET  /training-requests/:id/timeline
```

### Rules

- State machine, enforced in the service; illegal transitions return 409
  `INVALID_STATE_TRANSITION`:

```
draft → submitted → under_review → approved → scheduled → in_progress → completed
                          ↓            ↓
                      rejected    more_info_required → under_review
    any non-terminal → cancelled
```

- Rejection requires a reason. An unexplained rejection generates a support ticket
  every time.
- Approval notifies the requester by email and in-app, and creates an attention item
  for trainer assignment.
- `requestNumber` is generated as `TR-{YY}{MM}-{sequence}` per college.

---

## 9. Placement (College side)

### 9.1 Companies — `/college/companies`

Read/link against the global company master (`03-data-model.md` §6.1); a college may
request a new company, which a platform admin verifies. Detail shows hiring history with
this college: drives, offers, average package, conversion rate.

```
GET  /companies                    ?visibleTo=college
POST /companies                    create (pending verification)
GET/PATCH /companies/:id
GET  /companies/:id/history        this college's history with the company
POST /companies/:id/blacklist      { reason }
```

### 9.2 Job Postings — `/college/jobs`

Create/edit is a **multi-step form**: Basics → Compensation → Eligibility → Selection
Rounds → Review. The eligibility step shows a **live count of matching students** as
criteria change — the single most useful affordance on the screen, because officers
routinely set criteria that match nobody.

```
GET/POST /jobs · GET/PATCH/DELETE /jobs/:id
POST /jobs/:id/publish
POST /jobs/:id/close
POST /jobs/:id/eligible-count       live preview during editing
GET  /jobs/:id/eligible-students
GET  /jobs/:id/applications
POST /jobs/:id/notify-eligible
GET  /jobs/:id/funnel               applied → shortlisted → interviewed → selected
```

### 9.3 Applications — `/college/applications`

Table with bulk shortlist/reject, filters by job, status, round, department, CGPA.
A **kanban view by selection round** is offered alongside the table, because moving
candidates through rounds is inherently a pipeline task.

```
GET  /applications                  ?jobId=&status=&round=
GET  /applications/:id
POST /applications/:id/shortlist
POST /applications/:id/reject       { reason }
POST /applications/:id/advance      { roundOrder, score, feedback }
POST /applications/bulk/shortlist
POST /applications/bulk/reject
POST /applications/export
```

### 9.4 Interviews — `/college/interviews`

Calendar and list views. Scheduling supports bulk (slot generation across a panel) and
detects clashes with the student's other interviews and exams.

```
GET/POST /interviews · GET/PATCH /interviews/:id
POST /interviews/bulk/schedule
POST /interviews/:id/reschedule     { scheduledAt, reason }
POST /interviews/:id/cancel         { reason }
POST /interviews/:id/result         { status, score, feedback, strengths, improvements }
GET  /interviews/calendar           ?from=&to=
GET  /interviews/conflicts          ?studentIds=&slot=
```

### 9.5 Placements & Reports — `/college/placements`, `/college/placement-reports`

```
GET/POST /placements · GET/PATCH /placements/:id
POST /placements/:id/verify
POST /placements/:id/offer-letter    upload
GET  /placements/reports/summary          ?academicYear=
GET  /placements/reports/department-wise
GET  /placements/reports/company-wise
GET  /placements/reports/package-analysis
GET  /placements/reports/comparison       ?years=
POST /placements/reports/export           PDF/XLSX
```

### Rules

- **Placement rate counts students, not offers.** A student with three offers counts
  once. `isPrimaryOffer` marks the offer used in headline figures
  (`03-data-model.md` §6.5). This is the most common way placement statistics get
  inflated and the rule is enforced in the aggregation, not left to the report author.
- Eligibility is evaluated server-side at application time and snapshotted onto the
  application. A student who becomes ineligible later does not retroactively vanish from
  a drive.
- `allowPlacedStudents: false` excludes students with an accepted offer, but the rule
  respects a per-college "dream offer" policy setting where a student may apply above a
  package ceiling. `[REVISIT]` — the exact policy varies by institution and needs the
  Google Sheet.
- Publishing a job notifies eligible students only.
- Closing a job auto-rejects applications still in `applied` with a system reason,
  rather than leaving them permanently pending.

---

## 10. Analytics — `/college/analytics`

Tabs: Overview · Academics · Attendance · Placement · Engagement.

Every chart follows `02-design-system.md` §8: correct form for the job, fixed series
slots by entity, one y-axis, hover by default, legend plus a table-view toggle.

| Tab | Charts |
| --- | --- |
| Overview | Enrolment trend (line) · Department distribution (stacked bar) · KPI tiles |
| Academics | CGPA distribution (histogram) · Pass rate by subject (horizontal bar, sorted) · Semester trend (line) · Backlog analysis |
| Attendance | Monthly trend (line) · Department comparison (bar) · Defaulter count (bar) · Calendar heatmap (sequential blue) |
| Placement | Offers by month (bar) · Package distribution (histogram) · Top recruiters (horizontal bar) · Department-wise rate (bar) · Funnel (horizontal bar) |
| Engagement | Course completion (bar) · Active users (line) · Assignment submission rate · Exam participation |

```
GET /analytics/overview     ?from=&to=&departmentId=
GET /analytics/academics
GET /analytics/attendance
GET /analytics/placement
GET /analytics/engagement
GET /analytics/compare      ?dimension=department|batch|year&metric=
```

### Rules

- Analytics run as MongoDB aggregation pipelines in dedicated repository methods, never
  as application-side loops over fetched documents.
- Results are cached in Redis for 5 minutes, keyed by college + filter hash.
- Any query whose date range exceeds 2 years runs as an async job returning a `jobId`,
  rather than holding an HTTP connection open.
- Every chart endpoint returns data in the shape the chart consumes — the client does
  no reshaping, so the same numbers cannot be aggregated two different ways on two
  different screens.

---

## 11. Reports — `/college/reports`

A report builder over the same aggregations: pick a type, set filters, choose columns,
preview, export as PDF/XLSX/CSV, and optionally save the configuration or schedule it
for recurring email delivery.

```
GET  /reports/types
POST /reports/preview       { type, filters, columns }
POST /reports/generate      → jobId
GET  /reports/jobs/:id      status + download URL
GET  /reports/saved · POST /reports/saved · DELETE /reports/saved/:id
POST /reports/schedule      { savedReportId, cron, recipients }
```

Generation is always a background job (`09-integrations.md` §4). A 5,000-row PDF is not
something to render inside a request.

---

## 12. Notifications & Announcements — `/college/announcements`

Compose with an audience builder (all / role / department / batch / custom), a live
recipient count, rich text, attachments, priority, pin, and schedule.

```
GET/POST /announcements · GET/PATCH/DELETE /announcements/:id
POST /announcements/:id/publish
POST /announcements/preview-audience     → recipient count
GET  /notifications                       own notifications
PATCH /notifications/:id/read
POST /notifications/read-all
```

Publishing enqueues a fan-out job (`03-data-model.md` §7.1) that writes one notification
per recipient in batches, sends email to those who have opted in, and emits a socket
event to online users. A 5,000-recipient announcement never runs inside the request.

---

## 13. Support Tickets, Audit Logs, Settings

### Support — `/college/support`

List with status/priority/category filters and SLA indicators; detail is a threaded
conversation with attachments, internal notes, assignment, and resolution.

```
GET/POST /tickets · GET/PATCH /tickets/:id
POST /tickets/:id/messages
POST /tickets/:id/assign · /resolve · /reopen · /rate
```

Internal notes are stripped for the ticket raiser in the serializer
(`03-data-model.md` §7.3) — with a test asserting it.

### Audit Logs — `/college/audit-logs`

Read-only table: timestamp, user, action, entity, outcome, IP. Filters by user, action,
category, severity, entity, date range. A detail drawer shows the field-level `changes`
diff. Cursor pagination (`05-api-conventions.md` §5), since this collection grows
without bound.

```
GET /audit-logs        ?userId=&action=&category=&severity=&from=&to=&cursor=
GET /audit-logs/:id
POST /audit-logs/export
```

No write, update, or delete endpoints exist. This is enforced at the model level.

### Settings — `/college/settings`

Tabs: Profile · Academic (year start, grading scale, attendance threshold) ·
Registration (self-registration toggle, join code rotation) · Placement (eligibility
defaults, dream-offer policy) · Notifications · Certificate template & signatory ·
Users & Roles · Integrations · Danger Zone.

```
GET/PATCH /settings/college
GET/PATCH /settings/academic · /placement · /notifications
POST /settings/join-code/regenerate
GET  /settings/roles · POST /settings/roles · PATCH /settings/roles/:id
GET  /users · POST /users/:id/suspend · POST /users/:id/reset-password
```

A college admin can never grant a permission they do not themselves hold
(`03-data-model.md` §2.2) — checked in the service.

---

## 14. Platform Admin surface — `/platform`

Minimal, and present only because college approval requires it (`00-overview.md` §5).

```
/platform/colleges            approval queue + all colleges
/platform/companies           global company master, verification
/platform/settings            global system settings
/platform/audit               cross-tenant audit view
```

```
GET  /platform/colleges                ?status=pending
POST /platform/colleges/:id/approve
POST /platform/colleges/:id/reject     { reason }
POST /platform/colleges/:id/suspend    { reason }
POST /platform/companies/:id/verify
GET/PATCH /platform/settings
```

Every endpoint here requires `platform_admin` and uses the explicit
`withoutTenantScope()` escape hatch (`01-architecture.md` §4), each call site logged.
