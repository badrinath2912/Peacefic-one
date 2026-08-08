import type { Interview } from '@/api/placement-queries';

/** One interview, shaped exactly as the API returns it. */
export function interviewFixture(overrides: Partial<Interview> = {}): Interview {
  return {
    id: 'interview-1',
    applicationId: { id: 'application-1', status: 'shortlisted', currentRound: 1 },
    studentId: {
      id: 'student-1',
      rollNumber: 'CS22B001',
      userId: { firstName: 'Meera', lastName: 'Iyer', email: 'meera@example.edu' },
    },
    jobPostingId: {
      id: 'job-1',
      title: 'Software Engineer',
      jobType: 'full_time',
      workMode: 'hybrid',
    },
    companyId: {
      id: 'company-1',
      name: 'Acme Technologies',
      logoUrl: null,
      industry: 'Information Technology',
    },
    roundOrder: 2,
    roundName: 'Technical Interview',
    type: 'technical_interview',
    mode: 'online',
    scheduledAt: '2026-02-10T09:30:00.000Z',
    durationMinutes: 45,
    venue: null,
    meetingLink: 'https://meet.example.com/abc',
    interviewers: [
      { name: 'Priya Menon', designation: 'Engineering Manager', email: 'priya@acme.example.com' },
    ],
    panelNumber: '1',
    instructions: 'Have your ID ready.',
    status: 'scheduled',
    confirmedAt: null,
    cancelledAt: null,
    cancellationReason: null,
    result: {
      status: 'pending',
      score: null,
      maxScore: null,
      feedback: null,
      strengths: [],
      improvements: [],
      recordedAt: null,
    },
    rescheduleRequest: null,
    history: [
      {
        from: null,
        to: 'scheduled',
        actedByRole: 'staff',
        at: '2026-02-01T09:00:00.000Z',
        reason: null,
      },
    ],
    ...overrides,
  };
}

/** Every office action label, for sweeping a student page. */
export const OFFICE_ACTION_LABELS = [
  /^Move$/,
  /^Cancel$/i,
  /record result/i,
  /mark complete/i,
  /mark as no-show/i,
  /^Start$/,
  /^Reopen$/,
  /^Schedule$/,
] as const;
