# Testing, CI/CD, and Deployment

Depends on: `01-architecture.md`, `10-security.md`.

---

## 1. Test strategy

The layering in `01-architecture.md` §3 exists partly to make testing cheap: services
are framework-agnostic and take injected repositories, so most business logic is
testable without a database or an HTTP server.

| Layer | Tool | What it covers | Target |
| --- | --- | --- | --- |
| Unit — services | Jest | Business rules, state machines, calculations, with fake repositories | 80% of service files |
| Unit — utilities | Jest | Formatters, validators, permission helpers, query builder | 90% |
| Integration — repositories | Jest + `mongodb-memory-server` | Queries, indexes, tenant scoping, soft delete | Every repository |
| Integration — API | Jest + Supertest | Full middleware chain against a real in-memory Mongo | Every endpoint |
| Component | Jest + React Testing Library + jest-axe | Rendering, interaction, accessibility | Shared components + complex features |
| E2E | Cypress | Critical user journeys | The flows in §3 |

**Coverage thresholds** (enforced in CI, build fails below):
global 75% statements / 70% branches; services and repositories 85%; auth, permissions,
and the tenant-scoping base repository **95%**.

The differential threshold is the point: a uniform 75% target lets the auth module sit
at 60% while a formatting utility sits at 100%. The modules where a bug is unrecoverable
get the high bar.

### What is not tested

Explicitly, so it is a decision rather than an oversight: generated shadcn primitives
(tested upstream), Mongoose's own behaviour, third-party SDK internals, and pure layout
markup with no logic. Testing these produces coverage numbers, not confidence.

---

## 2. Test data

Factories (`@faker-js/faker` behind typed builder functions) rather than fixtures, so a
schema change breaks compilation instead of silently producing invalid documents.

```ts
const college = await collegeFactory.create();
const batch   = await batchFactory.create({ collegeId: college._id });
const student = await studentFactory.create({ collegeId: college._id, batchId: batch._id });
```

Every integration test runs against a fresh in-memory Mongo instance with indexes built,
and truncates between tests. Tests never share state and never depend on execution order.

Note the distinction from the "never use fake data" rule in the brief: that rule governs
**application code and UI**, which must always render live data. Test factories are the
correct tool in their own context.

---

## 3. E2E journeys (Cypress)

These are the flows where a regression is most costly:

1. College registration → email verification → platform approval → first login.
2. College admin creates a department, a batch, and a student → student receives the
   invite → sets a password → signs in.
3. Bulk student import: template → dry run with errors → correction → confirmed import.
4. Faculty marks attendance → student sees it → summary and percentage update.
5. Faculty creates and publishes an assignment → student submits → faculty grades →
   student sees the grade.
6. Student takes a timed exam → autosave → submit → result. Includes an expiry case
   asserting server-side enforcement.
7. Officer posts a job → eligible student applies → shortlist → interview scheduled →
   result recorded → placement confirmed → placement report reflects it.
8. Training request: submit → approve → assign trainer → complete.
9. Permission enforcement: a student attempting college-portal routes and endpoints is
   refused at both the UI and the API.
10. Theme toggle, responsive layout at 375px, and keyboard-only navigation of a
    representative form and table.

Cypress runs against a seeded environment with a dedicated test database, never against
staging data.

---

## 4. Code quality gates

- **ESLint** — TypeScript recommended, `import/order`, `security`, plus the project's
  own boundary rules: no Mongoose outside `repositories/`, no `req`/`res` in services,
  no cross-feature deep imports, no imports of `client`/`server` from `shared`.
- **Prettier** — 100 columns, single quotes, trailing commas.
- **TypeScript** — `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`. `any` is
  an error; `unknown` plus narrowing is the alternative.
- **Husky + lint-staged** — pre-commit lints and formats staged files; pre-push runs
  type-check and unit tests.
- **commitlint** — Conventional Commits, which is what makes automated changelogs and
  semantic versioning possible later.

---

## 5. CI/CD

### `.github/workflows/ci.yml` — on every push and PR

```
lint          eslint + prettier --check + commitlint
typecheck     tsc --noEmit (client, server, shared)
test:unit     jest, coverage thresholds enforced
test:integration   jest + mongodb-memory-server
build         next build + tsc build
security      npm audit --audit-level=high · gitleaks · CodeQL
e2e           cypress run against docker-compose (PRs to main only)
```

Jobs run in parallel where independent. A red build blocks merge; there is no override.

### `.github/workflows/deploy-staging.yml` — on merge to `develop`

Build images → push to registry → deploy API to Render (staging) → deploy client to
Vercel (preview) → run smoke tests → notify.

### `.github/workflows/deploy-production.yml` — on tag `v*`

Requires a **manual approval gate**, then: build → push → database migration (dry-run,
then apply) → deploy API → health check → deploy client → smoke tests → notify.
Automatic rollback to the previous image if health checks fail.

Migrations run before the new API version is live, and must be **backwards-compatible
with the previous version** — the expand/contract pattern: add the new field, deploy code
that writes both, backfill, deploy code that reads the new field, remove the old one in a
later release. Without this discipline, any deployment with a schema change is an outage.

---

## 6. Docker

```
docker/
├── Dockerfile.client        multi-stage: deps → build → runner (Next standalone)
├── Dockerfile.server        multi-stage: deps → build → runner
├── docker-compose.yml       full local stack
├── docker-compose.prod.yml  production composition
├── nginx/nginx.conf
└── nginx/ssl.conf
```

Both images: Node 22 Alpine pinned by digest, multi-stage so build tooling and dev
dependencies never reach the final layer, a non-root `node` user, `dumb-init` as PID 1
for correct signal handling, and a `HEALTHCHECK`.

`docker-compose.yml` runs client, server, MongoDB, Redis, MailHog (SMTP capture), and
mongo-express. One `docker compose up` gives a complete working environment, which is the
thing that makes onboarding a new developer a ten-minute job instead of a day.

---

## 7. Deployment topology

| Environment | Client | API | Database | Redis |
| --- | --- | --- | --- | --- |
| Local | `next dev` | `tsx watch` | Docker Mongo | Docker Redis |
| Staging | Vercel preview | Render | Atlas M10 | Upstash / Render |
| Production | Vercel or Hostinger VPS | Render or VPS | Atlas M30+ | Managed Redis |

The brief lists both Vercel and Hostinger for production. These are genuinely different
deployments: Vercel takes the Next.js standalone build directly; Hostinger means a VPS
with Nginx, PM2, and a Node process, so the client runs as `next start` behind a reverse
proxy. Both are supported and both configurations ship, but **the deployment target
should be chosen rather than kept dual indefinitely** — maintaining two production paths
doubles the deployment surface for no benefit.

### Nginx (VPS path)

Reverse proxy with TLS via Let's Encrypt and auto-renewal, HTTP→HTTPS redirect, gzip and
brotli, static asset caching with long max-age on hashed assets, WebSocket upgrade
headers for Socket.IO, a client body limit matching the largest upload, security headers
per `10-security.md` §5, and rate limiting as a layer in front of the application's own.

### PM2 (VPS path)

`ecosystem.config.js`: cluster mode at `instances: 'max'` for the API (stateless, so it
scales horizontally — this is why the Redis socket adapter and Redis-backed rate limiting
are required), `max_memory_restart: 1G`, log rotation, graceful reload for zero-downtime
deploys, and startup on boot.

---

## 8. Monitoring

- **Logs** — Winston JSON to stdout, shipped to the platform's aggregator. Every line
  carries `requestId`, `userId`, and `collegeId` where available.
- **Errors** — Sentry (or equivalent) on both client and server, source maps uploaded in
  CI, PII scrubbed before send.
- **Uptime** — external checks against `/health` and `/health/ready`.
- **Metrics** — request rate, p50/p95/p99 latency by route, error rate, queue depth and
  job failure rate, database connection pool utilisation, slow-query log.
- **Alerts** — error rate above 1% for 5 minutes, p95 latency above 2 seconds, queue
  depth above 1000, dead-letter queue non-empty, health check failing, and every
  `critical` audit event (`10-security.md` §12).

---

## 9. Backup and recovery

Atlas continuous backup with point-in-time recovery, daily snapshots retained 30 days,
weekly retained 12 weeks, monthly retained 12 months. Uploaded files use S3 versioning
with cross-region replication.

**Restore is tested quarterly into a scratch environment**, and the runbook is updated
from what that exercise reveals. Targets: RPO 1 hour, RTO 4 hours. Both numbers are
meaningless until a restore has actually been performed against them.

---

## 10. Performance budgets

Enforced in CI where measurable (Lighthouse CI on key routes, k6 for the API):

| Metric | Budget |
| --- | --- |
| LCP (dashboard) | < 2.5s |
| CLS | < 0.1 |
| INP | < 200ms |
| Client JS, initial route | < 250KB gzipped |
| API p95, list endpoints | < 300ms |
| API p95, dashboard | < 500ms |
| API p95, analytics | < 1.5s |
| Slow query threshold | 100ms — logged and reviewed |

Chart libraries, the PDF viewer, and the rich text editor are dynamically imported so
they do not weigh down initial routes.
