'use client';

import type { JobEligibility } from '@/api/placement-queries';
import { Alert } from '@/components/ui/alert';
import { relationField } from '@/lib/placement-display';

/**
 * The eligibility block as a placement officer would read it aloud.
 *
 * Only criteria that were actually set appear — an unset rule is not a rule,
 * and listing sixteen "any" rows would bury the three that matter. Nothing is
 * evaluated here; the engine on the server decides who qualifies.
 */
export function EligibilitySummary({ eligibility }: { eligibility: JobEligibility }) {
  const rules: Array<{ label: string; value: string }> = [];

  const names = (relations: JobEligibility['departmentIds']): string =>
    relations.map((relation) => relationField(relation, 'name')).join(', ');

  if (eligibility.departmentIds.length > 0) {
    rules.push({ label: 'Departments', value: names(eligibility.departmentIds) });
  }
  if (eligibility.batchIds.length > 0) {
    rules.push({ label: 'Batches', value: names(eligibility.batchIds) });
  }
  if (eligibility.graduationYears.length > 0) {
    rules.push({ label: 'Graduating in', value: eligibility.graduationYears.join(', ') });
  }
  if (eligibility.minCgpa !== null) {
    rules.push({ label: 'CGPA', value: `${eligibility.minCgpa} and above` });
  }
  if (eligibility.maxActiveBacklogs !== null) {
    rules.push({
      label: 'Active backlogs',
      value:
        eligibility.maxActiveBacklogs === 0
          ? 'None outstanding'
          : `At most ${eligibility.maxActiveBacklogs}`,
    });
  }
  if (eligibility.maxTotalBacklogs !== null) {
    rules.push({ label: 'Backlogs ever', value: `At most ${eligibility.maxTotalBacklogs}` });
  }
  if (eligibility.minTenthPercent !== null) {
    rules.push({ label: 'Class X', value: `${eligibility.minTenthPercent}% and above` });
  }
  if (eligibility.minTwelfthPercent !== null) {
    rules.push({ label: 'Class XII', value: `${eligibility.minTwelfthPercent}% and above` });
  }
  if (eligibility.minDiplomaPercent !== null) {
    rules.push({ label: 'Diploma', value: `${eligibility.minDiplomaPercent}% and above` });
  }
  if (eligibility.minAttendancePercent !== null) {
    rules.push({ label: 'Attendance', value: `${eligibility.minAttendancePercent}% and above` });
  }
  if (eligibility.maxYearGap !== null) {
    rules.push({
      label: 'Year gap',
      value: eligibility.maxYearGap === 0 ? 'No gap' : `At most ${eligibility.maxYearGap} year(s)`,
    });
  }
  if (eligibility.genderRestriction !== 'any') {
    rules.push({ label: 'Gender', value: 'Women only' });
  }
  if (eligibility.requiredSkills.length > 0) {
    rules.push({ label: 'Skills', value: eligibility.requiredSkills.join(', ') });
  }
  if (eligibility.qualifications.length > 0) {
    rules.push({ label: 'Qualifications', value: eligibility.qualifications.join(', ') });
  }
  if (eligibility.allowPlacedStudents) {
    rules.push({ label: 'Already placed', value: 'May apply' });
  }

  return (
    <div className="space-y-4">
      {rules.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No criteria set — every student in the college qualifies, unless they are already placed
          or blocked from placement.
        </p>
      ) : (
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {rules.map((rule) => (
            <div key={rule.label} className="min-w-0">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {rule.label}
              </dt>
              <dd className="mt-0.5 break-words text-sm">{rule.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {!eligibility.allowPlacedStudents ? (
        <p className="text-xs text-muted-foreground">
          Students who already hold an offer are excluded, as is anyone blocked from placement.
        </p>
      ) : null}

      {eligibility.customCriteria ? (
        <Alert tone="info" title="Conditions in the company's words">
          <span className="whitespace-pre-line">{eligibility.customCriteria}</span>
          <span className="mt-1.5 block text-xs opacity-80">
            Shown to students but never checked automatically.
          </span>
        </Alert>
      ) : null}
    </div>
  );
}
