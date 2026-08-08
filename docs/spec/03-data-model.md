# Data Model

Depends on: `00-overview.md` (tenancy), `01-architecture.md` (repository layer).

> **OPEN QUESTION** — this document is written from the module brief. The architecture
> diagram and Google Sheet specification, once provided, will most likely add fields
> and possibly collections. Sections marked `[REVISIT]` are the ones most exposed.

---

## 1. Conventions applied to every collection

### Base fields

Every document, without exception:

```ts
{
  _id:        ObjectId,
  createdAt:  Date,        // Mongoose timestamps
  updatedAt:  Date,        // Mongoose timestamps
  createdBy:  ObjectId | null,   // ref User — null only for seeded/system rows
  updatedBy:  ObjectId | null,   // ref User
  deletedAt:  Date | null,       // soft delete tombstone
  deletedBy:  ObjectId | null,   // ref User
  version:    number             // optimistic concurrency
}
```

Implemented once as a `baseSchemaFields` object plus a `applyBasePlugin(schema)`
Mongoose plugin in `server/src/models/plugins/`. No collection redefines these.

### Tenant field

Every tenant-scoped collection additionally carries:

```ts
collegeId: { type: ObjectId, ref: 'College', required: true, index: true }
```

Global (non-tenant-scoped) collections: `users`, `roles`, `permissions`, `colleges`,
`companies`, `systemsettings`. Everything else is tenant-scoped.

### Soft delete

`deletedAt: null` means live. The base repository appends `{ deletedAt: null }` to
every query (`01-architecture.md` §4). Unique indexes are therefore **partial**, filtered
on `deletedAt: null` — otherwise a deleted student permanently blocks reuse of their
roll number, which is wrong for real institutions that do reissue identifiers.

```ts
schema.index(
  { collegeId: 1, rollNumber: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } }
);
```

### Naming and types

- Collections: lowercase plural (Mongoose default from the singular model name).
- References: `<entity>Id` for one, `<entity>Ids` for many.
- Money: integer **minor units** (paise) plus an ISO currency code. Never a float.
- Percentages: number 0–100, one decimal place, never a 0–1 fraction. Mixing the two
  conventions across modules is a reliable source of display bugs.
- Enums: string enums declared once in `shared/src/constants/` and imported by both
  the Mongoose schema and the Zod schema, so the two can never disagree.
- Dates: always `Date` (UTC). Date-only values (attendance day, DOB) are stored at
  UTC midnight and rendered in the college's timezone. Timezone lives on the college.

### Indexing rules

- Every field used in a filter, sort, or join gets an index.
- Compound indexes lead with `collegeId` for tenant-scoped collections, because every
  query carries it — a compound index that does not lead with the always-present
  equality field cannot be used efficiently.
- Sort fields go last in a compound index, matching the ESR (Equality, Sort, Range)
  rule.
- Text indexes only where genuine full-text search is needed; otherwise anchored
  prefix regex on an indexed field, which can use the index where a leading-wildcard
  regex cannot.
- TTL indexes on ephemeral collections (`otps`, `sessions`, `idempotencykeys`).

### Relationship style

References (`ObjectId` + `ref`), not embedding, for anything independently queryable or
unbounded. Embedding is used only for genuinely owned, bounded sub-documents — a
question inside an exam, an address on a college. The failure mode to avoid is
embedding attendance records or applications inside a student, which grows a document
without bound and hits the 16MB limit.

---

## 2. Identity and access

### 2.1 `users`  *(global)*

The authentication identity. Profile detail lives in `students` / `faculty`, keeping
this collection small and fast for the login path.

```ts
{
  email:            String,   // lowercase, trimmed, unique (partial, live only)
  passwordHash:     String,   // bcrypt cost 12; absent for OAuth-only accounts
  firstName:        String,
  lastName:         String,
  phone:            String | null,      // E.164
  avatarUrl:        String | null,
  collegeId:        ObjectId | null,    // null only for platform_admin
  roleId:           ObjectId,           // ref Role
  extraPermissions: String[],           // additive grants beyond the role
  status:           'pending_verification' | 'pending_approval' | 'active'
                    | 'suspended' | 'archived',
  emailVerifiedAt:  Date | null,
  phoneVerifiedAt:  Date | null,
  lastLoginAt:      Date | null,
  lastLoginIp:      String | null,
  passwordChangedAt: Date | null,       // invalidates tokens issued before it
  failedLoginAttempts: Number,          // default 0
  lockedUntil:      Date | null,
  mustChangePassword: Boolean,          // true for admin-created accounts
  oauthProviders: [{
    provider:   'google' | 'microsoft',
    providerId: String,
    email:      String,
    linkedAt:   Date
  }],
  preferences: {
    theme:        'light' | 'dark' | 'system',
    locale:       String,        // 'en-IN'
    emailNotifications: Boolean,
    pushNotifications:  Boolean
  }
}
```

**Indexes**
```
{ email: 1 }                    unique, partial { deletedAt: null }
{ collegeId: 1, roleId: 1 }
{ collegeId: 1, status: 1 }
{ 'oauthProviders.provider': 1, 'oauthProviders.providerId': 1 }  sparse
{ status: 1, createdAt: -1 }
```

**Invariants**
- `passwordHash` is `select: false` — it is never returned unless explicitly asked for
  by the auth service. This single line prevents a whole class of accidental leaks.
- `collegeId` is null **iff** the role is `platform_admin`.
- `status: 'active'` requires `emailVerifiedAt != null`.
- A user with no `passwordHash` must have at least one `oauthProviders` entry.
- Email is stored lowercase; the schema normalises on write so lookups are exact-match
  on an index rather than case-insensitive regex.

### 2.2 `roles`  *(global)*

```ts
{
  key:          String,    // 'college_admin' — stable, code-referenced, unique
  name:         String,    // 'College Administrator' — display
  description:  String,
  permissions:  String[],  // permission keys
  scope:        'platform' | 'college' | 'department' | 'self',
  isSystem:     Boolean,   // system roles cannot be deleted or renamed
  collegeId:    ObjectId | null   // null = built-in; set = college-defined custom role
}
```

**Indexes:** `{ key: 1 }` unique partial; `{ collegeId: 1 }`.

Colleges may create custom roles scoped to themselves, but only from the permission set
their own plan allows, and they can never grant a permission they do not hold —
enforced in the service layer, not just the UI.

### 2.3 `permissions`  *(global, seeded reference data)*

```ts
{
  key:         String,   // 'student:create' — unique
  resource:    String,   // 'student'
  action:      String,   // 'create'
  description: String,
  module:      String,   // grouping for the role-editor UI
  isDangerous: Boolean   // needs extra confirmation when granted
}
```

Seeded from `shared/src/constants/permissions.ts` so code and database agree. Full list
in `04-auth-rbac.md`.

### 2.4 `sessions`  *(global)*

One document per refresh token, i.e. per logged-in device. Powers multi-device login,
"sign out everywhere", and refresh-token reuse detection.

```ts
{
  userId:            ObjectId,
  refreshTokenHash:  String,       // SHA-256 of the token; never the token itself
  family:            String,       // rotation family id (ULID)
  userAgent:         String,
  ip:                String,
  deviceLabel:       String,       // derived, e.g. 'Chrome on Windows'
  expiresAt:         Date,         // TTL
  revokedAt:         Date | null,
  revokedReason:     'logout' | 'rotated' | 'reuse_detected' | 'password_change'
                     | 'admin_revoke' | null,
  lastUsedAt:        Date
}
```

**Indexes:** `{ userId: 1, revokedAt: 1 }`; `{ refreshTokenHash: 1 }` unique;
`{ family: 1 }`; `{ expiresAt: 1 }` TTL 0.

### 2.5 `otps`  *(global)*

```ts
{
  userId:      ObjectId | null,
  identifier:  String,     // email or phone — supports pre-account OTPs
  codeHash:    String,     // bcrypt; never plaintext
  purpose:     'email_verification' | 'phone_verification' | 'password_reset'
               | 'login_mfa' | 'sensitive_action',
  attempts:    Number,     // max 5, then invalidate
  consumedAt:  Date | null,
  expiresAt:   Date        // TTL, 10 minutes
}
```

**Indexes:** `{ identifier: 1, purpose: 1, consumedAt: 1 }`; `{ expiresAt: 1 }` TTL 0.

OTP codes are hashed at rest for the same reason passwords are: a database read should
not hand an attacker a working second factor.

---

## 3. Institution

### 3.1 `colleges`  *(global — the tenant root)*

```ts
{
  name:          String,
  code:          String,       // short unique slug, 'PSGCT'
  type:          'engineering' | 'arts_science' | 'management' | 'polytechnic' | 'other',
  affiliatedTo:  String | null,      // university
  accreditation: String[],           // ['NAAC A++', 'NBA']
  establishedYear: Number,
  logoUrl:       String | null,
  website:       String | null,
  email:         String,
  phone:         String,
  address: {
    line1: String, line2: String | null, city: String,
    state: String, country: String, pincode: String
  },
  timezone:      String,             // IANA, default 'Asia/Kolkata'
  academicYearStartMonth: Number,    // 1–12, drives batch/semester rollover
  status:        'pending' | 'active' | 'suspended' | 'rejected',
  approvedBy:    ObjectId | null,
  approvedAt:    Date | null,
  rejectionReason: String | null,
  primaryContact: { name: String, email: String, phone: String, designation: String },
  settings: {
    allowStudentSelfRegistration: Boolean,
    joinCode:                     String | null,
    attendanceThresholdPercent:   Number,   // default 75
    gradingScale:                 'percentage' | 'gpa_10' | 'gpa_4',
    certificateSignatory:         { name: String, designation: String, signatureUrl: String | null }
  },
  stats: {   // denormalised counters, maintained transactionally
    totalStudents: Number, totalFaculty: Number,
    totalDepartments: Number, totalBatches: Number
  }
}
```

**Indexes:** `{ code: 1 }` unique partial; `{ status: 1, createdAt: -1 }`;
`{ name: 'text' }`.

`stats` is a deliberate denormalisation: the college dashboard renders these on every
load, and counting five collections per page view does not scale. They are updated
inside the same transaction as the underlying change, and a nightly cron reconciles
them against reality and logs any drift.

### 3.2 `departments`

```ts
{
  collegeId:  ObjectId,
  name:       String,          // 'Computer Science and Engineering'
  code:       String,          // 'CSE' — unique within college
  hodId:      ObjectId | null, // ref User
  description: String | null,
  establishedYear: Number | null,
  status:     'active' | 'inactive',
  stats: { totalStudents: Number, totalFaculty: Number, totalBatches: Number }
}
```

**Indexes:** `{ collegeId: 1, code: 1 }` unique partial; `{ collegeId: 1, status: 1 }`;
`{ collegeId: 1, hodId: 1 }`.

### 3.3 `batches`

A batch is the unit almost everything else hangs off: a cohort of students in a
department, in an academic year, in a section.

```ts
{
  collegeId:     ObjectId,
  departmentId:  ObjectId,
  name:          String,         // 'CSE 2022-2026 Section A'
  code:          String,         // 'CSE-22-A' — unique within college
  admissionYear: Number,         // 2022
  graduationYear: Number,        // 2026
  currentSemester: Number,       // 1–8, advanced by the rollover job
  section:       String | null,
  classAdvisorId: ObjectId | null,   // ref User (faculty)
  capacity:      Number,
  status:        'active' | 'completed' | 'archived',
  stats: { totalStudents: Number }
}
```

**Indexes:** `{ collegeId: 1, code: 1 }` unique partial;
`{ collegeId: 1, departmentId: 1, status: 1 }`; `{ collegeId: 1, graduationYear: 1 }`.

**Invariant:** `graduationYear > admissionYear`; enrolled student count never exceeds
`capacity` (service-enforced, with an override permission for admins).

### 3.4 `students`

Academic profile. Authentication lives in `users`.

```ts
{
  collegeId:    ObjectId,
  userId:       ObjectId,        // ref User, unique
  departmentId: ObjectId,
  batchId:      ObjectId,
  rollNumber:   String,          // unique within college
  registerNumber: String | null, // university number
  admissionDate: Date,
  currentSemester: Number,
  dateOfBirth:  Date | null,
  gender:       'male' | 'female' | 'other' | 'prefer_not_to_say' | null,
  bloodGroup:   String | null,
  category:     String | null,
  address:      { /* as college.address */ } | null,
  guardian:     { name: String, relation: String, phone: String, email: String | null } | null,
  academics: {
    tenthPercent:    Number | null,
    twelfthPercent:  Number | null,
    diplomaPercent:  Number | null,
    currentCgpa:     Number | null,
    semesterGpas:    [{ semester: Number, gpa: Number, credits: Number }],
    activeBacklogs:  Number,
    totalBacklogs:   Number,
    yearGap:         Number      // years of education gap — a common eligibility filter
  },
  skills:       [{ name: String, level: 'beginner'|'intermediate'|'advanced'|'expert',
                   verified: Boolean, verifiedVia: ObjectId | null }],
  resumeUrl:    String | null,
  resumeUpdatedAt: Date | null,
  portfolioLinks: { github: String|null, linkedin: String|null,
                    portfolio: String|null, other: String[] },
  placement: {
    isEligible:     Boolean,       // computed by the eligibility service, cached
    eligibilityNote: String | null,
    isPlaced:       Boolean,
    placementCount: Number,        // students may hold more than one offer
    highestPackage: Number | null  // minor units
  },
  status: 'active' | 'on_leave' | 'graduated' | 'dropped' | 'suspended'
}
```

**Indexes**
```
{ collegeId: 1, rollNumber: 1 }                 unique, partial { deletedAt: null }
{ userId: 1 }                                    unique, partial
{ collegeId: 1, batchId: 1, status: 1 }
{ collegeId: 1, departmentId: 1, status: 1 }
{ collegeId: 1, 'placement.isEligible': 1, 'placement.isPlaced': 1 }
{ collegeId: 1, 'academics.currentCgpa': -1 }
{ collegeId: 1, 'skills.name': 1 }
```

`placement.isEligible` is cached rather than computed per query because placement
listings filter on it constantly. It is recomputed whenever CGPA, backlogs, or the
college's eligibility rules change, and by a nightly job as a safety net. `[REVISIT]`
once the Google Sheet defines the real eligibility criteria.

### 3.5 `faculty`

```ts
{
  collegeId:     ObjectId,
  userId:        ObjectId,      // unique
  departmentId:  ObjectId,
  employeeId:    String,        // unique within college
  designation:   String,        // 'Assistant Professor'
  employmentType: 'permanent' | 'contract' | 'visiting' | 'guest',
  type:          'faculty' | 'trainer',   // trainers are staffed via training requests
  joiningDate:   Date,
  qualifications: [{ degree: String, specialization: String,
                     institution: String, year: Number }],
  experienceYears: Number,
  specializations: String[],
  assignedBatchIds: ObjectId[],
  status: 'active' | 'on_leave' | 'resigned' | 'retired'
}
```

**Indexes:** `{ collegeId: 1, employeeId: 1 }` unique partial; `{ userId: 1 }` unique
partial; `{ collegeId: 1, departmentId: 1, status: 1 }`;
`{ collegeId: 1, type: 1, status: 1 }`; `{ assignedBatchIds: 1 }`.

**Decision:** trainers are not a separate collection. The brief lists `Trainers` as its
own collection, but a trainer is a faculty member with a different employment origin —
identical fields, identical permissions, differing only in reporting. A discriminator
field avoids duplicating every faculty query and join. `type` supports the reporting
split.

---

## 4. Learning

### 4.1 `courses`

```ts
{
  collegeId:    ObjectId,
  title:        String,
  code:         String,          // unique within college
  description:  String,
  category:     'technical' | 'aptitude' | 'soft_skills' | 'domain' | 'certification',
  level:        'beginner' | 'intermediate' | 'advanced',
  thumbnailUrl: String | null,
  durationHours: Number,
  credits:      Number | null,
  instructorIds: ObjectId[],     // ref User (faculty/trainer)
  departmentIds: ObjectId[],     // empty = available to all departments
  batchIds:      ObjectId[],     // explicit assignment
  prerequisites: ObjectId[],     // ref Course
  learningOutcomes: String[],
  tags:         String[],
  status:       'draft' | 'published' | 'archived',
  publishedAt:  Date | null,
  stats: { totalModules: Number, totalEnrollments: Number,
           averageProgress: Number, averageRating: Number }
}
```

**Indexes:** `{ collegeId: 1, code: 1 }` unique partial;
`{ collegeId: 1, status: 1, category: 1 }`; `{ collegeId: 1, batchIds: 1 }`;
`{ collegeId: 1, tags: 1 }`; `{ title: 'text', description: 'text' }`.

### 4.2 `coursemodules`

```ts
{
  collegeId:   ObjectId,
  courseId:    ObjectId,
  title:       String,
  description: String | null,
  order:       Number,           // unique within course
  durationMinutes: Number,
  isPreview:   Boolean,
  status:      'draft' | 'published'
}
```

**Indexes:** `{ collegeId: 1, courseId: 1, order: 1 }` unique partial;
`{ courseId: 1, status: 1 }`.

### 4.3 `learningmaterials`

```ts
{
  collegeId:  ObjectId,
  courseId:   ObjectId,
  moduleId:   ObjectId,
  title:      String,
  type:       'video' | 'pdf' | 'document' | 'link' | 'slides' | 'code' | 'quiz',
  order:      Number,
  content: {
    url:            String | null,
    provider:       'cloudinary' | 's3' | 'external' | null,
    fileKey:        String | null,
    fileSizeBytes:  Number | null,
    mimeType:       String | null,
    durationSeconds: Number | null,   // video/audio
    externalUrl:    String | null,
    textContent:    String | null     // rich text stored inline
  },
  isDownloadable: Boolean,
  isMandatory:    Boolean,
  status:     'draft' | 'published'
}
```

**Indexes:** `{ collegeId: 1, moduleId: 1, order: 1 }`; `{ collegeId: 1, courseId: 1 }`.

### 4.4 `enrollments`

Not in the brief's list, but required: without it there is nowhere to record a
student's progress through a course. Adding it is a correctness fix, not scope creep.

```ts
{
  collegeId:   ObjectId,
  courseId:    ObjectId,
  studentId:   ObjectId,
  enrolledAt:  Date,
  enrolledBy:  ObjectId,        // self or an admin
  source:      'self' | 'batch_assignment' | 'admin',
  progressPercent: Number,      // 0–100
  completedMaterialIds: ObjectId[],
  lastAccessedAt: Date | null,
  lastMaterialId: ObjectId | null,   // resume-where-you-left-off
  timeSpentSeconds: Number,
  completedAt: Date | null,
  rating:      Number | null,   // 1–5
  feedback:    String | null,
  status:      'enrolled' | 'in_progress' | 'completed' | 'dropped'
}
```

**Indexes:** `{ collegeId: 1, courseId: 1, studentId: 1 }` unique partial;
`{ collegeId: 1, studentId: 1, status: 1 }`; `{ collegeId: 1, courseId: 1, status: 1 }`.

### 4.5 `liveclasses`

> **OPEN QUESTION** — meeting provider undecided (`00-overview.md` §8.2). The
> `provider`/`meeting` shape below is an adapter boundary; provider-specific fields go
> in `meeting.providerData`.

```ts
{
  collegeId:    ObjectId,
  courseId:     ObjectId | null,
  batchIds:     ObjectId[],
  title:        String,
  description:  String | null,
  instructorId: ObjectId,
  scheduledStart: Date,
  scheduledEnd:   Date,
  actualStart:  Date | null,
  actualEnd:    Date | null,
  meeting: {
    provider:     'zoom' | 'google_meet' | 'jitsi' | 'bigbluebutton',
    meetingId:    String,
    joinUrl:      String,
    hostUrl:      String | null,     // never exposed to students
    passcode:     String | null,
    providerData: Mixed
  },
  recording: { url: String | null, durationSeconds: Number | null,
               availableUntil: Date | null } | null,
  attendanceSessionId: ObjectId | null,   // links join-tracking to attendance
  status: 'scheduled' | 'live' | 'completed' | 'cancelled',
  cancellationReason: String | null
}
```

**Indexes:** `{ collegeId: 1, scheduledStart: 1 }`;
`{ collegeId: 1, batchIds: 1, status: 1 }`; `{ collegeId: 1, instructorId: 1, scheduledStart: -1 }`.

`meeting.hostUrl` is `select: false` and stripped in the student serializer — a host URL
handed to a student lets them take over the class.

### 4.6 `assignments`

```ts
{
  collegeId:   ObjectId,
  courseId:    ObjectId | null,
  moduleId:    ObjectId | null,
  batchIds:    ObjectId[],
  title:       String,
  description: String,
  instructions: String | null,
  attachments: [{ url: String, fileName: String, fileKey: String,
                  sizeBytes: Number, mimeType: String }],
  maxScore:    Number,
  passingScore: Number,
  weightage:   Number | null,        // percent of course grade
  submissionType: 'file' | 'text' | 'link' | 'code',
  allowedFileTypes: String[],
  maxFileSizeMb: Number,
  maxAttempts: Number,               // default 1
  assignedAt:  Date,
  dueAt:       Date,
  lateSubmissionAllowed: Boolean,
  latePenaltyPercent: Number,        // per day
  lateCutoffAt: Date | null,
  createdByFacultyId: ObjectId,
  status: 'draft' | 'published' | 'closed',
  stats: { totalAssigned: Number, totalSubmitted: Number,
           totalGraded: Number, averageScore: Number }
}
```

**Indexes:** `{ collegeId: 1, batchIds: 1, status: 1, dueAt: 1 }`;
`{ collegeId: 1, courseId: 1 }`; `{ collegeId: 1, createdByFacultyId: 1, createdAt: -1 }`.

**Invariants:** `dueAt > assignedAt`; `passingScore <= maxScore`;
`lateCutoffAt > dueAt` when late submission is allowed.

### 4.7 `assignmentsubmissions`

```ts
{
  collegeId:    ObjectId,
  assignmentId: ObjectId,
  studentId:    ObjectId,
  attemptNumber: Number,
  submittedAt:  Date,
  isLate:       Boolean,
  daysLate:     Number,
  content: {
    text:  String | null,
    link:  String | null,
    files: [{ url, fileName, fileKey, sizeBytes, mimeType }],
    code:  { language: String, source: String } | null
  },
  grade: {
    score:        Number | null,
    maxScore:     Number,
    penaltyApplied: Number,
    finalScore:   Number | null,
    feedback:     String | null,
    rubricScores: [{ criterion: String, score: Number, maxScore: Number }],
    gradedBy:     ObjectId | null,
    gradedAt:     Date | null
  },
  status: 'submitted' | 'graded' | 'returned' | 'resubmit_requested'
}
```

**Indexes:** `{ collegeId: 1, assignmentId: 1, studentId: 1, attemptNumber: 1 }` unique
partial; `{ collegeId: 1, studentId: 1, status: 1 }`;
`{ collegeId: 1, assignmentId: 1, status: 1 }`.

### 4.8 `exams`  *(Assessments, Practice, and Examinations — one engine)*

> **OPEN QUESTION** — `00-overview.md` §8.3. The brief lists Practice, Assessments, and
> Examinations separately. They share ~90% of their model, so this spec uses one
> collection with a `kind` discriminator. If they diverge materially at your
> institutions, this splits into three. `[REVISIT]`

```ts
{
  collegeId:   ObjectId,
  kind:        'practice' | 'assessment' | 'examination',
  courseId:    ObjectId | null,
  moduleId:    ObjectId | null,
  batchIds:    ObjectId[],
  title:       String,
  description: String | null,
  category:    'aptitude' | 'technical' | 'coding' | 'domain' | 'soft_skills',
  instructions: String | null,

  totalQuestions: Number,
  totalMarks:     Number,
  passingMarks:   Number,
  durationMinutes: Number,
  negativeMarking: { enabled: Boolean, marksPerWrong: Number },

  questionSelection: 'fixed' | 'random_pool',
  questionIds:  ObjectId[],       // fixed
  questionPool: { poolId: ObjectId, count: Number,
                  difficulty: 'easy'|'medium'|'hard'|'mixed' } | null,
  shuffleQuestions: Boolean,
  shuffleOptions:   Boolean,

  availableFrom: Date | null,     // null for always-on practice
  availableUntil: Date | null,
  maxAttempts:   Number,          // 0 = unlimited (practice only)
  showResultsImmediately: Boolean,
  showCorrectAnswers: 'never' | 'after_submit' | 'after_close',

  proctoring: {
    enabled: Boolean,
    fullscreenRequired: Boolean,
    tabSwitchLimit: Number,
    webcamRequired: Boolean,
    copyPasteDisabled: Boolean
  },

  createdByFacultyId: ObjectId,
  status: 'draft' | 'published' | 'closed' | 'archived',
  stats: { totalAttempts: Number, averageScore: Number,
           passRate: Number, averageTimeSeconds: Number }
}
```

**Indexes:** `{ collegeId: 1, kind: 1, status: 1 }`;
`{ collegeId: 1, batchIds: 1, availableFrom: 1, availableUntil: 1 }`;
`{ collegeId: 1, courseId: 1 }`.

**Invariants:** `passingMarks <= totalMarks`; `availableUntil > availableFrom`;
`kind: 'examination'` requires both availability bounds and `maxAttempts = 1`.

### 4.9 `questions`

Separate from `exams` so questions are reusable across exams and can form pools.

```ts
{
  collegeId:  ObjectId,
  poolId:     ObjectId | null,
  type:       'mcq_single' | 'mcq_multiple' | 'true_false' | 'short_answer'
              | 'long_answer' | 'coding' | 'numeric',
  category:   String,
  topic:      String | null,
  difficulty: 'easy' | 'medium' | 'hard',
  text:       String,
  imageUrl:   String | null,
  marks:      Number,
  options:    [{ id: String, text: String, imageUrl: String | null,
                 isCorrect: Boolean }],
  correctAnswer: { text: String|null, numeric: Number|null,
                   tolerance: Number|null } | null,
  coding: {
    starterCode:  [{ language: String, code: String }],
    testCases:    [{ input: String, expectedOutput: String, isHidden: Boolean,
                     weight: Number }],
    timeLimitMs:  Number,
    memoryLimitMb: Number
  } | null,
  explanation: String | null,
  tags:       String[],
  createdByFacultyId: ObjectId,
  usageCount: Number,
  stats: { timesAnswered: Number, correctRate: Number, averageTimeSeconds: Number }
}
```

**Indexes:** `{ collegeId: 1, poolId: 1, difficulty: 1 }`;
`{ collegeId: 1, category: 1, topic: 1 }`; `{ collegeId: 1, tags: 1 }`;
`{ text: 'text' }`.

`options.isCorrect` is `select: false` and stripped by the student serializer. An exam
whose answers ship to the browser is not an exam — this is enforced in the serializer
layer, with a test that asserts the student-facing payload contains no `isCorrect` key.

### 4.10 `examattempts`

```ts
{
  collegeId:  ObjectId,
  examId:     ObjectId,
  studentId:  ObjectId,
  attemptNumber: Number,
  startedAt:  Date,
  submittedAt: Date | null,
  expiresAt:  Date,               // startedAt + duration; server-authoritative
  timeSpentSeconds: Number,
  servedQuestionIds: ObjectId[],  // the actual set for random pools
  answers: [{
    questionId:  ObjectId,
    selectedOptionIds: String[],
    textAnswer:  String | null,
    numericAnswer: Number | null,
    codeAnswer:  { language: String, source: String } | null,
    isCorrect:   Boolean | null,     // null until graded
    marksAwarded: Number | null,
    timeSpentSeconds: Number,
    flaggedForReview: Boolean
  }],
  result: {
    totalMarks:    Number,
    marksObtained: Number,
    percentage:    Number,
    isPassed:      Boolean,
    correctCount:  Number,
    wrongCount:    Number,
    unansweredCount: Number,
    negativeMarks: Number,
    rank:          Number | null,
    percentile:    Number | null
  } | null,
  proctoring: {
    tabSwitches:    Number,
    fullscreenExits: Number,
    violations: [{ type: String, at: Date, detail: String | null }],
    isFlagged:      Boolean
  },
  manualGrading: { required: Boolean, completedBy: ObjectId|null,
                   completedAt: Date|null },
  status: 'in_progress' | 'submitted' | 'auto_submitted' | 'grading'
          | 'graded' | 'abandoned' | 'invalidated'
}
```

**Indexes:** `{ collegeId: 1, examId: 1, studentId: 1, attemptNumber: 1 }` unique
partial; `{ collegeId: 1, studentId: 1, status: 1 }`;
`{ collegeId: 1, examId: 1, 'result.percentage': -1 }`; `{ expiresAt: 1, status: 1 }`.

**Invariants:** exam timing is server-authoritative — `expiresAt` is set at start and a
submission after it is either rejected or marked `auto_submitted`, never trusted from a
client clock. A cron sweeps expired `in_progress` attempts into `auto_submitted`.

### 4.11 `results`

Published, consolidated academic results. Distinct from raw attempts: attempts are
process, results are the record of truth that feeds transcripts and eligibility.

```ts
{
  collegeId:  ObjectId,
  studentId:  ObjectId,
  batchId:    ObjectId,
  semester:   Number,
  academicYear: String,        // '2025-2026'
  type:       'internal' | 'semester' | 'supplementary' | 'course',
  courseId:   ObjectId | null,
  subjects: [{
    code: String, name: String, credits: Number,
    internalMarks: Number|null, externalMarks: Number|null,
    totalMarks: Number, maxMarks: Number,
    grade: String, gradePoints: Number,
    isPassed: Boolean, attemptNumber: Number
  }],
  summary: {
    totalCredits: Number, earnedCredits: Number,
    gpa: Number|null, cgpa: Number|null,
    percentage: Number|null,
    backlogCount: Number,
    classification: String|null   // 'First Class with Distinction'
  },
  publishedBy: ObjectId | null,
  publishedAt: Date | null,
  status: 'draft' | 'published' | 'withheld' | 'revoked'
}
```

**Indexes:** `{ collegeId: 1, studentId: 1, semester: 1, type: 1 }`;
`{ collegeId: 1, batchId: 1, semester: 1, status: 1 }`;
`{ collegeId: 1, status: 1, publishedAt: -1 }`.

Publishing a result recomputes `students.academics.currentCgpa` and
`students.placement.isEligible` in the same transaction.

### 4.12 `certificates`

> **OPEN QUESTION** — issuing authority undecided (`00-overview.md` §8.5).

```ts
{
  collegeId:   ObjectId,
  studentId:   ObjectId,
  type:        'course_completion' | 'training' | 'achievement'
               | 'participation' | 'internship',
  title:       String,
  description: String | null,
  sourceType:  'course' | 'exam' | 'training_request' | 'manual',
  sourceId:    ObjectId | null,
  certificateNumber: String,      // globally unique, human-quotable
  verificationCode:  String,      // unguessable; powers the public verify page
  issuedBy:    ObjectId,
  issuedAt:    Date,
  validUntil:  Date | null,
  templateId:  ObjectId | null,
  fileUrl:     String | null,     // rendered PDF
  fileKey:     String | null,
  metadata: { grade: String|null, score: Number|null,
              durationHours: Number|null, skills: String[] },
  status: 'issued' | 'revoked' | 'expired',
  revokedReason: String | null
}
```

**Indexes:** `{ certificateNumber: 1 }` unique; `{ verificationCode: 1 }` unique;
`{ collegeId: 1, studentId: 1, status: 1 }`; `{ collegeId: 1, type: 1, issuedAt: -1 }`.

`verificationCode` is a 128-bit random value, not derived from the certificate number.
The public verification endpoint is unauthenticated by design and therefore rate-limited
and enumeration-resistant — a sequential code would let anyone scrape every certificate
the platform has ever issued.

---

## 5. Attendance

### 5.1 `attendancesessions`

The unit of marking. Modelling sessions separately from records is what makes "who has
not marked attendance today" answerable without scanning every record.

```ts
{
  collegeId:   ObjectId,
  batchId:     ObjectId,
  courseId:    ObjectId | null,
  liveClassId: ObjectId | null,
  date:        Date,              // UTC midnight of the college-local day
  periodNumber: Number | null,
  startTime:   String,            // 'HH:mm' college-local
  endTime:     String,
  type:        'lecture' | 'lab' | 'tutorial' | 'live_class' | 'training' | 'exam',
  topic:       String | null,
  markedByFacultyId: ObjectId | null,
  markedAt:    Date | null,
  source:      'manual' | 'live_class' | 'biometric' | 'import',
  isLocked:    Boolean,           // no edits after lock without an override permission
  lockedAt:    Date | null,
  stats: { totalStudents: Number, presentCount: Number, absentCount: Number,
           lateCount: Number, excusedCount: Number, percentage: Number },
  status: 'scheduled' | 'pending_marking' | 'marked' | 'locked' | 'cancelled'
}
```

**Indexes:** `{ collegeId: 1, batchId: 1, date: -1 }`;
`{ collegeId: 1, date: -1, status: 1 }`;
`{ collegeId: 1, batchId: 1, date: 1, periodNumber: 1 }` unique partial;
`{ collegeId: 1, markedByFacultyId: 1, date: -1 }`.

> **OPEN QUESTION** — `00-overview.md` §8.4: is biometric/RFID import in scope? The
> `source` field and an ingestion endpoint anticipate it, but no device registry is
> specified yet.

### 5.2 `attendancerecords`

One per student per session. This is the highest-volume collection in the product —
roughly *students × sessions per day × academic days*, easily millions per college per
year — so its index design is load-bearing.

```ts
{
  collegeId:  ObjectId,
  sessionId:  ObjectId,
  studentId:  ObjectId,
  batchId:    ObjectId,      // denormalised from session for direct querying
  date:       Date,          // denormalised from session
  status:     'present' | 'absent' | 'late' | 'excused' | 'on_duty',
  markedBy:   ObjectId | null,
  markedAt:   Date,
  remarks:    String | null,
  modifiedHistory: [{ from: String, to: String, by: ObjectId,
                      at: Date, reason: String }]
}
```

**Indexes**
```
{ collegeId: 1, sessionId: 1, studentId: 1 }   unique, partial { deletedAt: null }
{ collegeId: 1, studentId: 1, date: -1 }
{ collegeId: 1, batchId: 1, date: -1, status: 1 }
{ collegeId: 1, studentId: 1, status: 1, date: -1 }
```

`batchId` and `date` are denormalised from the session deliberately: the two commonest
queries are "this student's attendance over a range" and "this batch's attendance on a
date", and without denormalisation both require a lookup into sessions first, turning
every attendance screen into a two-stage aggregation.

`modifiedHistory` is retained because attendance is contested — students dispute it,
and an audit trail on the record itself is more useful than reconstructing from the
global activity log.

### 5.3 `attendancesummaries`

A materialised rollup, refreshed nightly and on-demand after marking. Reason: the
attendance-percentage figure appears on the student dashboard, the college dashboard,
every placement eligibility check, and every defaulter report. Recomputing it from
millions of records on each of those reads is not viable.

```ts
{
  collegeId:  ObjectId,
  studentId:  ObjectId,
  batchId:    ObjectId,
  courseId:   ObjectId | null,     // null = overall
  period:     'month' | 'semester' | 'overall',
  periodKey:  String,              // '2026-03' | 'sem-6' | 'overall'
  totalSessions: Number,
  presentCount: Number, absentCount: Number,
  lateCount: Number, excusedCount: Number, onDutyCount: Number,
  percentage: Number,
  isBelowThreshold: Boolean,
  computedAt: Date
}
```

**Indexes:** `{ collegeId: 1, studentId: 1, period: 1, periodKey: 1, courseId: 1 }`
unique partial; `{ collegeId: 1, batchId: 1, isBelowThreshold: 1 }`.

---

## 6. Placement

### 6.1 `companies`  *(global master, with per-college visibility)*

```ts
{
  name:        String,
  slug:        String,       // unique
  logoUrl:     String | null,
  website:     String | null,
  industry:    String,
  companyType: 'product' | 'service' | 'startup' | 'mnc' | 'psu' | 'government',
  sizeRange:   String | null,
  headquarters: String | null,
  description: String | null,
  contacts: [{ name: String, designation: String, email: String,
               phone: String, isPrimary: Boolean }],
  visibleToCollegeIds: ObjectId[],   // empty = visible to all
  isVerified:  Boolean,
  addedBy:     ObjectId,
  status: 'active' | 'blacklisted' | 'inactive',
  blacklistReason: String | null,
  stats: { totalJobsPosted: Number, totalHires: Number,
           averagePackage: Number | null }
}
```

**Indexes:** `{ slug: 1 }` unique partial; `{ status: 1, industry: 1 }`;
`{ visibleToCollegeIds: 1 }`; `{ name: 'text' }`.

Companies are global because the same employer recruits at many colleges, and
duplicating them per tenant would fragment hiring history. `visibleToCollegeIds`
controls exposure.

### 6.2 `jobpostings`

```ts
{
  collegeId:   ObjectId,           // the college this drive is for
  companyId:   ObjectId,
  title:       String,
  description: String,
  jobType:     'full_time' | 'internship' | 'internship_ppo' | 'part_time' | 'contract',
  workMode:    'onsite' | 'remote' | 'hybrid',
  locations:   String[],
  openings:    Number,

  compensation: {
    currency:      String,          // 'INR'
    ctcMin:        Number,          // minor units
    ctcMax:        Number,
    fixedComponent: Number | null,
    variableComponent: Number | null,
    stipendPerMonth: Number | null,
    bondMonths:    Number | null,
    bondAmount:    Number | null
  },

  eligibility: {
    departmentIds:   ObjectId[],    // empty = all
    graduationYears: Number[],
    minCgpa:         Number | null,
    maxActiveBacklogs: Number | null,
    maxTotalBacklogs:  Number | null,
    minTenthPercent:   Number | null,
    minTwelfthPercent: Number | null,
    maxYearGap:      Number | null,
    genderRestriction: 'any' | 'female_only' | null,
    requiredSkills:  String[],
    allowPlacedStudents: Boolean,
    customCriteria:  String | null
  },

  selectionRounds: [{
    order: Number, name: String,
    type: 'aptitude'|'technical_test'|'coding'|'group_discussion'
          |'technical_interview'|'hr_interview'|'managerial'|'other',
    mode: 'online'|'offline', durationMinutes: Number|null,
    description: String|null
  }],

  applicationOpenAt:  Date,
  applicationCloseAt: Date,
  driveDate:          Date | null,
  attachments: [{ url, fileName, fileKey, mimeType }],
  postedByOfficerId: ObjectId,
  status: 'draft' | 'published' | 'closed' | 'cancelled' | 'completed',
  stats: { totalEligible: Number, totalApplied: Number,
           totalShortlisted: Number, totalSelected: Number }
}
```

**Indexes:** `{ collegeId: 1, status: 1, applicationCloseAt: 1 }`;
`{ collegeId: 1, companyId: 1 }`; `{ collegeId: 1, driveDate: -1 }`;
`{ collegeId: 1, 'eligibility.departmentIds': 1, 'eligibility.graduationYears': 1 }`.

**Invariants:** `applicationCloseAt > applicationOpenAt`; `ctcMax >= ctcMin`;
`selectionRounds[].order` unique and contiguous from 1.

### 6.3 `applications`

```ts
{
  collegeId:   ObjectId,
  jobPostingId: ObjectId,
  studentId:   ObjectId,
  companyId:   ObjectId,          // denormalised for student-side listing
  appliedAt:   Date,
  resumeUrl:   String,            // snapshot at apply time
  resumeFileKey: String,
  coverLetter: String | null,
  answers:     [{ question: String, answer: String }],
  eligibilitySnapshot: {          // criteria as evaluated at apply time
    cgpa: Number|null, activeBacklogs: Number|null,
    attendancePercent: Number|null, evaluatedAt: Date
  },
  currentRound: Number,
  roundResults: [{
    order: Number, name: String,
    status: 'pending'|'scheduled'|'cleared'|'rejected'|'no_show'|'withdrawn',
    score: Number|null, feedback: String|null,
    evaluatedBy: ObjectId|null, evaluatedAt: Date|null
  }],
  status: 'applied' | 'under_review' | 'shortlisted' | 'in_process'
          | 'selected' | 'rejected' | 'withdrawn' | 'offer_declined',
  statusHistory: [{ from: String, to: String, by: ObjectId,
                    at: Date, note: String|null }],
  rejectionReason: String | null,
  withdrawnReason: String | null
}
```

**Indexes:** `{ collegeId: 1, jobPostingId: 1, studentId: 1 }` unique partial;
`{ collegeId: 1, studentId: 1, status: 1, appliedAt: -1 }`;
`{ collegeId: 1, jobPostingId: 1, status: 1 }`; `{ collegeId: 1, companyId: 1, status: 1 }`.

`resumeUrl` is a **snapshot**, not a reference to the student's current resume. When a
student updates their resume six months later, the record of what the employer actually
received must not change.

`eligibilitySnapshot` exists for the same reason: eligibility disputes are resolved
against the criteria as they stood at application time.

### 6.4 `interviews`

```ts
{
  collegeId:    ObjectId,
  applicationId: ObjectId,
  jobPostingId: ObjectId,
  studentId:    ObjectId,
  companyId:    ObjectId,
  roundOrder:   Number,
  roundName:    String,
  type:         'aptitude'|'technical_test'|'coding'|'group_discussion'
                |'technical_interview'|'hr_interview'|'managerial'|'other',
  mode:         'online' | 'offline' | 'telephonic',
  scheduledAt:  Date,
  durationMinutes: Number,
  venue:        String | null,
  meetingLink:  String | null,
  interviewers: [{ name: String, designation: String, email: String|null }],
  panelNumber:  String | null,
  instructions: String | null,
  result: {
    status: 'pending'|'cleared'|'rejected'|'on_hold'|'no_show',
    score: Number|null, maxScore: Number|null,
    feedback: String|null, strengths: String[], improvements: String[],
    recordedBy: ObjectId|null, recordedAt: Date|null
  },
  studentConfirmedAt: Date | null,
  rescheduleHistory: [{ from: Date, to: Date, reason: String,
                        by: ObjectId, at: Date }],
  status: 'scheduled' | 'confirmed' | 'in_progress' | 'completed'
          | 'cancelled' | 'rescheduled' | 'no_show'
}
```

**Indexes:** `{ collegeId: 1, studentId: 1, scheduledAt: -1 }`;
`{ collegeId: 1, applicationId: 1, roundOrder: 1 }`;
`{ collegeId: 1, jobPostingId: 1, scheduledAt: 1 }`;
`{ collegeId: 1, scheduledAt: 1, status: 1 }`.

### 6.5 `placements`

The final record of a confirmed offer. Separate from `applications` because it is the
reporting artefact — placement statistics, offer letters, and joining status are
queried far more than the application funnel that produced them.

```ts
{
  collegeId:    ObjectId,
  studentId:    ObjectId,
  applicationId: ObjectId,
  jobPostingId: ObjectId,
  companyId:    ObjectId,
  offerDate:    Date,
  joiningDate:  Date | null,
  designation:  String,
  location:     String,
  jobType:      'full_time' | 'internship' | 'internship_ppo',
  package: {
    currency: String, ctc: Number,
    fixed: Number|null, variable: Number|null,
    stipendPerMonth: Number|null, bondMonths: Number|null
  },
  offerLetter: { url: String|null, fileKey: String|null,
                 uploadedAt: Date|null } | null,
  isPrimaryOffer: Boolean,        // the one counted in headline statistics
  academicYear: String,
  status: 'offered' | 'accepted' | 'declined' | 'joined'
          | 'offer_revoked' | 'not_joined',
  statusHistory: [{ from: String, to: String, by: ObjectId, at: Date, note: String|null }],
  verifiedBy:  ObjectId | null,
  verifiedAt:  Date | null
}
```

**Indexes:** `{ collegeId: 1, studentId: 1, status: 1 }`;
`{ collegeId: 1, academicYear: 1, status: 1 }`;
`{ collegeId: 1, companyId: 1, offerDate: -1 }`;
`{ collegeId: 1, 'package.ctc': -1 }`.

**Invariant:** at most one `isPrimaryOffer: true` per student per academic year. A
student may hold several offers; placement percentage counts students, not offers, and
conflating the two is the single most common way these reports get inflated.

### 6.6 `trainingrequests`

A college asking the platform (or its own trainers) to run a training programme.

```ts
{
  collegeId:    ObjectId,
  requestNumber: String,          // human reference, unique
  title:        String,
  description:  String,
  trainingType: 'technical' | 'aptitude' | 'soft_skills' | 'placement_prep'
                | 'certification' | 'workshop',
  departmentIds: ObjectId[],
  batchIds:     ObjectId[],
  expectedParticipants: Number,
  preferredStartDate: Date,
  preferredEndDate:   Date,
  durationHours: Number,
  mode:         'online' | 'offline' | 'hybrid',
  topics:       String[],
  objectives:   String | null,
  budget:       { currency: String, amount: Number } | null,
  attachments:  [{ url, fileName, fileKey, mimeType }],
  requestedBy:  ObjectId,
  priority:     'low' | 'medium' | 'high' | 'urgent',
  approval: {
    status: 'pending' | 'approved' | 'rejected' | 'more_info_required',
    reviewedBy: ObjectId|null, reviewedAt: Date|null,
    comments: String|null
  },
  assignment: {
    trainerIds: ObjectId[],
    scheduledStart: Date|null, scheduledEnd: Date|null,
    courseId: ObjectId|null       // course created to deliver it
  } | null,
  completion: {
    completedAt: Date|null, actualParticipants: Number|null,
    feedbackScore: Number|null, report: String|null
  } | null,
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected'
          | 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
}
```

**Indexes:** `{ requestNumber: 1 }` unique partial;
`{ collegeId: 1, status: 1, createdAt: -1 }`;
`{ collegeId: 1, 'approval.status': 1 }`; `{ collegeId: 1, priority: 1, status: 1 }`.

---

## 7. Platform services

### 7.1 `notifications`

```ts
{
  collegeId:  ObjectId | null,
  userId:     ObjectId,           // one document per recipient
  type:       String,             // 'assignment.due_soon' — namespaced key
  category:   'academic' | 'placement' | 'attendance' | 'system'
              | 'announcement' | 'support',
  priority:   'low' | 'normal' | 'high' | 'urgent',
  title:      String,
  message:    String,
  actionUrl:  String | null,
  actionLabel: String | null,
  entity:     { type: String, id: ObjectId } | null,
  channels:   { inApp: Boolean, email: Boolean, push: Boolean },
  deliveryStatus: {
    inApp: 'pending'|'delivered'|'failed',
    email: 'pending'|'sent'|'delivered'|'failed'|'skipped',
    push:  'pending'|'sent'|'failed'|'skipped'
  },
  readAt:     Date | null,
  archivedAt: Date | null,
  expiresAt:  Date | null,        // TTL
  createdByUserId: ObjectId | null
}
```

**Indexes:** `{ userId: 1, readAt: 1, createdAt: -1 }`;
`{ userId: 1, category: 1, createdAt: -1 }`;
`{ collegeId: 1, type: 1, createdAt: -1 }`; `{ expiresAt: 1 }` TTL 0.

One document per recipient — a fan-out write. A broadcast to 5,000 students is 5,000
documents, written by a background job in batches rather than in the request. The
alternative (one document plus a per-user read-state collection) saves storage but makes
the commonest query — "my unread notifications, newest first" — a join. Fan-out is the
right trade for a read-heavy feed.

### 7.2 `announcements`

Distinct from notifications: an announcement is authored content with an audience, which
*generates* notifications.

```ts
{
  collegeId:  ObjectId,
  title:      String,
  content:    String,             // rich text
  audience: {
    type: 'all' | 'role' | 'department' | 'batch' | 'custom',
    roleKeys: String[], departmentIds: ObjectId[],
    batchIds: ObjectId[], userIds: ObjectId[]
  },
  attachments: [{ url, fileName, fileKey, mimeType }],
  priority:   'low' | 'normal' | 'high' | 'urgent',
  isPinned:   Boolean,
  publishAt:  Date,
  expiresAt:  Date | null,
  publishedBy: ObjectId,
  stats: { totalRecipients: Number, readCount: Number },
  status: 'draft' | 'scheduled' | 'published' | 'archived'
}
```

**Indexes:** `{ collegeId: 1, status: 1, publishAt: -1 }`;
`{ collegeId: 1, isPinned: -1, publishAt: -1 }`.

### 7.3 `supporttickets`

```ts
{
  collegeId:   ObjectId | null,
  ticketNumber: String,           // unique, human-quotable
  raisedBy:    ObjectId,
  raisedByRole: String,
  category:    'technical' | 'academic' | 'placement' | 'account'
               | 'billing' | 'feature_request' | 'other',
  subject:     String,
  description: String,
  priority:    'low' | 'medium' | 'high' | 'urgent',
  attachments: [{ url, fileName, fileKey, mimeType }],
  assignedTo:  ObjectId | null,
  assignedAt:  Date | null,
  messages: [{
    _id: ObjectId, authorId: ObjectId, authorRole: String,
    body: String, attachments: [{ url, fileName, fileKey, mimeType }],
    isInternal: Boolean,          // staff-only note, never shown to the raiser
    createdAt: Date
  }],
  resolution: { summary: String|null, resolvedBy: ObjectId|null,
                resolvedAt: Date|null } | null,
  satisfaction: { rating: Number|null, comment: String|null,
                  ratedAt: Date|null } | null,
  slaDueAt:    Date | null,
  firstResponseAt: Date | null,
  reopenCount: Number,
  status: 'open' | 'in_progress' | 'awaiting_response' | 'resolved'
          | 'closed' | 'reopened'
}
```

**Indexes:** `{ ticketNumber: 1 }` unique partial;
`{ collegeId: 1, status: 1, priority: -1, createdAt: -1 }`;
`{ raisedBy: 1, status: 1 }`; `{ assignedTo: 1, status: 1 }`.

Messages are embedded because a ticket thread is bounded and always read whole. If
threads routinely exceeded a few hundred messages this would need to change; they do
not.

`isInternal` messages are stripped in the serializer for the ticket raiser. This is a
serializer-level guarantee with a test, not a UI convention — a staff note leaking to the
user it is about is a serious failure.

### 7.4 `activitylogs`  *(the audit trail)*

```ts
{
  collegeId:  ObjectId | null,
  userId:     ObjectId | null,    // null for system/cron actions
  userEmail:  String | null,      // denormalised — survives user deletion
  userRole:   String | null,
  action:     String,             // 'student.create', 'auth.login_failed'
  category:   'auth'|'data'|'admin'|'security'|'system',
  severity:   'info' | 'warning' | 'critical',
  entity:     { type: String, id: ObjectId|null, label: String|null } | null,
  changes:    [{ field: String, from: Mixed, to: Mixed }] | null,
  metadata:   Mixed | null,
  ip:         String | null,
  userAgent:  String | null,
  requestId:  String | null,
  outcome:    'success' | 'failure',
  errorMessage: String | null
}
```

**Indexes:** `{ collegeId: 1, createdAt: -1 }`;
`{ collegeId: 1, userId: 1, createdAt: -1 }`;
`{ collegeId: 1, action: 1, createdAt: -1 }`;
`{ collegeId: 1, 'entity.type': 1, 'entity.id': 1, createdAt: -1 }`;
`{ collegeId: 1, severity: 1, createdAt: -1 }`.

**Audit logs are append-only and immutable.** No update or delete route exists, the
model blocks `updateOne`/`deleteOne` via pre-hooks, and retention is handled by archival
to cold storage rather than mutation. `changes` redacts any field on a
`SENSITIVE_FIELDS` list (password hashes, tokens, OTP codes) — an audit log that records
the old and new value of a password is a vulnerability, not a control.

`userEmail` and `userRole` are denormalised so a log entry remains meaningful after the
user record is anonymised or removed.

### 7.5 `systemsettings`  *(global)*

Key-value with typing and scope, so operational toggles do not require a deploy.

```ts
{
  key:        String,             // 'placement.eligibility.defaultMinCgpa'
  value:      Mixed,
  valueType:  'string'|'number'|'boolean'|'json'|'array',
  scope:      'global' | 'college',
  collegeId:  ObjectId | null,    // set when scope is 'college'
  category:   String,
  label:      String,
  description: String,
  isPublic:   Boolean,            // safe to expose to the client
  isEditable: Boolean,
  validation: { min: Number|null, max: Number|null,
                options: Mixed[]|null, pattern: String|null } | null
}
```

**Indexes:** `{ key: 1, scope: 1, collegeId: 1 }` unique partial;
`{ scope: 1, category: 1 }`; `{ isPublic: 1 }`.

Resolution order: college-scoped value → global value → code default. Values are cached
in Redis with a short TTL and invalidated on write.

### 7.6 `files`

A registry of every upload, so orphan cleanup and quota accounting are possible.

```ts
{
  collegeId:   ObjectId | null,
  uploadedBy:  ObjectId,
  driver:      'local' | 's3' | 'cloudinary',
  fileKey:     String,            // driver-specific key/public_id
  url:         String,
  fileName:    String,            // original
  mimeType:    String,
  sizeBytes:   Number,
  purpose:     'avatar'|'college_logo'|'resume'|'certificate'|'assignment'
               |'submission'|'learning_material'|'ticket_attachment'
               |'offer_letter'|'import'|'other',
  entity:      { type: String, id: ObjectId } | null,
  isPublic:    Boolean,
  virusScanStatus: 'pending' | 'clean' | 'infected' | 'skipped',
  checksum:    String | null,     // SHA-256, for dedupe and integrity
  status:      'active' | 'orphaned' | 'deleted'
}
```

**Indexes:** `{ collegeId: 1, purpose: 1, createdAt: -1 }`;
`{ 'entity.type': 1, 'entity.id': 1 }`; `{ fileKey: 1 }` unique partial;
`{ status: 1, createdAt: 1 }`; `{ checksum: 1 }`.

Files uploaded but never attached to an entity are marked `orphaned` by a nightly job
and purged after 7 days. Without this registry, storage costs grow monotonically with
every abandoned form.

### 7.7 `idempotencykeys`  *(global)*

```ts
{
  key: String, userId: ObjectId, endpoint: String,
  requestHash: String, responseStatus: Number, responseBody: Mixed,
  expiresAt: Date        // TTL 24h
}
```

**Indexes:** `{ key: 1, userId: 1 }` unique; `{ expiresAt: 1 }` TTL 0.

---

## 8. Collection summary

| # | Collection | Tenant-scoped | Notes |
| --- | --- | --- | --- |
| 1 | `users` | no (has `collegeId`) | Auth identity |
| 2 | `roles` | no | Seeded + custom |
| 3 | `permissions` | no | Seeded reference |
| 4 | `sessions` | no | TTL |
| 5 | `otps` | no | TTL |
| 6 | `colleges` | — | Tenant root |
| 7 | `departments` | yes | |
| 8 | `batches` | yes | |
| 9 | `students` | yes | |
| 10 | `faculty` | yes | Includes trainers via `type` |
| 11 | `courses` | yes | |
| 12 | `coursemodules` | yes | |
| 13 | `learningmaterials` | yes | |
| 14 | `enrollments` | yes | **Added** — not in brief, required |
| 15 | `liveclasses` | yes | |
| 16 | `assignments` | yes | |
| 17 | `assignmentsubmissions` | yes | **Added** — required |
| 18 | `exams` | yes | Practice + assessment + examination |
| 19 | `questions` | yes | **Added** — required |
| 20 | `examattempts` | yes | **Added** — required |
| 21 | `results` | yes | |
| 22 | `certificates` | yes | |
| 23 | `attendancesessions` | yes | **Split** from "Attendance" |
| 24 | `attendancerecords` | yes | Highest volume |
| 25 | `attendancesummaries` | yes | **Added** — materialised rollup |
| 26 | `companies` | no | Global master |
| 27 | `jobpostings` | yes | |
| 28 | `applications` | yes | |
| 29 | `interviews` | yes | |
| 30 | `placements` | yes | |
| 31 | `trainingrequests` | yes | |
| 32 | `notifications` | yes | Fan-out |
| 33 | `announcements` | yes | **Added** — required |
| 34 | `supporttickets` | yes | |
| 35 | `activitylogs` | yes | Append-only |
| 36 | `systemsettings` | no | Global + college scope |
| 37 | `files` | yes | **Added** — upload registry |
| 38 | `idempotencykeys` | no | TTL |

The brief listed 28 collections; this is 38. The additions are not embellishment —
each one is a place the brief's list had no home for required data (submissions,
attempts, enrolments) or a split forced by query patterns (attendance sessions vs
records vs summaries).

---

## 9. Transactions

MongoDB multi-document transactions (Atlas replica set required) are used where a
partial write would leave the system inconsistent:

| Operation | Spans |
| --- | --- |
| College registration approval | `colleges` + `users` + `activitylogs` |
| Student creation | `users` + `students` + `colleges.stats` + `batches.stats` |
| Bulk student import | Batched — 100 students per transaction |
| Attendance marking | `attendancerecords` (many) + `attendancesessions.stats` + summary invalidation |
| Result publication | `results` + `students.academics` + `students.placement.isEligible` |
| Placement confirmation | `placements` + `applications.status` + `students.placement` + `jobpostings.stats` |
| Exam submission | `examattempts` + `exams.stats` + `questions.stats` |
| Certificate issuance | `certificates` + `files` + `notifications` |

Everything else is a single-document write, which Mongo makes atomic on its own.

---

## 10. Seeding

Two separate scripts, and the separation is the point (`00-overview.md` §6):

**`npm run seed`** — reference data, safe and idempotent in every environment:
permissions, system roles, default system settings, and the country/state lists.

**`npm run seed:demo`** — a demo college with departments, batches, faculty, students,
courses, and historical attendance/placement data for development and screenshots.
Guarded by `NODE_ENV !== 'production'` **and** an explicit `--confirm` flag. This never
runs in production, and the application never reads from it.
