# Security

Depends on: `04-auth-rbac.md`, `09-integrations.md`.

This document is organised by **threat**, not by library. A list of installed packages
is not a security posture; what matters is which attack each control answers and where
it is enforced.

---

## 1. What we are protecting

| Asset | Sensitivity | Why it matters |
| --- | --- | --- |
| Student PII (DOB, address, guardian contact, photo) | High | Minors in some cases; regulated in most jurisdictions |
| Academic records (marks, CGPA, backlogs, attendance) | High | Affects employment; tampering has real consequences |
| Exam content and answer keys | High | Leakage invalidates assessments outright |
| Resumes and placement records | High | PII plus commercially sensitive salary data |
| Credentials and tokens | Critical | Account takeover |
| Cross-tenant data | Critical | One college seeing another's data ends the product |
| Audit logs | High | The record of what happened; must be tamper-evident |

---

## 2. Threat model

| # | Threat | Primary control | Enforced at |
| --- | --- | --- | --- |
| T1 | Cross-tenant data access | Automatic tenant scoping in the base repository | Repository (`01` §4) |
| T2 | Privilege escalation | Permission middleware + `ScopeGuard` | Middleware + service (`04` §5) |
| T3 | Credential stuffing / brute force | Per-IP **and** per-email rate limits, account lockout, uniform errors | Middleware + auth service |
| T4 | Token theft via XSS | Access token in memory, refresh in httpOnly cookie, strict CSP | Client + headers |
| T5 | Refresh token replay | Rotation with family revocation on reuse | Auth service (`04` §1) |
| T6 | NoSQL injection | Zod validation, `express-mongo-sanitize`, field whitelisting | Middleware + repository |
| T7 | Stored XSS via rich text | Server-side HTML sanitisation on write, escaping on render | Service + client |
| T8 | CSRF on cookie-authed routes | SameSite cookies + double-submit token on refresh/logout | Middleware |
| T9 | Exam answer leakage | `select: false` + serializer stripping + server-side grading | Model + serializer (`07` §6) |
| T10 | Malicious file upload | Magic-byte sniffing, allowlist, re-encode, AV scan, random keys | Upload pipeline (`09` §1) |
| T11 | IDOR on files and records | Signed short-lived URLs, ownership checks, 404-not-403 | Service + storage |
| T12 | User enumeration | Uniform responses on login and password reset | Auth service (`04` §3) |
| T13 | Mass data exfiltration | Export rate limits, audit logging, pagination caps | Middleware + audit |
| T14 | Audit tampering | Append-only model, no mutation routes, archival not deletion | Model (`03` §7.4) |
| T15 | ReDoS via search input | Escaped and anchored regex, or text index | Query builder (`05` §5) |
| T16 | Dependency compromise | Lockfiles, `npm audit` in CI, Dependabot, pinned base images | CI (`11`) |
| T17 | Secret leakage | Env-only secrets, secret scanning in CI, no secrets in logs | CI + logging |
| T18 | DoS via expensive queries | Pagination caps, async jobs for heavy work, query timeouts | API + jobs |

---

## 3. Input validation

Three layers, and the ordering matters:

1. **Client** (React Hook Form + Zod) — UX only. Never a trust boundary.
2. **Server** (`validate(schema)` middleware) — the real boundary. Every route validates
   body, params, and query against a Zod schema from `shared`. Unknown keys are
   **stripped**, not merely ignored, so a client cannot smuggle `role: 'college_admin'`
   into a profile update and hope a downstream spread operator picks it up. This is the
   single highest-value validation rule in the codebase.
3. **Database** (Mongoose schema validation) — the backstop for anything reaching the
   model by another path, such as a seeder or a migration.

Additionally: `express-mongo-sanitize` strips `$`-prefixed keys and dots; all filter,
sort, projection, and populate fields are whitelisted per resource (`05` §5); user
regex input is escaped and anchored.

---

## 4. Output encoding and XSS

- React escapes by default. `dangerouslySetInnerHTML` appears in exactly one place — the
  rich-text renderer — and only with content sanitised server-side on write.
- Rich text (announcements, ticket messages, course descriptions) is sanitised with
  `sanitize-html` against a strict allowlist on **write**, so stored content is already
  safe and a rendering path that forgets to sanitise cannot leak.
- User-supplied URLs are validated for scheme; `javascript:` and `data:` are rejected.
- File downloads set `Content-Disposition: attachment` and
  `X-Content-Type-Options: nosniff` for non-image types, so an uploaded HTML file cannot
  execute in the application's origin.

### Content Security Policy

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https://res.cloudinary.com https://*.s3.amazonaws.com;
font-src 'self';
connect-src 'self' <API_URL> <WS_URL>;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
object-src 'none';
```

No `unsafe-eval`, no `unsafe-inline` for scripts. This is why fonts are self-hosted
(`02-design-system.md` §3) rather than loaded from Google Fonts — a CSP with an
exception carved into it for convenience is most of the way to no CSP. `style-src
'unsafe-inline'` is retained because Tailwind's runtime style injection and Framer
Motion require it; scripts are the meaningful risk and they are locked down.

---

## 5. HTTP security headers

Via Helmet, plus explicit configuration:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(self), microphone=(self), geolocation=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-site
```

`camera` and `microphone` are `self` rather than empty because proctored exams and any
future mock-interview feature need them; `geolocation` is denied outright since nothing
in the product requires it.

`X-Powered-By` is removed.

---

## 6. CORS

Explicit origin allowlist from `CORS_ORIGINS`, `credentials: true`, restricted methods
and headers, 24-hour preflight cache.

**`origin: '*'` is never used**, and is incompatible with `credentials: true` anyway.
Reflecting the request origin — the usual workaround — defeats the entire purpose of
CORS and is prohibited.

---

## 7. Cookies

| Cookie | Flags | Lifetime |
| --- | --- | --- |
| `refreshToken` | `httpOnly`, `secure`, `sameSite=strict`, `path=/api/v1/auth` | 7d / 30d |
| `csrfToken` | `secure`, `sameSite=strict` (readable by JS by design) | Session |

`sameSite=strict` on the refresh cookie is chosen over `lax` because nothing in this
product requires a cross-site navigation to arrive already authenticated. The narrow
`path` means the cookie is not sent on every API request, only to the auth endpoints
that need it.

---

## 8. CSRF

Bearer-token endpoints are inherently CSRF-resistant, since a cross-site request cannot
set an `Authorization` header. The exposure is the cookie-authenticated endpoints —
`/auth/refresh` and `/auth/logout` — which are protected by a double-submit CSRF token
in addition to `sameSite=strict`. Two independent controls, because `sameSite` support
is not universal and the consequence of CSRF on refresh is a stolen session.

---

## 9. Rate limiting and abuse

Limits are in `05-api-conventions.md` §9, backed by Redis so they hold across instances.

Additional protections: progressive delays on repeated auth failures; account lockout at
5 failures for 15 minutes; CAPTCHA after 3 failed logins from an IP; per-user concurrent
export and import caps; a global request timeout of 30 seconds; and a MongoDB
`maxTimeMS` on every query so a pathological aggregation cannot pin a connection
indefinitely.

---

## 10. Data protection

- **In transit:** TLS 1.2+ everywhere, HSTS with preload, TLS to MongoDB Atlas and
  Redis.
- **At rest:** Atlas encryption at rest; S3 SSE; passwords bcrypt cost 12; OTPs bcrypt;
  refresh tokens SHA-256 (fast hash is correct here — the input is already 256 bits of
  entropy, so the slow-hash rationale that applies to passwords does not apply).
- **In logs:** a redaction list covering `password`, `passwordHash`, `token`,
  `refreshToken`, `otp`, `authorization`, `cookie`, and `secret`, applied by a Winston
  formatter so redaction cannot be forgotten at a call site.
- **Minimisation:** collect only what a module needs. Guardian details are optional;
  religion, caste, and similar fields are not collected at all unless a specific
  regulatory requirement is produced.
- **Retention:** audit logs 3 years then archived to cold storage; soft-deleted records
  purged after 90 days; orphan files 7 days; sessions and OTPs by TTL; graduated student
  records retained per the college's own policy, configurable.
- **Subject rights:** export-my-data and delete-my-account endpoints. Deletion
  anonymises rather than removes where academic and placement records must be retained
  for institutional reporting — PII is scrubbed, the statistical record survives.

---

## 11. Secure development practices

- TypeScript `strict`, with `noUncheckedIndexedAccess`.
- ESLint including `eslint-plugin-security` and the import-boundary rules from
  `01-architecture.md`.
- `npm audit` and Dependabot in CI; high-severity vulnerabilities block merge.
- Secret scanning (gitleaks) on every push.
- SAST (CodeQL) on pull requests.
- Docker images built from pinned digests, run as a non-root user, multi-stage so build
  tooling never reaches production.
- No `eval`, no `Function` constructor, no dynamic `require`.
- Dependency additions are reviewed — every package is attack surface, and the brief's
  own instruction to avoid unnecessary dependencies is a security control as much as a
  performance one.

---

## 12. Incident response

- 5xx responses are reported to an error tracker with the request id but **without**
  request bodies (which contain PII).
- Alerting on: a spike in 401/403, refresh-token reuse detections, repeated tenant-scope
  violations (`InternalError` from the base repository), failed login spikes, and job
  dead-letter growth.
- Every `severity: critical` audit event pages: token reuse, role change, permission
  change, impersonation start, college suspension.
- A documented runbook for revoking all sessions for a user or an entire college.
- Backups: Atlas continuous backup with point-in-time recovery; restore tested quarterly.
  An untested backup is a hypothesis, not a backup.

---

## 13. Security testing requirements

These are merge-blocking, not aspirational:

1. **Tenant isolation** — for every tenant-scoped repository, a test seeding two colleges
   and asserting no cross-tenant leakage.
2. **Authorization** — for every protected endpoint, a test calling it with an
   under-privileged token and asserting 403 (or 404 where existence is hidden).
3. **Exam integrity** — a test asserting the student-facing exam payload contains no
   `isCorrect` key anywhere in the tree.
4. **Serializer stripping** — tests for internal ticket notes, meeting host URLs, and
   `passwordHash` absence in every user-returning response.
5. **Rate limiting** — tests confirming lockout and throttle behaviour.
6. **Upload rejection** — tests with a mismatched magic-byte file and an oversized file.
7. **Injection** — tests submitting `$`-prefixed keys and regex metacharacters.

Items 1, 2, and 3 are the ones that would end the product if they failed in production,
and they are cheap to test. There is no acceptable reason to ship without them.
