import {
  eligibilityPrefilter,
  evaluateEligibility,
  type EligibilityInput,
  type EligibilityResult,
  type StudentSnapshot,
} from '@peacefic/shared';
import mongoose from 'mongoose';

import type { JobPostingDocument } from '@/models/job-posting.model';
import type { StudentDocument } from '@/models/student.model';
import type { AttendanceSummaryRepository } from '@/repositories/attendance.repository';
import type { BatchRepository } from '@/repositories/batch.repository';
import type { StudentRepository } from '@/repositories/student.repository';

/**
 * The server-side half of eligibility.
 *
 * The rules themselves live in `@peacefic/shared` as a pure function. This
 * service does one thing the pure function must not: assemble a
 * `StudentSnapshot` from the college's existing records.
 *
 * Nothing here recomputes a CGPA, a backlog count or an attendance
 * percentage. `academics.currentCgpa`, `academics.activeBacklogs` and
 * `academics.totalBacklogs` are written by transcript generation in the
 * Examination module; attendance comes from the Attendance module's overall
 * summary. Duplicating either calculation is how two parts of a product start
 * disagreeing about whether a student passed.
 */
export class EligibilityService {
  constructor(
    private readonly studentRepository: StudentRepository,
    private readonly batchRepository: BatchRepository,
    private readonly attendanceSummaryRepository: AttendanceSummaryRepository,
  ) {}

  /** Builds the snapshot for one student. */
  async snapshotFor(student: StudentDocument): Promise<StudentSnapshot> {
    const [snapshot] = await this.snapshotsFor([student]);
    return snapshot!;
  }

  /**
   * Builds snapshots for many students in a fixed number of queries.
   *
   * Batches and attendance summaries are fetched once for the whole set rather
   * than per student — evaluating a 2,000-student cohort one round trip at a
   * time is the difference between a page load and a timeout.
   */
  async snapshotsFor(students: StudentDocument[]): Promise<StudentSnapshot[]> {
    if (students.length === 0) return [];

    const batchIds = [...new Set(students.map((student) => String(student.batchId)))];
    const studentIds = students.map((student) => student._id);

    const [batches, summaries] = await Promise.all([
      this.batchRepository.findMany(
        { _id: { $in: batchIds.map((id) => new mongoose.Types.ObjectId(id)) } },
        { limit: 500 },
      ),
      this.attendanceSummaryRepository.findMany(
        {
          studentId: { $in: studentIds },
          period: 'overall',
          periodKey: 'overall',
          courseId: null,
        },
        { limit: 5000 },
      ),
    ]);

    const graduationYearByBatch = new Map(
      batches.map((batch) => [String(batch._id), batch.graduationYear]),
    );

    const attendanceByStudent = new Map(
      summaries.map((summary) => [String(summary.studentId), summary.percentage]),
    );

    return students.map((student) => ({
      studentId: String(student._id),
      departmentId: String(student.departmentId),
      batchId: String(student.batchId),
      graduationYear: graduationYearByBatch.get(String(student.batchId)) ?? null,
      gender: student.gender ?? null,

      cgpa: student.academics.currentCgpa,
      activeBacklogs: student.academics.activeBacklogs,
      totalBacklogs: student.academics.totalBacklogs,

      tenthPercent: student.academics.tenthPercent,
      twelfthPercent: student.academics.twelfthPercent,
      diplomaPercent: student.academics.diplomaPercent,
      yearGap: student.academics.yearGap,

      // Absent rather than zero when nothing has been recorded — the engine
      // treats the two differently, and so must this.
      attendancePercent: attendanceByStudent.get(String(student._id)) ?? null,

      skills: student.skills.map((skill) => skill.name),
      // A student's programme is their qualification for matching purposes.
      qualifications: student.programme ? [student.programme] : [],

      isPlaced: student.placement.isPlaced,
      isEligibleForPlacement: student.placement.isEligible,
      eligibilityNote: student.placement.eligibilityNote,
    }));
  }

  /**
   * Whether one student may apply to one job.
   *
   * This is the single authority. Every path that can create an application
   * calls it, and it re-reads the student's live record rather than trusting
   * anything the caller supplies.
   */
  async check(student: StudentDocument, job: JobPostingDocument): Promise<EligibilityResult> {
    const snapshot = await this.snapshotFor(student);
    return evaluateEligibility(snapshot, this.criteriaOf(job));
  }

  /**
   * Evaluates an already-built snapshot against a job.
   *
   * For the case of one student against many jobs — the student's job list —
   * where rebuilding the snapshot per posting would be one round trip per row.
   */
  evaluateAgainst(snapshot: StudentSnapshot, job: JobPostingDocument): EligibilityResult {
    return evaluateEligibility(snapshot, this.criteriaOf(job));
  }

  /**
   * Every student eligible for a job.
   *
   * The prefilter narrows the set with the rules a Mongo query can express;
   * the engine then decides on what survives. The prefilter is an optimisation
   * and never the verdict — a rule it cannot express is still enforced.
   */
  async eligibleStudents(job: JobPostingDocument): Promise<{
    students: StudentDocument[];
    snapshots: Map<string, StudentSnapshot>;
  }> {
    const criteria = this.criteriaOf(job);

    const candidates = await this.studentRepository.findMany(
      eligibilityPrefilter(criteria) as Record<string, unknown>,
      { limit: 5000 },
    );

    const snapshots = await this.snapshotsFor(candidates);
    const byId = new Map(snapshots.map((snapshot) => [snapshot.studentId, snapshot]));

    const students = candidates.filter((student) => {
      const snapshot = byId.get(String(student._id));
      return snapshot ? evaluateEligibility(snapshot, criteria).eligible : false;
    });

    return { students, snapshots: byId };
  }

  /** How many students a job is open to, without materialising the list. */
  async countEligible(job: JobPostingDocument): Promise<number> {
    const { students } = await this.eligibleStudents(job);
    return students.length;
  }

  /**
   * The stored eligibility, shaped for the engine.
   *
   * ObjectIds become strings because the engine is framework-independent and
   * must not know what a Mongo id is.
   */
  private criteriaOf(job: JobPostingDocument): EligibilityInput {
    const eligibility = job.eligibility;

    return {
      departmentIds: (eligibility.departmentIds ?? []).map(String),
      batchIds: (eligibility.batchIds ?? []).map(String),
      graduationYears: eligibility.graduationYears ?? [],
      minCgpa: eligibility.minCgpa,
      maxActiveBacklogs: eligibility.maxActiveBacklogs,
      maxTotalBacklogs: eligibility.maxTotalBacklogs,
      minTenthPercent: eligibility.minTenthPercent,
      minTwelfthPercent: eligibility.minTwelfthPercent,
      minDiplomaPercent: eligibility.minDiplomaPercent,
      minAttendancePercent: eligibility.minAttendancePercent,
      maxYearGap: eligibility.maxYearGap,
      genderRestriction: eligibility.genderRestriction,
      requiredSkills: eligibility.requiredSkills ?? [],
      qualifications: eligibility.qualifications ?? [],
      allowPlacedStudents: eligibility.allowPlacedStudents,
      customCriteria: eligibility.customCriteria,
    };
  }
}
