export const SOCKET_EVENTS = {
  // Server -> client
  NOTIFICATION_NEW: 'notification:new',
  NOTIFICATION_READ: 'notification:read',
  ANNOUNCEMENT_PUBLISHED: 'announcement:published',

  ATTENDANCE_MARKED: 'attendance:marked',
  ATTENDANCE_UPDATED: 'attendance:updated',

  ASSIGNMENT_PUBLISHED: 'assignment:published',
  ASSIGNMENT_GRADED: 'assignment:graded',

  EXAM_PUBLISHED: 'exam:published',
  EXAM_RESULT_PUBLISHED: 'exam:result_published',
  EXAM_ATTEMPT_FLAGGED: 'exam:attempt_flagged',

  RESULT_PUBLISHED: 'result:published',

  LIVECLASS_STARTING: 'liveclass:starting',
  LIVECLASS_STARTED: 'liveclass:started',

  JOB_PUBLISHED: 'job:published',
  APPLICATION_STATUS_CHANGED: 'application:status_changed',
  INTERVIEW_SCHEDULED: 'interview:scheduled',
  INTERVIEW_RESCHEDULED: 'interview:rescheduled',
  PLACEMENT_CONFIRMED: 'placement:confirmed',

  TRAINING_STATUS_CHANGED: 'training:status_changed',

  TICKET_MESSAGE: 'ticket:message',
  TICKET_STATUS_CHANGED: 'ticket:status_changed',

  JOB_PROGRESS: 'job:progress',
  JOB_COMPLETED: 'job:completed',
  JOB_FAILED: 'job:failed',

  AUTH_TOKEN_EXPIRING: 'auth:token_expiring',
  AUTH_SESSION_REVOKED: 'auth:session_revoked',

  // Client -> server
  CLIENT_AUTH_REFRESH: 'auth:refresh',
  CLIENT_PRESENCE_PING: 'presence:ping',
  CLIENT_TICKET_TYPING: 'ticket:typing',
  CLIENT_NOTIFICATION_MARK_READ: 'notification:mark_read',
} as const;

export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];

export const SOCKET_ROOMS = {
  user: (userId: string) => `user:${userId}`,
  college: (collegeId: string) => `college:${collegeId}`,
  collegeRole: (collegeId: string, roleKey: string) => `college:${collegeId}:role:${roleKey}`,
  batch: (batchId: string) => `batch:${batchId}`,
  department: (departmentId: string) => `department:${departmentId}`,
  job: (jobId: string) => `job:${jobId}`,
  ticket: (ticketId: string) => `ticket:${ticketId}`,
  examProctor: (examId: string) => `exam:${examId}:proctor`,
} as const;

export interface NotificationPayload {
  notification: {
    id: string;
    type: string;
    category: string;
    priority: string;
    title: string;
    message: string;
    actionUrl: string | null;
    createdAt: string;
  };
  unreadCount: number;
}

export interface JobProgressPayload {
  jobId: string;
  type: string;
  percent: number;
  processed: number;
  total: number;
}

export interface JobCompletedPayload {
  jobId: string;
  type: string;
  result?: unknown;
  downloadUrl?: string;
}
