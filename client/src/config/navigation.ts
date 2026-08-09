import {
  Award,
  BarChart3,
  Bell,
  BookOpen,
  Briefcase,
  Building2,
  CalendarCheck,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LifeBuoy,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Hidden unless the user holds at least one of these. */
  permissions?: string[];
  badgeKey?: 'notifications' | 'tickets';
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const COLLEGE_NAV: NavSection[] = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', href: '/college', icon: LayoutDashboard },
      {
        label: 'Analytics',
        href: '/college/analytics',
        icon: BarChart3,
        permissions: ['analytics:read', 'analytics:read_all'],
      },
    ],
  },
  {
    label: 'Institution',
    items: [
      {
        label: 'Departments',
        href: '/college/departments',
        icon: Building2,
        permissions: ['department:read'],
      },
      { label: 'Batches', href: '/college/batches', icon: GraduationCap, permissions: ['batch:read'] },
      {
        label: 'Students',
        href: '/college/students',
        icon: Users,
        permissions: ['student:read', 'student:read_all'],
      },
      { label: 'Faculty', href: '/college/faculty', icon: Users, permissions: ['faculty:read'] },
    ],
  },
  {
    label: 'Academics',
    items: [
      {
        label: 'Attendance',
        href: '/college/attendance',
        icon: CalendarCheck,
        permissions: ['attendance:read', 'attendance:read_all', 'attendance:mark'],
      },
      { label: 'Courses', href: '/college/courses', icon: BookOpen, permissions: ['course:read'] },
      {
        label: 'Examinations',
        href: '/college/examinations',
        icon: FileSpreadsheet,
        permissions: ['exam:read'],
      },
      {
        label: 'Training requests',
        href: '/college/training',
        icon: ClipboardList,
        permissions: ['training:read'],
      },
    ],
  },
  {
    label: 'Placement',
    items: [
      {
        label: 'Placements',
        href: '/college/placements',
        icon: Briefcase,
        permissions: ['placement:read_all', 'placement:report'],
      },
      {
        label: 'Companies',
        href: '/college/placements/companies',
        icon: Building2,
        permissions: ['company:read'],
      },
      {
        label: 'Job postings',
        href: '/college/placements/jobs',
        icon: ClipboardList,
        permissions: ['job:read'],
      },
      {
        label: 'Applications',
        href: '/college/placements/applications',
        icon: FileSpreadsheet,
        permissions: ['application:read_all'],
      },
      {
        label: 'Offers',
        href: '/college/placements/offers',
        icon: Award,
        permissions: ['placement:read_all'],
      },
      {
        label: 'Interviews',
        href: '/college/placements/interviews',
        icon: CalendarCheck,
        permissions: ['interview:read_all'],
      },
      { label: 'Reports', href: '/college/reports', icon: FileText, permissions: ['report:generate'] },
    ],
  },
  {
    label: 'Administration',
    items: [
      {
        label: 'Notifications',
        href: '/college/notifications',
        icon: Bell,
        permissions: ['notification:read'],
        badgeKey: 'notifications',
      },
      { label: 'Audit log', href: '/college/audit', icon: ScrollText, permissions: ['audit:read'] },
      {
        label: 'Support',
        href: '/college/support',
        icon: LifeBuoy,
        permissions: ['ticket:read', 'ticket:read_all'],
        badgeKey: 'tickets',
      },
      { label: 'Roles', href: '/college/roles', icon: ShieldCheck, permissions: ['role:read'] },
      { label: 'Settings', href: '/college/settings', icon: Settings, permissions: ['settings:read'] },
    ],
  },
];

export const STUDENT_NAV: NavSection[] = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', href: '/student', icon: LayoutDashboard }],
  },
  {
    label: 'Learning',
    items: [
      { label: 'Courses', href: '/student/courses', icon: BookOpen, permissions: ['course:read'] },
      {
        label: 'Assignments',
        href: '/student/assignments',
        icon: ClipboardList,
        permissions: ['assignment:read'],
      },
      { label: 'Assessments', href: '/student/exams', icon: FileText, permissions: ['exam:read'] },
      {
        label: 'Attendance',
        href: '/student/attendance',
        icon: CalendarCheck,
        permissions: ['attendance:read_own'],
      },
    ],
  },
  {
    label: 'Academics',
    items: [
      {
        label: 'Results',
        href: '/student/results',
        icon: Award,
        permissions: ['result:read_own'],
      },
      {
        label: 'Transcript',
        href: '/student/transcript',
        icon: ScrollText,
        permissions: ['transcript:read_own'],
      },
    ],
  },
  {
    label: 'Placement',
    items: [
      { label: 'Jobs', href: '/student/jobs', icon: Briefcase, permissions: ['job:read'] },
      {
        label: 'My applications',
        href: '/student/applications',
        icon: ClipboardList,
        permissions: ['application:read'],
      },
      {
        label: 'Interviews',
        href: '/student/interviews',
        icon: CalendarCheck,
        permissions: ['interview:read'],
      },
    ],
  },
  {
    label: 'Account',
    items: [
      {
        label: 'Notifications',
        href: '/student/notifications',
        icon: Bell,
        permissions: ['notification:read'],
        badgeKey: 'notifications',
      },
      { label: 'Profile', href: '/student/profile', icon: Users, permissions: ['student:read_own'] },
      {
        label: 'Support',
        href: '/student/support',
        icon: LifeBuoy,
        permissions: ['ticket:read'],
        badgeKey: 'tickets',
      },
      { label: 'Settings', href: '/student/settings', icon: Settings },
    ],
  },
];
