# Architecture

Depends on: `00-overview.md`.

---

## 1. System shape

```
┌────────────────────────────────────────────────────────────────┐
│  Browser                                                        │
│  Next.js 15 App Router (React 19, TypeScript)                   │
│   ├─ (auth)      public routes: login, register, verify, reset  │
│   ├─ (college)   college portal, guarded by role                │
│   ├─ (student)   student portal, guarded by role                │
│   └─ (platform)  minimal platform-admin surface                 │
└───────────────┬─────────────────────────────┬──────────────────┘
                │ HTTPS  REST /api/v1         │ WSS  Socket.IO
                ▼                             ▼
┌────────────────────────────────────────────────────────────────┐
│  Express API (Node LTS, TypeScript)                             │
│   routes → middleware → controllers → services → repositories   │
│                                            │                    │
│   sockets/   jobs/   cron/   emails/       │                    │
└────────────────────────────────────────────┼───────────────────┘
                                             ▼
                              ┌──────────────────────────┐
                              │ MongoDB Atlas (Mongoose) │
                              └──────────────────────────┘
   side services: Cloudinary / S3 · SendGrid / SMTP · Redis (queues, socket adapter)
```

**Two deployables**: the Next.js client and the Express API. They are separate
processes, separately deployed, and communicate only over HTTP and WebSocket.

### Why not Next.js API routes / server actions for the backend?

The brief specifies an Express backend with MVC, repository, and service layers, and
that is the right call here for reasons worth recording: the API must also serve
non-browser clients (a future mobile app, device attendance ingestion, webhook
receivers from the meeting provider), it needs long-lived Socket.IO connections and
background job workers that a serverless-first framework handles badly, and Swagger
documentation of a real REST surface is a stated deliverable.

**Consequence:** the Next.js app is a client. It does not talk to MongoDB. It has no
Mongoose dependency. Server Components fetch from the Express API over HTTP with the
caller's credentials forwarded. This rule has no exceptions.

---

## 2. Repository layout

```
Peacefic-one/
├── client/                  Next.js 15 application
├── server/                  Express API
├── docs/
│   ├── spec/                these documents
│   ├── adr/                 architecture decision records
│   └── api/                 generated OpenAPI artefacts, Postman collection
├── docker/                  Dockerfiles, nginx conf, compose files
├── scripts/                 deploy, backup, seed, migrate helpers
├── .github/workflows/       CI/CD
├── package.json             npm workspaces root
└── README.md
```

Root uses **npm workspaces** (`client`, `server`, and a `shared` package). One
`npm install` at the root; one lockfile; a single `npm run dev` starts both.

### The `shared` workspace

`shared/` holds what both sides must agree on and nothing else:

- Zod schemas for request bodies — the server validates with them, the client's forms
  resolve with them. One definition, no drift.
- TypeScript types derived from those schemas (`z.infer`).
- Enums and constants: role keys, permission strings, status enums, socket event names.

`shared` must not import from `client` or `server`, and must not import Mongoose,
Express, or React. It is pure TypeScript. This is enforced with an ESLint
`no-restricted-imports` rule.

---

## 3. Backend layering

```
HTTP request
   │
   ├─ 1. Route          server/src/routes/v1/*.routes.ts
   │      declares path, attaches middleware chain, points at a controller method
   │
   ├─ 2. Middleware     authenticate → authorize(permission) → validate(schema)
   │                    → rateLimit → tenantContext
   │
   ├─ 3. Controller     server/src/controllers/*.controller.ts
   │      HTTP only: read req, call one service method, shape the response
   │      NO business logic. NO Mongoose. Typically < 15 lines per handler.
   │
   ├─ 4. Service        server/src/services/*.service.ts
   │      All business logic, orchestration, transactions, cross-entity rules,
   │      event emission, email/notification dispatch. Framework-agnostic:
   │      takes plain arguments, returns plain data, throws domain errors.
   │      Knows nothing about req/res.
   │
   ├─ 5. Repository     server/src/repositories/*.repository.ts
   │      The ONLY place Mongoose models are touched. Encapsulates queries,
   │      aggregation pipelines, tenant filtering, soft-delete filtering.
   │
   └─ 6. Model          server/src/models/*.model.ts
          Mongoose schema, indexes, virtuals, schema-level validation, hooks
```

**The rules that make this worth doing:**

- A controller that contains an `if` about business state is misplaced logic.
- A service that references `req`, `res`, `next`, or an HTTP status code is misplaced.
- A `Model.find()` call outside `repositories/` is a bug. ESLint enforces this with a
  path-scoped `no-restricted-imports` on `../models`.
- Services depend on repository **interfaces** (`server/src/interfaces/`), not
  concrete classes, so they can be unit-tested with an in-memory fake.

### Dependency injection

Constructor injection with a small manual container (`server/src/container.ts`). No
DI framework — the graph is shallow enough that a hand-written composition root is
clearer than decorators and metadata reflection.

```ts
// server/src/container.ts  (shape, not final content)
const studentRepository = new StudentRepository(StudentModel);
const studentService = new StudentService(studentRepository, auditService, eventBus);
const studentController = new StudentController(studentService);
```

---

## 4. Tenant isolation

Isolation is a property of the base repository, not of caller discipline.

`AsyncLocalStorage` carries a per-request `RequestContext` (`userId`, `collegeId`,
`roleKey`, `permissions`, `requestId`). The `tenantContext` middleware populates it
after authentication.

`BaseRepository<T>` reads `collegeId` from that context and merges it into every
filter for tenant-scoped models, alongside the soft-delete predicate:

```ts
protected scope(filter: FilterQuery<T>): FilterQuery<T> {
  const base: FilterQuery<T> = { deletedAt: null, ...filter };
  if (!this.isTenantScoped) return base;
  const { collegeId } = requestContext.get();
  if (!collegeId) throw new InternalError('Tenant context missing on a scoped query');
  return { ...base, collegeId };
}
```

Escaping the tenant scope (needed by `platform_admin` and by cron jobs) requires an
explicit, greppable call: `repo.withoutTenantScope(reason)`. Every such call site is
reviewed and logged.

**Test requirement:** every tenant-scoped repository has an integration test that
creates documents for two colleges and asserts college A's queries never return
college B's documents. This is non-negotiable and blocks merge.

---

## 5. Error handling

A single `AppError` hierarchy in `server/src/errors/`:

| Class | HTTP | When |
| --- | --- | --- |
| `ValidationError` | 400 | Zod failure, malformed input |
| `AuthenticationError` | 401 | Missing/invalid/expired credentials |
| `AuthorizationError` | 403 | Authenticated but lacking permission |
| `NotFoundError` | 404 | Resource absent, or hidden by tenant scope |
| `ConflictError` | 409 | Uniqueness violation, illegal state transition |
| `RateLimitError` | 429 | Throttled |
| `InternalError` | 500 | Unexpected; details never leak to the client |

Services throw these. One terminal error middleware translates them into the response
envelope (`05-api-conventions.md` §4), logs with the request id, and reports 5xx to
the error tracker. Controllers do not catch — an `asyncHandler` wrapper forwards
rejections.

**A 404 is returned when a document exists but belongs to another tenant.** Returning
403 would confirm the resource exists, which is an information leak.

---

## 6. Frontend layering

```
client/src/
├── app/
│   ├── (auth)/                 login, register/*, verify, forgot, reset
│   ├── (college)/              college portal route group + layout
│   ├── (student)/              student portal route group + layout
│   ├── (platform)/             platform admin route group + layout
│   ├── layout.tsx              root: providers, fonts, theme script
│   └── globals.css
├── components/
│   ├── ui/                     shadcn primitives — unmodified generated output
│   ├── common/                 app-wide composites: PageHeader, EmptyState, …
│   ├── forms/                  field wrappers bound to React Hook Form
│   ├── tables/                 DataTable and its parts (TanStack Table)
│   ├── charts/                 Recharts wrappers carrying the design tokens
│   ├── modals/                 dialog compositions
│   └── dashboard/              stat tiles, activity feeds, dashboard widgets
├── features/                   ← the important one; see below
├── layouts/                    AppShell, Sidebar, Topbar, portal navigation
├── hooks/                      cross-cutting hooks (useDebounce, useMediaQuery…)
├── lib/
│   ├── api/                    axios instance, interceptors, endpoint fns
│   ├── middleware/             reusable helpers for src/middleware.ts
│   ├── socket/                 Socket.IO client, typed event map
│   └── utils/                  formatting, dates, permissions helpers
├── store/                      Redux Toolkit slices (client state only)
├── providers/                  QueryProvider, ThemeProvider, SocketProvider
├── types/                      client-only types (shared types come from `shared`)
├── constants/                  nav definitions, route tables, option lists
├── styles/
└── middleware.ts               Next.js edge middleware: route guards
```

### Feature-first organisation

`features/` is where most code lives, and it is the single biggest lever on whether
this codebase stays navigable at 300+ components. Each feature owns its slice
end-to-end:

```
features/attendance/
├── api/              query + mutation hooks (TanStack Query), typed
├── components/       components used only by this feature
├── hooks/            feature-specific hooks
├── schemas/          re-exports from `shared`, plus client-only form schemas
├── types/
└── utils/
```

A file under `app/` is thin: it composes feature components, sets metadata, and
handles route params. Business UI does not live in `app/`.

Cross-feature imports go through the feature's `index.ts` barrel only. A feature
reaching into another feature's internals (`features/x/components/Foo`) is a lint
error.

### State ownership (binding)

| State | Owner | Never |
| --- | --- | --- |
| Anything fetched from the API | TanStack Query | in Redux |
| Theme, sidebar collapsed, table density/column visibility, saved filters | Redux Toolkit + redux-persist | in Query |
| Form state | React Hook Form | in Redux |
| URL-representable state: page, sort, filters, tab | **The URL** (`nuqs`-style search params) | in Redux |
| Design-system context (theme, toaster) | React Context | — |

Filters and pagination living in the URL is deliberate: it makes every table view
shareable and bookmarkable, and it survives refresh without persistence code.

### Auth state on the client

The access token is held **in memory only** (a module-scoped variable inside the API
client). It is never written to `localStorage` or a non-httpOnly cookie. The refresh
token is an httpOnly cookie the JavaScript never sees. On mount, the app calls
`/auth/session` to rehydrate the user. Rationale and threat model in `10-security.md`.

Redux may hold a *non-sensitive* mirror of the user profile for rendering, populated
from that call. It is never the source of truth for authorisation — the server decides.

---

## 7. Request lifecycle, end to end

Taking "faculty marks attendance for a session" as the worked example:

1. `AttendanceSheet` (feature component) submits; React Hook Form validates against
   the shared Zod schema client-side.
2. `useMarkAttendance()` mutation calls `POST /api/v1/attendance/sessions/:id/mark`
   via the axios instance, which attaches the in-memory access token.
3. Express: `authenticate` verifies the JWT → `tenantContext` populates
   `AsyncLocalStorage` → `authorize('attendance:mark')` checks the permission →
   `validate(markAttendanceSchema)` re-validates the body server-side (client
   validation is a UX affordance, never a trust boundary).
4. `AttendanceController.mark` calls `attendanceService.markSession(sessionId, entries)`.
5. The service verifies the session belongs to a batch the caller teaches, that the
   session is not locked, and that every student id is enrolled in the batch. It
   writes through `attendanceRepository` inside a transaction, writes an audit log,
   and emits `attendance.marked` on the event bus.
6. The socket layer, subscribed to that event, pushes `attendance:updated` to the
   batch room and to each affected student's user room.
7. The response returns; the mutation's `onSuccess` invalidates the relevant query
   keys; affected tables refetch.

If the access token was expired at step 3, the axios response interceptor catches the
401, calls `POST /auth/refresh` once (de-duplicated across concurrent 401s via a
shared promise), and replays the original request. If refresh fails, the client clears
state and routes to login.

---

## 8. Configuration

All configuration comes from environment variables, parsed and validated **once** at
boot by a Zod schema in `server/src/config/env.ts`. The process refuses to start if a
required variable is missing or malformed — a loud crash at boot beats a `undefined`
surfacing as a runtime error in week three.

`process.env` is read in exactly that one file. Everywhere else imports the typed
`config` object.

The same pattern applies client-side in `client/src/lib/config.ts` for the
`NEXT_PUBLIC_*` variables.

---

## 9. Logging and observability

- **Winston** for application logs; JSON in production, pretty-printed in development.
- **Morgan** piped into Winston for HTTP access logs.
- Every request gets a `requestId` (from `X-Request-Id` if present, else generated),
  carried in `AsyncLocalStorage`, attached to every log line, and returned in the
  response envelope's `meta` so a user-reported error can be traced to its logs.
- Log levels: `error` for 5xx and unhandled rejections, `warn` for 4xx that indicate
  misuse, `info` for lifecycle and state transitions, `debug` for development only.
- **Never logged:** passwords, tokens, OTP codes, full request bodies on auth routes,
  resume file contents.
- `/health` (liveness) and `/health/ready` (checks Mongo and Redis connectivity) for
  the platform's health checks.
