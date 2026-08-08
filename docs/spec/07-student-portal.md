# Student Portal

Depends on: `02-design-system.md`, `03-data-model.md`, `04-auth-rbac.md`,
`05-api-conventions.md`.

Route group `client/src/app/(student)/`, prefixed `/student`. Endpoints prefixed
`/api/v1`.

**The governing rule for this entire portal:** a student sees their own data and
nothing else. This is enforced by the `ScopeGuard` in the service layer
(`04-auth-rbac.md` §5), not by passing a student id from the client. Endpoints here
derive the student from the authenticated user; **an endpoint that accepts a
`studentId` parameter from a student caller is a defect.**

---

## 1. Navigation

```
Home          Dashboard
Learn         Courses · Live Classes · Practice
Assess        Assignments · Assessments · Examinations · Results
Track         Attendance · Certificates
Career        Resume Builder · Jobs · My Applications · Interviews
Account       Notifications · Settings · Support
```

Same `AppShell`, same components, same tokens as the College Portal
(`02-design-system.md` §6). The portals differ in navigation and data, not in look.

---

## 2. Dashboard — `/student`

**Purpose:** "what do I need to do today, and am I on track?"

### Layout

1. **Stat tiles:** Attendance % (with threshold status) · Current CGPA · Courses in
   Progress · Active Applications.
2. **Action panel** — the primary element: assignments due in 7 days, exams in the
   availability window, interviews scheduled, unread announcements, incomplete profile
   or resume prompts. Sorted by urgency, each row linking to the action.
3. **Today** — live classes and exams scheduled today.
4. **Progress charts:** attendance trend (line) · course progress (horizontal bars) ·
   assessment score trend (line).
5. **Placement snapshot** — eligibility status with the reason if ineligible, open jobs
   the student qualifies for, and their application funnel.

### Endpoints

```
GET /dashboard/student/stats
GET /dashboard/student/actions
GET /dashboard/student/today
GET /dashboard/student/progress      ?range=90d
GET /dashboard/student/placement
```

### Rules

- Attendance percentage comes from `attendancesummaries` (`03-data-model.md` §5.3),
  never a live count.
- If attendance is below the college threshold, the tile uses the `serious` status
  colour with an icon and label — never colour alone (`02-design-system.md` §2).
- Ineligibility always shows **why** ("CGPA 6.4 is below the 7.0 requirement"), not a
  bare "not eligible". A student who cannot see the reason files a support ticket.

---

## 3. Courses — `/student/courses`

| Route | Screen |
| --- | --- |
| `/student/courses` | Catalogue: enrolled + available, card grid with progress rings |
| `/student/courses/:id` | Overview: description, outcomes, instructor, module list, progress |
| `/student/courses/:id/learn/:materialId` | Player: video/PDF/text viewer with module sidebar |

The player marks materials complete on genuine completion (≥90% of a video watched, or
an explicit "mark complete" for documents), tracks time spent, and resumes from
`enrollments.lastMaterialId`.

```
GET  /student/courses                    ?status=enrolled|available|completed
GET  /student/courses/:id
POST /student/courses/:id/enroll
GET  /student/courses/:id/modules
GET  /student/courses/:id/materials/:materialId     signed URL for protected files
POST /student/courses/:id/materials/:materialId/complete
POST /student/courses/:id/progress       { materialId, timeSpentSeconds, position }
POST /student/courses/:id/rate           { rating, feedback }
```

### Rules

- Self-enrolment only where the course is published and the student's batch or
  department is in scope; otherwise enrolment is by assignment.
- Material URLs for non-public files are **short-lived signed URLs** issued per request,
  not permanent links (`09-integrations.md` §1). A permanent URL to a paid course video
  is a link away from being shared publicly.
- Progress writes are throttled client-side to one every 15 seconds.
- Completing 100% of mandatory materials triggers certificate issuance if the course is
  configured for it.

---

## 4. Live Classes — `/student/live-classes`

Upcoming / Live now / Past recordings. Joining opens the meeting link, records
attendance against the linked session, and marks join/leave times.

```
GET  /student/live-classes           ?status=upcoming|live|past
GET  /student/live-classes/:id
POST /student/live-classes/:id/join  → returns join URL, records attendance
GET  /student/live-classes/:id/recording
```

### Rules

- The join endpoint returns `meeting.joinUrl` only. `meeting.hostUrl` is `select: false`
  and stripped by the serializer (`03-data-model.md` §4.5).
- Joining is permitted from 15 minutes before the scheduled start until the scheduled
  end.
- Attendance credit requires a configurable minimum presence duration, not merely
  clicking join.
- A student not in `batchIds` gets 404, not 403.

---

## 5. Practice — `/student/practice`

Always-available, unlimited-attempt exams (`exams.kind = 'practice'`). Browse by
category, topic, and difficulty; see personal best and attempt history; immediate
answers and explanations after submission.

```
GET  /student/practice                  ?category=&topic=&difficulty=
GET  /student/practice/:id
POST /student/practice/:id/start        → attemptId + served questions
POST /student/practice/:id/attempts/:attemptId/answer
POST /student/practice/:id/attempts/:attemptId/submit
GET  /student/practice/:id/attempts     history
GET  /student/practice/stats            strengths and weaknesses by topic
```

Practice is where `showCorrectAnswers: 'after_submit'` is the norm — the point is
learning, not measurement.

---

## 6. Assessments & Examinations — `/student/assessments`, `/student/exams`

One engine, two configurations (`03-data-model.md` §4.8). Assessments are lower-stakes
and may allow multiple attempts; examinations are single-attempt, windowed, and
proctored.

> **OPEN QUESTION** — `00-overview.md` §8.3: confirm this matches the real distinction
> at your institutions.

### The exam runner

A dedicated full-screen layout, deliberately outside the `AppShell`: no sidebar, no
notifications, no navigation. Contains the question palette (answered / unanswered /
flagged), the question area, navigation, a **server-synced countdown**, and submit with
a summary of unanswered questions.

```
GET  /student/exams                      ?kind=assessment|examination&status=
GET  /student/exams/:id
POST /student/exams/:id/start            → attemptId, questions, expiresAt
GET  /student/exams/:id/attempts/:attemptId
POST /student/exams/:id/attempts/:attemptId/answer      autosave, per question
POST /student/exams/:id/attempts/:attemptId/flag
POST /student/exams/:id/attempts/:attemptId/submit
POST /student/exams/:id/attempts/:attemptId/violation   proctoring event
GET  /student/exams/:id/attempts/:attemptId/result
GET  /student/exams/results
```

### Rules — these are the integrity requirements

- **The timer is server-authoritative.** `expiresAt` is set at start and stored
  (`03-data-model.md` §4.10). The client displays a countdown derived from a server
  timestamp and re-syncs periodically; it never determines expiry. A submission after
  `expiresAt` is `auto_submitted`, and a cron sweeps abandoned attempts.
- **Correct answers never reach the client during an attempt.** `options.isCorrect` is
  `select: false` and stripped by the student serializer, with a test asserting the
  payload contains no `isCorrect` key. Grading happens server-side only.
- **Answers autosave** on every change, so a browser crash or lost connection does not
  lose the attempt. The attempt is resumable within its window.
- Proctoring violations (tab switch, fullscreen exit) are reported by the client and
  recorded. Exceeding `tabSwitchLimit` flags the attempt for review; it does **not**
  auto-invalidate — client-reported signals are unreliable and a false positive that
  voids a real exam is worse than a flagged one a human reviews.
- Attempt limits are enforced server-side against `attemptNumber`.
- Objective questions grade immediately; subjective and coding questions set
  `manualGrading.required` and the attempt waits in `grading`.
- Results are visible per `showResultsImmediately` / `showCorrectAnswers`.

---

## 7. Assignments — `/student/assignments`

List grouped by Pending / Submitted / Graded / Overdue, with due-date urgency styling.
Detail shows instructions, attachments, the submission form (type per the assignment),
attempt history, and grade with rubric breakdown and feedback.

```
GET  /student/assignments               ?status=&courseId=
GET  /student/assignments/:id
POST /student/assignments/:id/submit    file/text/link/code
GET  /student/assignments/:id/submissions
DELETE /student/assignments/:id/submissions/:sid   withdraw before the deadline only
```

### Rules

- Submission after `dueAt` is accepted only when `lateSubmissionAllowed`, before
  `lateCutoffAt`, with the penalty computed and stored on the submission — never applied
  silently at display time, so the student can see exactly what was deducted and why.
- File uploads validate type and size against the assignment's own limits.
- Attempts beyond `maxAttempts` are rejected.
- Withdrawal is permitted only before the deadline and before grading.
- Reminders fire at 48h and 6h before the due time via the notification job.

---

## 8. Attendance — `/student/attendance`

Overall percentage with threshold status; subject-wise and month-wise breakdown; a
calendar heatmap (sequential blue ramp, `02-design-system.md` §8.3); a session log with
status and remarks; and a **"sessions needed to reach the threshold"** calculation,
which is the number students actually want.

```
GET /student/attendance/summary        ?period=semester|month|overall
GET /student/attendance/sessions       ?from=&to=&courseId=
GET /student/attendance/calendar       ?month=
GET /student/attendance/projection     sessions needed to reach the threshold
```

Read-only. Disputes go through Support (§14), which creates a ticket linked to the
session — students cannot edit attendance, and the correction path runs through
faculty with `modifiedHistory` recording it.

---

## 9. Results — `/student/results`

Semester-wise cards with GPA, subject tables, CGPA trend line, backlog list, and a
downloadable consolidated statement.

```
GET  /student/results                  ?semester=
GET  /student/results/:id
GET  /student/results/transcript       consolidated PDF
```

Only `status: 'published'` results are visible. `withheld` results show a neutral
"result withheld — contact the administration" state rather than a blank screen.

---

## 10. Certificates — `/student/certificates`

Grid of certificate cards with preview, PDF download, a shareable public verification
link, and a "add to LinkedIn" link.

```
GET /student/certificates
GET /student/certificates/:id
GET /student/certificates/:id/download
GET /certificates/verify/:verificationCode      PUBLIC, unauthenticated
```

The public verification endpoint returns only what a verifier needs — student name,
certificate title, issuing college, issue date, validity — and never contact details,
roll number, or academic record. It is rate-limited and uses an unguessable code
(`03-data-model.md` §4.12), because it is the one endpoint in the product deliberately
open to the internet.

---

## 11. Resume Builder — `/student/resume`

A structured editor (personal, education, skills, projects, experience, certifications,
achievements) with live preview, multiple templates, ATS-friendliness hints, PDF export,
and versioning.

```
GET  /student/resume
PATCH /student/resume                    autosaved sections
POST /student/resume/generate            → PDF
GET  /student/resume/templates
POST /student/resume/set-primary         { fileKey }
POST /student/resume/upload              upload an external resume instead
GET  /student/resume/completeness        score + specific suggestions
```

### Rules

- Prefilled from the student profile and certificates on first use, then independently
  editable — a student's resume is not a live view of their record.
- The primary resume is what gets snapshotted onto job applications
  (`03-data-model.md` §6.3).
- Applications require a resume; the UI blocks the apply action with an explanation
  rather than failing at submit.
- AI assistance is out of scope here but the service boundary is designed for it
  (`09-integrations.md` §5).

---

## 12. Placement — `/student/jobs`, `/student/applications`, `/student/interviews`

### Jobs — `/student/jobs`

Only jobs the student is **eligible** for are listed by default, with a toggle to show
ineligible ones **and the specific reason** for each. Hiding ineligible jobs entirely
generates support tickets; showing them without a reason generates more.

```
GET  /student/jobs                     ?eligible=true|all&type=&company=
GET  /student/jobs/:id
GET  /student/jobs/:id/eligibility     per-criterion pass/fail breakdown
POST /student/jobs/:id/apply           { coverLetter?, answers? }
```

### Applications — `/student/applications`

Table plus a per-application timeline of rounds and statuses.

```
GET  /student/applications             ?status=
GET  /student/applications/:id
POST /student/applications/:id/withdraw    { reason }
GET  /student/applications/stats           personal funnel
```

### Interviews — `/student/interviews`

Upcoming and past, with schedule, mode, venue or link, interviewer panel, instructions,
confirmation action, and (after the fact) feedback where the officer has shared it.

```
GET  /student/interviews               ?status=
GET  /student/interviews/:id
POST /student/interviews/:id/confirm
POST /student/interviews/:id/request-reschedule   { reason, preferredSlots }
GET  /student/interviews/calendar
```

### Rules

- Eligibility is checked server-side at apply time and snapshotted
  (`03-data-model.md` §6.3). The client's eligibility display is informational.
- Applications close at `applicationCloseAt` — server clock, not client.
- Withdrawal is allowed until the student is `selected`; after an accepted offer it
  requires officer involvement.
- Students see only their **own** applications and interviews. Aggregate placement
  statistics for the college are visible; other students' records are not.
- Interview reminders fire at 24h and 1h before, in-app and by email.

---

## 13. Notifications & Settings

```
GET   /notifications                    ?category=&unread=
PATCH /notifications/:id/read
POST  /notifications/read-all
DELETE /notifications/:id               archive

GET/PATCH /student/profile
POST  /student/profile/avatar
PATCH /auth/change-password
GET   /auth/sessions · DELETE /auth/sessions/:id
PATCH /settings/preferences             theme, locale, notification channels
POST  /auth/oauth/link · /unlink
```

Students may edit contact details, guardian information, skills, and portfolio links.
They may **not** edit roll number, batch, department, CGPA, or attendance — those are
institutional records, and the API rejects the fields rather than relying on a disabled
input.

---

## 14. Support — `/student/support`

Raise and track tickets, with a threaded conversation and attachments. Internal staff
notes are never returned to the student (`03-data-model.md` §7.3).

```
GET/POST /tickets                       scoped to own tickets
GET  /tickets/:id
POST /tickets/:id/messages
POST /tickets/:id/reopen · /rate
```

---

## 15. Cross-cutting rules for this portal

1. **Never accept a `studentId` from a student caller.** Derive it from the token.
2. **Read-only means read-only at the API.** Attendance, results, and academic fields
   reject writes rather than depending on UI state.
3. **Every serializer is student-facing by default here.** Correct answers, host URLs,
   internal notes, and other students' data are stripped at the serializer, with tests
   asserting absence.
4. **Explain every negative.** Ineligible, withheld, locked, closed — each state shows
   its reason. This is a product rule with real support-cost consequences, not a
   nicety.
5. **Mobile matters more here than in the College Portal.** Students use phones. Every
   screen in this portal supplies a `mobileRender` for tables
   (`02-design-system.md` §6) and is tested at 375px.
