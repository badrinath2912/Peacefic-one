# Real-time (Socket.IO)

Depends on: `04-auth-rbac.md` (token verification), `03-data-model.md` (notifications).

---

## 1. What real-time is for here

Real-time is used where a user would otherwise be staring at a stale screen: incoming
notifications, live attendance updates during marking, placement status changes,
long-running job progress, and announcements. It is **not** used as a general data
transport — data still comes over REST, and socket events mostly say "something
changed, refetch this."

This is a deliberate architectural line. Pushing full entity payloads over sockets means
maintaining two serialization paths with two sets of authorization rules, and the two
will drift. Push the *signal*, let React Query refetch through the path that already has
correct permission checks.

The exceptions, where the payload is the point: job progress percentages and typing
indicators. Neither is authorization-sensitive.

---

## 2. Connection and authentication

The client connects after login with the access token in the handshake:

```ts
io(SOCKET_URL, {
  auth: { token: accessToken },
  transports: ['websocket'],
  reconnectionDelayMax: 10_000,
});
```

Server-side, a connection middleware verifies the JWT exactly as the HTTP
`authenticate` middleware does, rejecting the connection on failure. The socket carries
`userId`, `collegeId`, `roleKey`, and `permissions`.

**Token expiry on a live socket:** access tokens last 15 minutes, but sockets live
longer. The server tracks each socket's token expiry and emits `auth:token_expiring`
60 seconds ahead; the client refreshes over HTTP and re-authenticates the existing
socket via an `auth:refresh` event rather than reconnecting. If the token expires
without refresh, the server disconnects with reason `token_expired` and the client
reconnects after refreshing. Sockets that authenticate once and then trust forever are a
common and serious hole — a revoked user keeps receiving data indefinitely.

Redis adapter (`@socket.io/redis-adapter`) so rooms work across multiple API instances.
Without it, a user connected to instance B never receives an event emitted on instance A.

---

## 3. Rooms

Rooms are the authorization mechanism. A client **never** chooses its own rooms; the
server assigns them at connection time from the token's claims.

| Room | Members | Purpose |
| --- | --- | --- |
| `user:{userId}` | one user, all their devices | Personal notifications |
| `college:{collegeId}` | everyone in the college | Announcements |
| `college:{collegeId}:role:{roleKey}` | one role in one college | Role-targeted alerts |
| `batch:{batchId}` | students + faculty of the batch | Attendance, class updates |
| `department:{departmentId}` | department members | Department announcements |
| `job:{jobPostingId}` | applicants + officers | Drive updates |
| `ticket:{ticketId}` | participants | Ticket messages |
| `exam:{examId}:proctor` | proctors | Live exam monitoring |

A client-supplied `join` request is rejected. This one rule prevents the obvious attack
of joining `college:<someone-else's-id>` and receiving another tenant's traffic.

---

## 4. Event catalogue

Names are namespaced `domain:event` and declared once in
`shared/src/constants/socket-events.ts`, typed on both ends so a rename breaks the build
rather than silently breaking delivery.

### Server → client

| Event | Room | Payload |
| --- | --- | --- |
| `notification:new` | `user:{id}` | `{ notification, unreadCount }` |
| `notification:read` | `user:{id}` | `{ notificationId, unreadCount }` — syncs other devices |
| `announcement:published` | `college:{id}` and targeted rooms | `{ announcementId, title, priority }` |
| `attendance:marked` | `batch:{id}` | `{ sessionId, stats }` |
| `attendance:updated` | `user:{studentId}` | `{ sessionId, status, date }` |
| `assignment:published` | `batch:{id}` | `{ assignmentId, title, dueAt }` |
| `assignment:graded` | `user:{studentId}` | `{ assignmentId, score, maxScore }` |
| `exam:published` | `batch:{id}` | `{ examId, title, availableFrom }` |
| `exam:result_published` | `user:{studentId}` | `{ examId, attemptId }` |
| `exam:attempt_flagged` | `exam:{id}:proctor` | `{ attemptId, studentId, violation }` |
| `result:published` | `user:{studentId}` | `{ resultId, semester }` |
| `liveclass:starting` | `batch:{id}` | `{ liveClassId, startsInMinutes }` |
| `liveclass:started` | `batch:{id}` | `{ liveClassId, joinUrl }` |
| `job:published` | eligible `user:{id}` rooms | `{ jobId, companyName, title }` |
| `application:status_changed` | `user:{studentId}` | `{ applicationId, from, to }` |
| `interview:scheduled` | `user:{studentId}` | `{ interviewId, scheduledAt }` |
| `interview:rescheduled` | `user:{studentId}` | `{ interviewId, from, to }` |
| `placement:confirmed` | `user:{studentId}`, `college:{id}:role:placement_officer` | `{ placementId }` |
| `training:status_changed` | `user:{requesterId}` | `{ requestId, from, to }` |
| `ticket:message` | `ticket:{id}` | `{ ticketId, message }` |
| `ticket:status_changed` | `ticket:{id}` | `{ ticketId, status }` |
| `job:progress` | `user:{id}` | `{ jobId, type, percent, processed, total }` |
| `job:completed` | `user:{id}` | `{ jobId, type, result, downloadUrl? }` |
| `job:failed` | `user:{id}` | `{ jobId, type, error }` |
| `auth:token_expiring` | socket | `{ expiresInSeconds }` |
| `auth:session_revoked` | `user:{id}` | `{ reason }` — client logs out immediately |

### Client → server

| Event | Purpose |
| --- | --- |
| `auth:refresh` | Re-authenticate the existing socket with a fresh token |
| `presence:ping` | Heartbeat for online status |
| `ticket:typing` | Typing indicator, relayed to the ticket room |
| `notification:mark_read` | Convenience mirror of the REST call, for cross-device sync |

That is the whole client→server surface. Everything that mutates state goes over REST,
where the middleware chain, validation, rate limiting, and audit logging already live.
Duplicating mutations onto sockets would mean duplicating all of it.

---

## 5. Emission from services

Services do not import the Socket.IO server. They emit domain events on an internal
event bus; a subscriber in `server/src/sockets/` translates domain events into socket
emissions.

```
AttendanceService.markSession()
  → eventBus.emit('attendance.marked', { sessionId, batchId, records })
      → socket subscriber → io.to(`batch:${batchId}`).emit('attendance:marked', …)
      → notification subscriber → enqueue notification fan-out
      → analytics subscriber → invalidate cached summaries
```

This keeps services testable without a socket server, and means adding a new reaction to
an existing domain event does not touch the service that raised it.

---

## 6. Delivery guarantees

**Socket delivery is best-effort and is never the only delivery path.** Every event that
matters is also persisted as a `notifications` document, so an offline user sees it on
next load. The socket is a latency optimisation on top of a durable store, not the store.

On reconnect the client refetches unread notifications and invalidates active queries,
which covers anything missed while disconnected. There is no replay buffer — the durable
store makes one unnecessary.

Rate limiting: 100 client→server events per minute per socket; exceeding it disconnects.
Max 5 concurrent sockets per user, oldest evicted — a user with 40 open tabs should not
be able to exhaust connection slots.

---

## 7. Client integration

`SocketProvider` (`client/src/providers/`) owns the connection lifecycle: connect after
authentication, disconnect on logout, reconnect with backoff, and re-authenticate on
token refresh.

`useSocketEvent(event, handler)` subscribes with automatic cleanup. Most handlers do one
thing — invalidate a React Query key:

```ts
useSocketEvent('attendance:marked', ({ sessionId }) => {
  queryClient.invalidateQueries({ queryKey: ['attendance', 'session', sessionId] });
  queryClient.invalidateQueries({ queryKey: ['attendance', 'summary'] });
});
```

A connection-status indicator appears in the topbar only when disconnected — a
persistent "connected" badge is noise.

---

## 8. Chat

The brief lists "Live Chat". In this scope that is **support ticket messaging**
(`03-data-model.md` §7.3) delivered in real time over the `ticket:{id}` room, not a
general-purpose messaging product. A full chat system (direct messages, group threads,
presence, read receipts, media, moderation) is a separate product surface and is not in
this scope. Flagging this explicitly so the gap is a decision rather than a surprise.
