export const ROLE_KEYS = {
  PLATFORM_ADMIN: 'platform_admin',
  COLLEGE_ADMIN: 'college_admin',
  HOD: 'hod',
  FACULTY: 'faculty',
  TRAINER: 'trainer',
  PLACEMENT_OFFICER: 'placement_officer',
  STUDENT: 'student',
} as const;

export type RoleKey = (typeof ROLE_KEYS)[keyof typeof ROLE_KEYS];

export const ROLE_KEY_VALUES = Object.values(ROLE_KEYS) as RoleKey[];

export const ROLE_SCOPES = {
  PLATFORM: 'platform',
  COLLEGE: 'college',
  DEPARTMENT: 'department',
  SELF: 'self',
} as const;

export type RoleScope = (typeof ROLE_SCOPES)[keyof typeof ROLE_SCOPES];

export interface RoleDefinition {
  key: RoleKey;
  name: string;
  description: string;
  scope: RoleScope;
  portal: 'platform' | 'college' | 'student';
}

export const ROLE_DEFINITIONS: Record<RoleKey, RoleDefinition> = {
  [ROLE_KEYS.PLATFORM_ADMIN]: {
    key: ROLE_KEYS.PLATFORM_ADMIN,
    name: 'Platform Administrator',
    description: 'Full control across every tenant. Approves colleges and manages global data.',
    scope: ROLE_SCOPES.PLATFORM,
    portal: 'platform',
  },
  [ROLE_KEYS.COLLEGE_ADMIN]: {
    key: ROLE_KEYS.COLLEGE_ADMIN,
    name: 'College Administrator',
    description: 'Full control of a single college.',
    scope: ROLE_SCOPES.COLLEGE,
    portal: 'college',
  },
  [ROLE_KEYS.HOD]: {
    key: ROLE_KEYS.HOD,
    name: 'Head of Department',
    description: 'Manages faculty, batches and approvals within their own department.',
    scope: ROLE_SCOPES.DEPARTMENT,
    portal: 'college',
  },
  [ROLE_KEYS.FACULTY]: {
    key: ROLE_KEYS.FACULTY,
    name: 'Faculty',
    description: 'Teaches assigned batches: attendance, assignments, exams and results.',
    scope: ROLE_SCOPES.DEPARTMENT,
    portal: 'college',
  },
  [ROLE_KEYS.TRAINER]: {
    key: ROLE_KEYS.TRAINER,
    name: 'Trainer',
    description: 'Delivers training programmes for assigned batches.',
    scope: ROLE_SCOPES.DEPARTMENT,
    portal: 'college',
  },
  [ROLE_KEYS.PLACEMENT_OFFICER]: {
    key: ROLE_KEYS.PLACEMENT_OFFICER,
    name: 'Placement Officer',
    description: 'Manages companies, drives, applications, interviews and placements.',
    scope: ROLE_SCOPES.COLLEGE,
    portal: 'college',
  },
  [ROLE_KEYS.STUDENT]: {
    key: ROLE_KEYS.STUDENT,
    name: 'Student',
    description: 'Learns, submits, gets assessed and applies for placement.',
    scope: ROLE_SCOPES.SELF,
    portal: 'student',
  },
};

export const COLLEGE_PORTAL_ROLES: RoleKey[] = [
  ROLE_KEYS.COLLEGE_ADMIN,
  ROLE_KEYS.HOD,
  ROLE_KEYS.FACULTY,
  ROLE_KEYS.TRAINER,
  ROLE_KEYS.PLACEMENT_OFFICER,
];

export const STUDENT_PORTAL_ROLES: RoleKey[] = [ROLE_KEYS.STUDENT];
