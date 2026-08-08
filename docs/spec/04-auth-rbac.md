# Authentication & Authorization

Depends on: `03-data-model.md` (`users`, `roles`, `permissions`, `sessions`, `otps`),
`05-api-conventions.md` (error codes).

---

## 1. Token strategy

| | Access token | Refresh token |
| --- | --- | --- |
| Format | JWT (HS256) | Opaque 256-bit random (ULID + crypto random) |
| Lifetime | 15 minutes | 7 days (30 with "remember me") |
| Transport | `Authorization: Bearer` header | httpOnly cookie |
| Client storage | **Memory only** | Cookie, unreadable by JS |
| Server storage | Stateless | Hashed in `sessions` |
| Revocable | No (short life is the mitigation) | Yes, immediately |

**The refresh token is opaque, not a JWT.** A JWT refresh token cannot be revoked
without a server-side denylist, at which point it is stateful anyway and you have paid
JWT's costs for none of its benefit. An opaque token checked against `sessions` gives
immediate revocation, device listing, and reuse detection for free.

**The access token is never persisted client-side.** `localStorage` is readable by any
XSS payload; a non-httpOnly cookie likewise. Holding it in a module-scoped variable
means a page refresh loses it and the app silently re-obtains one via the refresh cookie
— a trivial cost for removing the most commonly exploited token-theft path.

### Access token claims

```json
{
  "sub": "<userId>",
  "cid": "<collegeId|null>",
  "rol": "college_admin",
  "per": ["student:read", "student:create", "..."],
  "sid": "<sessionId>",
  "typ": "access",
  "iat": 1754390000,
  "exp": 1754390900,
  "iss": "peacefic-one",
  "aud": "peacefic-one-client"
}
```

Permissions are embedded so the common case needs no database read. The cost is
staleness: a permission revoked mid-session remains effective for up to 15 minutes.
Mitigations: a `permissionsVersion` counter on the user, bumped on any role or
permission change and compared against a claim — a mismatch forces a refresh. For
genuinely urgent revocation (suspension, dismissal), the admin action revokes all the
user's sessions, so the next refresh fails and access ends within one token lifetime.

If the embedded permission list ever grows past ~2KB the claim moves to a cached
server-side lookup; at the permission counts in §4 it does not.

### Refresh rotation and reuse detection

Every refresh issues a **new** refresh token and revokes the old one, keeping the same
`family` id. If a token that has already been rotated is presented again, that means
either a race or a stolen token, and the system cannot distinguish them — so it assumes
theft: **the entire family is revoked**, every session in it is killed, an
`auth.token_reuse_detected` audit entry with `severity: critical` is written, and the
user is emailed. The user has to sign in again. That is deliberately harsh, because the
alternative is letting a thief keep a live session.

---

## 2. Registration flows

### 2.1 College registration

```
POST /auth/register/college
  ↓ creates college(status=pending) + user(role=college_admin,
    status=pending_verification) in one transaction
  ↓ sends 6-digit OTP to the contact email
POST /auth/verify-email        { email, otp }
  ↓ user.emailVerifiedAt set, status → pending_approval
  ↓ platform admins notified
      ── platform admin reviews ──
POST /platform/colleges/:id/approve   (or /reject)
  ↓ college.status → active, user.status → active
  ↓ welcome email; the admin can now sign in
```

Login before approval returns 403 `ACCOUNT_INACTIVE` with a message stating the
application is under review — not a generic failure, which would generate support
tickets.

### 2.2 Student registration — invite (default)

```
College admin creates or imports the student
  ↓ user(status=pending_verification, mustChangePassword=true) + student created
  ↓ invite email with a signed, single-use, 7-day token
GET  /auth/invite/:token          → validates, returns name + college for the UI
POST /auth/invite/:token/accept   { password }
  ↓ password set, emailVerifiedAt set, status → active, token consumed
```

The invite token is a JWT signed with a dedicated secret, carrying `userId`, `purpose`,
and a `jti` recorded on the user so it can only be redeemed once. Expired or already-used
tokens offer a "request a new invite" path rather than a dead end.

### 2.3 Student registration — join code (optional per college)

Enabled by `colleges.settings.allowStudentSelfRegistration`. The student supplies a
batch-scoped join code, verifies their email by OTP, and lands in `pending_approval`
until a college admin or HOD accepts them. They cannot see any college data while
pending.

Rate-limited hard (3/hour/IP) and the code is rotatable from college settings, because
a leaked join code is otherwise an open door into a tenant.

---

## 3. Authentication flows

### 3.1 Login

```
POST /auth/login   { email, password, rememberMe? }
```

1. Look up the user by lowercase email, explicitly selecting `passwordHash`.
2. If `lockedUntil` is in the future → 403 `ACCOUNT_INACTIVE`.
3. Compare with bcrypt. **Always run a bcrypt comparison**, even when no user was
   found, against a dummy hash — otherwise response timing reveals which emails are
   registered.
4. On failure: increment `failedLoginAttempts`; at 5, set `lockedUntil = now + 15min`,
   audit `auth.account_locked`, email the user. Return 401 `INVALID_CREDENTIALS` — the
   same message whether the email is unknown or the password is wrong.
5. On success: reset counters, check `status`, create a session, issue tokens, set the
   refresh cookie, write `auth.login` audit, update `lastLoginAt`/`lastLoginIp`.
6. If `mustChangePassword`, the response flags it and the client routes to a forced
   change screen; the access token is issued but every endpoint except password-change
   and session rejects it.

### 3.2 Refresh

```
POST /auth/refresh      (refresh cookie only — no body, no header)
```

Hash the presented token, look it up, verify it is unrevoked and unexpired, verify the
user is still active, then rotate (§1). A revoked-but-known token triggers family
revocation. Failure returns 401 `UNAUTHENTICATED` and clears the cookie.

### 3.3 Session endpoint

`GET /auth/session` returns the current user, role, permissions, and college. The
client calls it on mount to rehydrate, since the access token is not persisted.

### 3.4 Logout

`POST /auth/logout` revokes the current session and clears the cookie.
`POST /auth/logout-all` revokes every session for the user.
`GET /auth/sessions` lists active devices; `DELETE /auth/sessions/:id` revokes one.

### 3.5 Password reset

```
POST /auth/forgot-password  { email }
  → ALWAYS 200, regardless of whether the account exists
  → if it exists: OTP + signed reset token emailed, 15-minute expiry
POST /auth/reset-password   { token, otp, newPassword }
  → password updated, passwordChangedAt set,
    ALL sessions revoked, confirmation email sent
```

The uniform 200 is deliberate: distinguishing "no such account" here hands over a user
enumeration oracle. Revoking all sessions on reset is equally deliberate — a password
reset is frequently a response to compromise, and leaving the attacker's session alive
defeats the point.

### 3.6 OAuth

Google (and optionally Microsoft) via the provider's authorization-code flow with PKCE.

- The callback matches on **verified** provider email. An unverified provider email is
  rejected outright — accepting one lets an attacker register a provider account with a
  victim's address and take over.
- If a matching user exists, the provider is linked to the existing account.
- If no user exists, sign-up is **refused** unless a valid invite is pending. OAuth
  cannot be used to create a college membership from nothing, because there would be no
  way to know which tenant the person belongs to.
- Users may link and unlink providers in settings, with the rule that an account must
  always retain at least one usable credential.

### 3.7 OTP

6 digits, cryptographically random, bcrypt-hashed at rest, 10-minute expiry, max 5
verification attempts, 60-second resend cooldown, max 3 sends per 15 minutes. Used for
email verification, password reset, and sensitive actions (changing email, bulk delete).

---

## 4. Permission model

Permissions are `resource:action` strings. A user's effective set is
`role.permissions ∪ user.extraPermissions`.

Wildcards are supported at the resource level (`student:*`) and globally (`*:*`, held
only by `platform_admin`).

### Permission catalogue

Defined once in `shared/src/constants/permissions.ts` and seeded into `permissions`.

| Module | Permissions |
| --- | --- |
| College | `college:read` `college:update` `college:approve` `college:suspend` `college:settings` |
| Department | `department:read` `department:create` `department:update` `department:delete` |
| Batch | `batch:read` `batch:create` `batch:update` `batch:delete` `batch:assign_advisor` |
| Student | `student:read` `student:read_all` `student:create` `student:update` `student:delete` `student:import` `student:export` `student:approve` |
| Faculty | `faculty:read` `faculty:create` `faculty:update` `faculty:delete` `faculty:import` |
| Course | `course:read` `course:create` `course:update` `course:delete` `course:publish` `course:enroll_students` |
| Material | `material:read` `material:create` `material:update` `material:delete` |
| Live class | `liveclass:read` `liveclass:create` `liveclass:update` `liveclass:cancel` `liveclass:join_host` |
| Assignment | `assignment:read` `assignment:create` `assignment:update` `assignment:delete` `assignment:grade` `assignment:submit` |
| Exam | `exam:read` `exam:create` `exam:update` `exam:delete` `exam:publish` `exam:attempt` `exam:grade` `exam:view_results_all` `exam:invalidate_attempt` |
| Question | `question:read` `question:create` `question:update` `question:delete` |
| Attendance | `attendance:read` `attendance:read_all` `attendance:mark` `attendance:update` `attendance:lock` `attendance:override_lock` `attendance:export` |
| Result | `result:read` `result:read_all` `result:create` `result:update` `result:publish` `result:withhold` |
| Certificate | `certificate:read` `certificate:issue` `certificate:revoke` `certificate:bulk_issue` |
| Company | `company:read` `company:create` `company:update` `company:blacklist` |
| Job | `job:read` `job:create` `job:update` `job:delete` `job:publish` `job:close` |
| Application | `application:read` `application:read_all` `application:create` `application:withdraw` `application:shortlist` `application:reject` |
| Interview | `interview:read` `interview:read_all` `interview:schedule` `interview:update` `interview:record_result` |
| Placement | `placement:read` `placement:read_all` `placement:create` `placement:update` `placement:verify` `placement:report` |
| Training | `training:read` `training:create` `training:update` `training:approve` `training:reject` `training:assign_trainer` |
| Notification | `notification:read` `notification:send` `announcement:create` `announcement:publish` |
| Support | `ticket:read` `ticket:read_all` `ticket:create` `ticket:update` `ticket:assign` `ticket:resolve` `ticket:internal_note` |
| Audit | `audit:read` `audit:export` |
| Analytics | `analytics:read` `analytics:read_all` `report:generate` `report:export` |
| User | `user:read` `user:create` `user:update` `user:suspend` `user:reset_password` `user:impersonate` |
| Role | `role:read` `role:create` `role:update` `role:delete` `role:assign` |
| Settings | `settings:read` `settings:update` |

`user:impersonate` is marked `isDangerous`. It is held by no default role, requires
explicit grant, always writes a `critical` audit entry, shows a persistent banner in the
UI, and is limited to 60 minutes.

### Default role assignments

| Permission group | platform_admin | college_admin | hod | faculty | trainer | placement_officer | student |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| College read/update | ✓ | ✓ | R | R | R | R | R |
| College approve/suspend | ✓ | — | — | — | — | — | — |
| Departments | ✓ | ✓ | R | R | R | R | — |
| Batches | ✓ | ✓ | own dept | R | R | R | — |
| Students (all) | ✓ | ✓ | own dept | own batches | own batches | ✓ (read) | self |
| Faculty | ✓ | ✓ | own dept | R | — | — | — |
| Courses | ✓ | ✓ | own dept | own | own | — | enrolled |
| Materials | ✓ | ✓ | own dept | own courses | own courses | — | enrolled (read) |
| Live classes | ✓ | ✓ | own dept | own | own | — | join |
| Assignments | ✓ | ✓ | own dept | ✓ | ✓ | — | submit |
| Exams | ✓ | ✓ | own dept | ✓ | ✓ | — | attempt |
| Attendance mark | ✓ | ✓ | own dept | own batches | own batches | — | — |
| Attendance read | ✓ | all | own dept | own batches | own batches | all (read) | self |
| Results | ✓ | ✓ | own dept | create/update | create/update | R | self |
| Certificates issue | ✓ | ✓ | own dept | — | — | — | — |
| Companies | ✓ | R | — | — | — | ✓ | R |
| Jobs | ✓ | R | — | — | — | ✓ | R (eligible) |
| Applications | ✓ | R all | R own dept | — | — | ✓ | own |
| Interviews | ✓ | R all | R own dept | — | — | ✓ | own |
| Placements | ✓ | R all | R own dept | — | — | ✓ | own |
| Training requests | ✓ | create/read | create/approve own dept | R | R | — | — |
| Announcements | ✓ | ✓ | own dept | own batches | own batches | ✓ | read |
| Support tickets | ✓ all | ✓ college | R own dept | own | own | own | own |
| Audit logs | ✓ | ✓ college | — | — | — | — | — |
| Analytics | ✓ | ✓ college | own dept | own batches | own batches | placement | self |
| Users & roles | ✓ | ✓ college | — | — | — | — | — |
| Settings | ✓ | ✓ college | — | — | — | — | — |

`R` = read only. "own dept" / "own batches" / "self" are **scope** constraints, covered
next — they are not expressible as permission strings alone.

---

## 5. Scoped authorization

A permission answers *what*; scope answers *which rows*. `attendance:mark` does not
mean a faculty member may mark any batch in the college — only the batches they teach.
This is where most authorization bugs live, so it is handled structurally.

Three layers, all required:

1. **Tenant scope** — automatic, in the base repository (`01-architecture.md` §4). No
   query crosses colleges.
2. **Permission check** — `authorize('attendance:mark')` middleware, before the
   controller.
3. **Resource scope** — in the service, against the specific resource:

```ts
// AttendanceService.markSession — shape
const session = await this.attendanceRepo.findSessionById(sessionId);
if (!session) throw new NotFoundError('Attendance session');

await this.scopeGuard.assertCanAccessBatch(session.batchId);
// college_admin  → any batch in the college
// hod            → batches in their department
// faculty/trainer→ batches in faculty.assignedBatchIds
// student        → never (lacks the permission anyway)
```

`ScopeGuard` is a single injectable service with one method per scope dimension
(`assertCanAccessBatch`, `assertCanAccessStudent`, `assertCanAccessDepartment`,
`assertCanAccessCourse`, `assertOwnsResource`). Centralising it means the rule is
written once and tested once, rather than re-derived at forty call sites.

**List endpoints apply scope as a filter, not a rejection.** A faculty member listing
students gets their batches' students, not a 403.

Scope failures return **404, not 403**, when leaking existence matters (another
department's student), and 403 when it does not (attempting an action on a resource you
can already see).

---

## 6. Middleware chain

```ts
router.post(
  '/attendance/sessions/:id/mark',
  authenticate,                        // verify JWT, load claims
  requireActiveAccount,                // status checks, mustChangePassword gate
  tenantContext,                       // AsyncLocalStorage
  authorize('attendance:mark'),        // permission
  validate(markAttendanceSchema),      // Zod: body, params, query
  rateLimit('attendance:mark'),
  asyncHandler(attendanceController.mark)
);
```

Order matters and is fixed: authenticate before anything that needs identity; validate
after authorize, so unauthorised callers cannot use validation errors to probe the
schema.

---

## 7. Client-side enforcement

Two layers, neither of which is a security boundary:

- **`middleware.ts`** (Next.js edge) — checks for the refresh cookie's presence and
  redirects unauthenticated users to login before rendering. It cannot verify the token
  (no access to the signing secret at the edge in this deployment) and does not try.
- **`PermissionGate`** — hides UI the user cannot use.

Both are UX. **Every rule is enforced server-side, and the server never trusts either.**
Hiding a button is not authorization; the test suite includes cases that call protected
endpoints directly with under-privileged tokens.

---

## 8. Password policy

Minimum 8 characters, requiring at least one uppercase, one lowercase, one digit; the
last 3 passwords may not be reused (hashes retained on the user); checked against a
list of the 10,000 most common passwords; rejected if it contains the user's name or
email local-part.

Length beats composition rules for real strength, so 8 is a floor and the UI shows a
strength meter that rewards length, but composition minimums are retained because
institutional password policies usually require them.

bcrypt cost 12, re-evaluated annually. Hashing is never done client-side.

---

## 9. Audit events

Every one of these writes to `activitylogs`:

`auth.login` · `auth.login_failed` · `auth.logout` · `auth.logout_all` ·
`auth.token_refreshed` · `auth.token_reuse_detected` *(critical)* ·
`auth.account_locked` · `auth.password_changed` · `auth.password_reset_requested` ·
`auth.password_reset_completed` · `auth.email_verified` · `auth.oauth_linked` ·
`auth.oauth_unlinked` · `auth.session_revoked` · `auth.impersonation_started` *(critical)* ·
`auth.impersonation_ended` · `user.role_changed` *(critical)* ·
`user.permissions_changed` *(critical)* · `user.suspended` · `user.reactivated`
