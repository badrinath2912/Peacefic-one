# Integrations: Storage, Email, PDF, Jobs, AI seams

Depends on: `03-data-model.md` (`files`, `notifications`), `01-architecture.md`.

Every external dependency in this document sits behind an interface defined in
`server/src/interfaces/`. Nothing in a service imports a vendor SDK directly. This is
what makes the local-vs-production storage split, the SMTP-vs-SendGrid split, and the
undecided meeting provider tractable rather than a rewrite each time.

---

## 1. File storage

### Interface

```ts
interface StorageDriver {
  upload(file: UploadInput, options: UploadOptions): Promise<StoredFile>;
  delete(fileKey: string): Promise<void>;
  getSignedUrl(fileKey: string, expiresInSeconds: number): Promise<string>;
  getPublicUrl(fileKey: string): string;
  exists(fileKey: string): Promise<boolean>;
}
```

Implementations: `LocalStorageDriver` (development), `S3StorageDriver` (documents,
video, resumes), `CloudinaryStorageDriver` (images, with transformations). Selected by
`STORAGE_DRIVER`, with a per-purpose override so images can go to Cloudinary while
documents go to S3 in the same deployment.

### Upload pipeline

Every upload, regardless of driver:

1. **Multer** to memory, with a size limit per purpose.
2. **MIME sniffing from magic bytes** (`file-type`), not the client-supplied
   `Content-Type` and not the extension. A `.pdf` extension on a file whose bytes say
   `application/x-dosexec` is rejected. Trusting the declared type is how executables
   end up served from a "documents" bucket.
3. Extension/MIME allowlist per purpose — never a denylist.
4. Images: strip EXIF (which carries GPS), re-encode with `sharp`, generate the sizes
   needed. Re-encoding also neutralises polyglot files.
5. Virus scan (ClamAV) where enabled; status recorded on the `files` document. Files
   pending scan are not served.
6. Randomised object key — never the user-supplied filename. The original name is stored
   as metadata for downloads.
7. Register in the `files` collection (`03-data-model.md` §7.6) with checksum and
   purpose.

### Limits

| Purpose | Max size | Types |
| --- | --- | --- |
| Avatar / logo | 2 MB | jpg, png, webp |
| Resume | 5 MB | pdf, doc, docx |
| Assignment attachment | 25 MB | pdf, doc, docx, zip, images |
| Submission | 50 MB | per assignment configuration |
| Learning material (document) | 100 MB | pdf, ppt, pptx, doc, docx |
| Learning material (video) | 2 GB | mp4, webm — multipart/direct-to-S3 |
| Import file | 10 MB | csv, xlsx |
| Ticket attachment | 10 MB | images, pdf, doc |
| Offer letter | 10 MB | pdf |

### Access control

Files are **private by default**. Public: college logos, avatars, published course
thumbnails, and rendered certificates (the last because certificate verification is
deliberately public, `07-student-portal.md` §10).

Everything else is served through a signed URL with a 15-minute expiry, issued only
after the same permission and scope checks the REST layer applies. A resume URL that
works for anyone holding the link is a data breach waiting for someone to paste it into
a chat.

Large video uploads use presigned direct-to-S3 PUTs so a 2GB file does not stream
through the API process.

Orphan cleanup: files with no `entity` after 24 hours are marked `orphaned` and purged
after 7 days.

---

## 2. Email

### Interface

```ts
interface EmailProvider {
  send(message: EmailMessage): Promise<EmailResult>;
  sendBulk(messages: EmailMessage[]): Promise<EmailResult[]>;
}
```

`SmtpEmailProvider` (Nodemailer + Gmail SMTP) for development; `SendGridEmailProvider`
for production. Selected by `EMAIL_PROVIDER`.

**All email sends are enqueued, never awaited in a request.** An SMTP timeout must not
turn into a failed registration. The job retries with exponential backoff (5 attempts)
and records terminal failures.

### Templates

React Email components in `server/src/emails/templates/`, rendered to HTML with an
automatic plain-text alternative. React Email is chosen over Handlebars because the
templates are then type-checked against their props — a renamed field breaks the build
instead of rendering "Hello undefined".

| Template | Trigger |
| --- | --- |
| `welcome` | Account activated |
| `verify-email` | Registration OTP |
| `college-approved` / `college-rejected` | Platform admin decision |
| `student-invite` | Admin creates a student |
| `password-reset` | Reset requested |
| `password-changed` | Password changed — security notice |
| `new-device-login` | Login from an unrecognised device |
| `token-reuse-alert` | Refresh reuse detected (`04-auth-rbac.md` §1) |
| `assignment-due` | 48h and 6h reminders |
| `assignment-graded` | Grade published |
| `result-published` | Semester result published |
| `attendance-warning` | Below threshold |
| `certificate-issued` | Certificate issued |
| `job-posted` | New eligible job |
| `application-status` | Shortlisted / rejected / selected |
| `interview-scheduled` / `interview-reminder` | Scheduling and 24h/1h reminders |
| `placement-confirmed` | Offer recorded |
| `training-request-status` | Approved / rejected / scheduled |
| `ticket-created` / `ticket-replied` / `ticket-resolved` | Support lifecycle |
| `report-ready` | Async export finished |
| `weekly-digest` | Opt-in summary |

### Rules

- Every template honours the recipient's `preferences.emailNotifications`, except
  security-critical mail (password changed, token reuse, new device), which always sends.
  Letting a user disable "your password was changed" removes the one signal that reveals
  an account takeover.
- All email includes an unsubscribe link for non-transactional categories.
- Bulk sends are chunked and throttled to the provider's limits.
- Every send is logged with provider message id for delivery tracing.
- In development, `EMAIL_PROVIDER=console` writes to disk instead of sending — no real
  mail is ever sent from a dev machine.

---

## 3. PDF generation

Server-side with **Puppeteer** rendering React-Email-style HTML templates, running in a
pooled headless browser (max 3 instances) so PDF generation cannot exhaust memory.

Used for: certificates, transcripts, resumes, reports, offer letters, and ID cards.

All PDF generation is a background job. Puppeteer rendering takes seconds; holding an
HTTP request open for it is the wrong shape.

Client-side `react-pdf` is used only for **previewing** existing PDFs in the browser,
never for generating documents of record — a client-generated certificate is one
DevTools session away from saying whatever the student wants.

---

## 4. Background jobs

**BullMQ** on Redis. Queues, each with its own concurrency:

| Queue | Jobs |
| --- | --- |
| `email` | Single and bulk sends |
| `notification` | Fan-out writes (`03-data-model.md` §7.1) |
| `import` | Student/faculty CSV imports |
| `export` | CSV/XLSX/PDF exports |
| `pdf` | Certificates, transcripts, reports |
| `analytics` | Heavy aggregations, summary recomputation |
| `media` | Image processing, video transcode triggers |
| `maintenance` | Cleanup, reconciliation, archival |

Every job: idempotent (safe to retry), progress-reporting over sockets (§8 of
`08-realtime.md`), exponential backoff with a max attempt count, and a dead-letter queue
with an admin view for failures.

### Scheduled jobs

| Schedule | Job |
| --- | --- |
| Every 5 min | Sweep expired `in_progress` exam attempts → `auto_submitted` |
| Every 15 min | Live class start reminders |
| Hourly | Interview reminders (1h), application deadline reminders |
| Daily 00:30 | Recompute `attendancesummaries` |
| Daily 01:00 | Attendance threshold warnings |
| Daily 02:00 | Assignment due reminders (48h/6h) |
| Daily 03:00 | Orphan file cleanup |
| Daily 04:00 | Reconcile denormalised `stats` counters, log drift |
| Daily 05:00 | Auto-lock attendance sessions past the lock window |
| Weekly Mon 06:00 | Weekly digest emails |
| Monthly 1st | Archive audit logs older than the retention window |
| Annually | Propose batch promotion (never executes — `06-college-portal.md` §6) |

The reconciliation job matters more than it looks: denormalised counters
(`colleges.stats`, `batches.stats`, `courses.stats`) drift when a transaction is
interrupted, and silent drift in the numbers on the dashboard erodes trust in the whole
product. It logs a `warning` audit entry whenever it corrects something, so drift is
visible rather than quietly patched.

---

## 5. AI integration seams

No AI provider is called in this scope (`00-overview.md` §7). What ships is the
boundary, so adding a provider later is an implementation, not a refactor.

```ts
interface AIProvider {
  complete(prompt: PromptInput, options: CompletionOptions): Promise<CompletionResult>;
  embed(text: string | string[]): Promise<number[][]>;
  stream(prompt: PromptInput, options: CompletionOptions): AsyncIterable<StreamChunk>;
}
```

Planned consumers, each as a service with a defined input/output contract behind a
feature flag:

| Feature | Seam |
| --- | --- |
| Resume parsing | `ResumeParsingService.parse(file) → StructuredResume` |
| Resume improvement | `ResumeAssistService.suggest(resume) → Suggestion[]` |
| Skill assessment | `SkillAssessmentService.evaluate(attempt) → SkillProfile` |
| Mock interviews | `MockInterviewService.conduct(session) → Transcript + Feedback` |
| Chatbot | `ChatbotService.respond(query, context) → Answer` |
| Placement prediction | `PlacementPredictionService.predict(studentId) → Probability` |
| Course recommendation | `RecommendationService.recommend(studentId) → Course[]` |
| Analytics narration | `InsightService.narrate(dataset) → string` |

Constraints that are set now, because retrofitting them is much harder:

- **All AI calls are background jobs**, never inline in a request. Latency is
  unpredictable and a user-facing timeout on a synchronous model call is a bad
  experience with no good fallback.
- **Every AI output is advisory.** No AI output writes to an academic record, a
  placement decision, or an attendance figure without a human confirming it. This is
  both an accuracy and an accountability position.
- **Student data sent to a provider is minimised and logged.** What was sent, for whom,
  and why, in `activitylogs`. Colleges will ask.
- **Per-college opt-in.** AI features are off by default and enabled in college settings.
- Cost controls: token budget per college per month, enforced before dispatch.

When a provider is chosen, model selection and pricing should be checked against current
documentation rather than assumed — this document deliberately does not name a model.

---

## 6. Meeting provider (live classes)

> **OPEN QUESTION** — provider undecided (`00-overview.md` §8.2).

```ts
interface MeetingProvider {
  createMeeting(input: CreateMeetingInput): Promise<Meeting>;
  updateMeeting(meetingId: string, input: UpdateMeetingInput): Promise<Meeting>;
  deleteMeeting(meetingId: string): Promise<void>;
  getRecording(meetingId: string): Promise<Recording | null>;
  getParticipants(meetingId: string): Promise<Participant[]>;
}
```

`getParticipants` is what links a meeting to attendance (`03-data-model.md` §4.5), and
it is the capability most likely to differ between providers — Jitsi without a
deployment of its own analytics component cannot supply it, which would force
join-click-based attendance instead. This is the main thing the provider decision
affects.

---

## 7. Environment variables

Validated at boot by Zod (`01-architecture.md` §8); the process refuses to start if any
required variable is missing.

```
# Core
NODE_ENV · PORT · API_BASE_URL · CLIENT_URL · LOG_LEVEL

# Database
MONGODB_URI · MONGODB_DB_NAME

# Redis
REDIS_URL

# Auth
JWT_ACCESS_SECRET · JWT_REFRESH_SECRET · JWT_INVITE_SECRET
JWT_ACCESS_EXPIRY · JWT_REFRESH_EXPIRY · BCRYPT_ROUNDS
COOKIE_DOMAIN · COOKIE_SECURE · SESSION_MAX_DEVICES

# OAuth
GOOGLE_CLIENT_ID · GOOGLE_CLIENT_SECRET · GOOGLE_CALLBACK_URL
MICROSOFT_CLIENT_ID · MICROSOFT_CLIENT_SECRET · MICROSOFT_CALLBACK_URL

# Storage
STORAGE_DRIVER · LOCAL_UPLOAD_DIR
AWS_REGION · AWS_S3_BUCKET · AWS_ACCESS_KEY_ID · AWS_SECRET_ACCESS_KEY
CLOUDINARY_CLOUD_NAME · CLOUDINARY_API_KEY · CLOUDINARY_API_SECRET

# Email
EMAIL_PROVIDER · EMAIL_FROM · EMAIL_FROM_NAME
SMTP_HOST · SMTP_PORT · SMTP_USER · SMTP_PASSWORD
SENDGRID_API_KEY

# Meeting
MEETING_PROVIDER · (provider credentials)

# Security
CORS_ORIGINS · RATE_LIMIT_WINDOW_MS · RATE_LIMIT_MAX
ENABLE_API_DOCS · TRUST_PROXY

# AI (future)
AI_PROVIDER · AI_API_KEY · AI_MONTHLY_TOKEN_BUDGET
```

Secrets are never committed. `.env.example` lists every key with a placeholder and a
comment, and CI fails if a variable used in `env.ts` is missing from `.env.example` —
which is the mechanism that stops the example file from rotting.
