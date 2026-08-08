# API Conventions

Depends on: `01-architecture.md`. Binding on every endpoint in `06-` and `07-`.

These conventions exist so that 100+ endpoints behave identically. A endpoint that
invents its own response shape, pagination style, or error format is a defect even if
it works.

---

## 1. Base and versioning

```
Development   http://localhost:5000/api/v1
Production    https://api.peacefic.one/api/v1
```

Only `v1` ships (`00-overview.md` §6). Routes are mounted from
`server/src/routes/v1/index.ts`, so adding `v2` later is a new folder and one mount
line, with `v1` untouched.

Version lives in the path, not a header — it is greppable, cacheable, and visible in
logs.

---

## 2. Resource naming

- Plural nouns, kebab-case: `/students`, `/training-requests`, `/job-applications`.
- Nesting only one level deep, and only for genuinely dependent resources:
  `/batches/:batchId/students` is fine; `/colleges/:id/departments/:id/batches/:id/students`
  is not — use `/students?batchId=`.
- Verbs are not path segments, with one deliberate exception: **state transitions**,
  which are modelled as sub-resource actions because they are not CRUD.

```
POST /training-requests/:id/approve
POST /training-requests/:id/reject
POST /applications/:id/shortlist
POST /attendance/sessions/:id/lock
POST /auth/refresh
```

This is a conscious departure from strict REST. Modelling "approve" as
`PATCH {status:'approved'}` hides an operation with side effects (notifications, audit,
downstream state) behind a generic field write, and makes it impossible to
permission approval separately from editing. Named actions are clearer and safer.

### Standard method semantics

| Method | Meaning |
| --- | --- |
| `GET /resource` | List. Paginated, filterable, sortable, searchable. |
| `GET /resource/:id` | Single resource. 404 if absent **or in another tenant**. |
| `POST /resource` | Create. Returns 201 with the created document. |
| `PUT /resource/:id` | Full replace. Rare — used only where a full-document write is genuinely intended. |
| `PATCH /resource/:id` | Partial update. **The default for edits.** |
| `DELETE /resource/:id` | Soft delete. Returns 200 with `{ id, deletedAt }`. |

Hard delete is not exposed over the API. Purging soft-deleted records is a retention
job (`09-integrations.md` §4).

---

## 3. Response envelope

Every response — success and failure — uses one shape. No endpoint returns a bare
array or a bare document.

**Success:**

```json
{
  "success": true,
  "data": { },
  "meta": { "requestId": "01J8X...", "timestamp": "2026-08-05T10:14:22.108Z" }
}
```

**List success** adds pagination to `meta`:

```json
{
  "success": true,
  "data": [ ],
  "meta": {
    "requestId": "01J8X...",
    "timestamp": "2026-08-05T10:14:22.108Z",
    "pagination": {
      "page": 1, "limit": 25, "totalItems": 342, "totalPages": 14,
      "hasNextPage": true, "hasPreviousPage": false
    }
  }
}
```

**Error:**

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The submitted data is invalid.",
    "details": [
      { "field": "email", "message": "Must be a valid email address" },
      { "field": "rollNumber", "message": "Already in use in this batch" }
    ]
  },
  "meta": { "requestId": "01J8X...", "timestamp": "..." }
}
```

`requestId` is in every response so a user can quote it from an error toast and it can
be found in the logs (`01-architecture.md` §9).

`message` is safe to show a user. `details` drives per-field form errors. Internal
messages, stack traces, and driver errors never cross this boundary.

---

## 4. Error codes

| HTTP | `code` | Meaning |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Body/query failed schema validation |
| 400 | `BAD_REQUEST` | Malformed but not schema-specific |
| 401 | `UNAUTHENTICATED` | No/invalid credentials |
| 401 | `TOKEN_EXPIRED` | Access token expired — **client should refresh and retry** |
| 401 | `INVALID_CREDENTIALS` | Wrong email/password on login |
| 403 | `FORBIDDEN` | Authenticated, lacks permission |
| 403 | `ACCOUNT_INACTIVE` | Suspended, pending approval, or unverified |
| 404 | `NOT_FOUND` | Absent, or in another tenant |
| 409 | `DUPLICATE_RESOURCE` | Unique constraint violated |
| 409 | `INVALID_STATE_TRANSITION` | e.g. approving an already-rejected request |
| 413 | `FILE_TOO_LARGE` | Upload exceeds limit |
| 415 | `UNSUPPORTED_FILE_TYPE` | MIME type rejected |
| 422 | `BUSINESS_RULE_VIOLATION` | Valid input, illegal domain-wise |
| 429 | `RATE_LIMITED` | Throttled; includes `Retry-After` |
| 500 | `INTERNAL_ERROR` | Unexpected. Message is always generic. |
| 503 | `SERVICE_UNAVAILABLE` | Dependency down |

`TOKEN_EXPIRED` is distinct from `UNAUTHENTICATED` on purpose: the client's interceptor
refreshes on the former and logs out on the latter, and conflating them causes either
spurious logouts or infinite refresh loops.

---

## 5. List query parameters

Identical across every list endpoint.

| Param | Default | Notes |
| --- | --- | --- |
| `page` | 1 | 1-indexed |
| `limit` | 25 | Max 100. `limit=0` is rejected, not "all". |
| `sort` | `-createdAt` | Mongo-style; `-` prefix descends. Whitelisted per resource. |
| `search` | — | Free text across a whitelisted field set per resource |
| `fields` | — | Comma-separated projection, whitelisted |
| `include` | — | Comma-separated relations to populate, whitelisted |
| `from` / `to` | — | ISO dates, applied to the resource's primary date field |
| *resource filters* | — | Explicit, whitelisted (`status`, `departmentId`, `batchId`, …) |

**Whitelisting is mandatory** on `sort`, `search`, `fields`, `include`, and filters. An
arbitrary user-supplied field reaching a Mongo query is an injection and a performance
hazard. Each repository declares its allowed sets; anything else is a
`VALIDATION_ERROR`.

Advanced operators use bracket suffixes, parsed into Mongo operators by a shared query
builder:

```
?cgpa[gte]=7.5&status[in]=active,on_leave&createdAt[lt]=2026-01-01
```

Supported: `eq ne gt gte lt lte in nin regex exists`. `regex` values are escaped for
regex metacharacters and anchored — a raw user regex is a ReDoS vector.

**Pagination strategy:** offset pagination (`skip`/`limit`) for UI tables, which need
page numbers and total counts. Endpoints that can exceed ~50k rows (audit logs,
activity logs, notifications) also expose **cursor** pagination via `cursor` and
`limit`, because deep `skip` on large collections degrades badly. Cursor responses
return `meta.pagination.nextCursor` instead of page counts.

---

## 6. Bulk operations

Bulk endpoints live under the resource with a `/bulk` segment and always return a
per-item result — never a bare success.

```
POST   /students/bulk            create many
PATCH  /students/bulk            update many by id
DELETE /students/bulk            soft-delete many by id
POST   /students/bulk/import     CSV/XLSX upload → validate → import
GET    /students/bulk/template   download the import template
POST   /students/export          async export job → returns jobId
```

Bulk write response:

```json
{
  "success": true,
  "data": {
    "totalSubmitted": 120,
    "successCount": 117,
    "failureCount": 3,
    "results": [
      { "index": 4, "success": false, "code": "DUPLICATE_RESOURCE",
        "message": "Roll number CS21B004 already exists", "identifier": "CS21B004" }
    ]
  }
}
```

Rules: max 500 items per bulk request; partial success is the norm and returns 200 (a
bulk import that fails wholly because row 87 is malformed is hostile to the user);
imports run **dry-run first**, returning a validation report the UI shows for
confirmation before the real write; imports over 500 rows become background jobs and
return a `jobId` the client polls or receives via socket.

---

## 7. Idempotency and concurrency

- Mutating endpoints accept an optional `Idempotency-Key` header. Keys are stored with
  their response for 24h; a repeat returns the stored response. Required in the client
  for payment-like or notification-triggering actions (approvals, offer issuance) where
  a double-submit has real consequences.
- Documents carry a `version` field (Mongoose `optimisticConcurrency`). `PATCH` may
  send `If-Match: <version>`; a mismatch returns 409 `CONFLICT` rather than silently
  overwriting a colleague's edit. The UI surfaces this as "this record changed while
  you were editing".

---

## 8. Auth headers

```
Authorization: Bearer <accessToken>
```

Refresh token travels only as an httpOnly cookie and is never accepted in a body or
header. Details in `04-auth-rbac.md`.

---

## 9. Rate limits

| Scope | Limit |
| --- | --- |
| Global per IP | 300 req / 15 min |
| `/auth/login` | 5 / 15 min per IP **and** per email |
| `/auth/register/*` | 3 / hour per IP |
| `/auth/forgot-password` | 3 / hour per email |
| OTP send/resend | 3 / 15 min per user; 60s cooldown between sends |
| File upload | 20 / hour per user |
| Bulk import | 5 / hour per user |
| Export | 10 / hour per user |

Backed by Redis so limits hold across instances. Responses include
`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, and `Retry-After` on 429.

Per-email login limiting in addition to per-IP matters: IP-only limiting fails against
distributed credential stuffing, and email-only limiting lets one attacker lock out a
victim. Both together, with the email limit generous enough not to be a denial-of-service
against the real user, is the workable compromise.

---

## 10. Documentation

- **Swagger/OpenAPI 3.1** at `/api/docs`, generated from Zod schemas via
  `zod-to-openapi` — so the docs are derived from the same schemas that validate
  requests and cannot drift from the implementation. Hand-written OpenAPI YAML is
  prohibited for this reason.
- The spec JSON is exported to `docs/api/openapi.json` in CI.
- A Postman collection is generated from that spec in the same CI step; it is a build
  artefact, never hand-edited.
- Swagger UI is disabled in production unless `ENABLE_API_DOCS=true`, and is behind
  auth when enabled.
