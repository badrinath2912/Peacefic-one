import mongoose, { type ClientSession, type FilterQuery } from 'mongoose';

import { BaseRepository } from './base.repository';

import { CompanyModel, type CompanyDocument } from '@/models/company.model';
import { InterviewModel, type InterviewDocument } from '@/models/interview.model';
import {
  JobApplicationModel,
  type JobApplicationDocument,
} from '@/models/job-application.model';
import { JobPostingModel, type JobPostingDocument } from '@/models/job-posting.model';
import { PlacementModel, type PlacementDocument } from '@/models/placement.model';

export class CompanyRepository extends BaseRepository<CompanyDocument> {
  constructor() {
    super(CompanyModel, {
      tenantScoped: true,
      sortableFields: ['name', 'createdAt', 'industry', 'status', 'stats.lastDriveAt'],
      searchableFields: ['name', 'legalName', 'industry'],
      filterableFields: ['industry', 'companyType', 'status', 'isVerified'],
      populatableFields: [],
      defaultSort: 'name',
    });
  }

  /** Folded comparison, matching the unique index. */
  async nameExists(name: string, excludeId?: string): Promise<boolean> {
    const filter: FilterQuery<CompanyDocument> = { nameKey: name.trim().toLowerCase() };
    if (excludeId) filter._id = { $ne: new mongoose.Types.ObjectId(excludeId) };
    return this.exists(filter);
  }

  async countByStatus(): Promise<Record<string, number>> {
    const rows = await this.aggregate<{ _id: string; count: number }>([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    return Object.fromEntries(rows.map((row) => [row._id, row.count]));
  }

  async adjustStats(
    companyId: mongoose.Types.ObjectId,
    deltas: Partial<Record<'jobCount' | 'activeJobCount' | 'applicationCount' | 'offerCount', number>>,
    session?: ClientSession,
  ): Promise<void> {
    const increments: Record<string, number> = {};
    for (const [key, value] of Object.entries(deltas)) {
      if (value) increments[`stats.${key}`] = value;
    }

    if (Object.keys(increments).length === 0) return;

    await this.model
      .updateOne(this.scope({ _id: companyId }), { $inc: increments }, { session })
      .exec();
  }

  async touchLastDrive(
    companyId: mongoose.Types.ObjectId,
    at: Date,
    session?: ClientSession,
  ): Promise<void> {
    // `$max` so a back-dated drive never rewinds the most recent one.
    await this.model
      .updateOne(this.scope({ _id: companyId }), { $max: { 'stats.lastDriveAt': at } }, { session })
      .exec();
  }

  /** Distinct industries in this college, for the filter dropdown. */
  async industries(): Promise<string[]> {
    return this.distinct<string>('industry');
  }
}

export class JobPostingRepository extends BaseRepository<JobPostingDocument> {
  constructor() {
    super(JobPostingModel, {
      tenantScoped: true,
      sortableFields: [
        'createdAt',
        'title',
        'applicationCloseAt',
        'driveDate',
        'openings',
        'status',
        'compensation.ctcMax',
      ],
      searchableFields: ['title'],
      filterableFields: [
        'companyId',
        'jobType',
        'workMode',
        'status',
        'driveDate',
        'applicationCloseAt',
      ],
      populatableFields: ['companyId'],
      defaultSort: '-createdAt',
    });
  }

  async findByCompany(companyId: mongoose.Types.ObjectId): Promise<JobPostingDocument[]> {
    return this.findMany({ companyId }, { limit: 500 });
  }

  async countByStatus(): Promise<Record<string, number>> {
    const rows = await this.aggregate<{ _id: string; count: number }>([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    return Object.fromEntries(rows.map((row) => [row._id, row.count]));
  }

  /**
   * Drives a student could apply to right now: published, inside the
   * application window. Eligibility itself is decided by the engine, not here.
   */
  async findOpenPostings(now = new Date()): Promise<JobPostingDocument[]> {
    return this.findMany(
      {
        status: 'published',
        applicationOpenAt: { $lte: now },
        applicationCloseAt: { $gt: now },
      },
      { limit: 500, sort: 'applicationCloseAt' },
    );
  }

  async countOpen(now = new Date()): Promise<number> {
    return this.count({
      status: 'published',
      applicationOpenAt: { $lte: now },
      applicationCloseAt: { $gt: now },
    });
  }

  /** Published postings whose window has passed and which nobody has closed. */
  async findExpired(now = new Date()): Promise<JobPostingDocument[]> {
    return this.findMany(
      { status: 'published', applicationCloseAt: { $lte: now } },
      { limit: 500 },
    );
  }

  async setEligibleCount(
    jobId: mongoose.Types.ObjectId,
    count: number,
    session?: ClientSession,
  ): Promise<void> {
    await this.model
      .updateOne(
        this.scope({ _id: jobId }),
        { $set: { 'stats.eligibleCount': count, 'stats.eligibilityComputedAt': new Date() } },
        { session },
      )
      .exec();
  }

  async populateRelations(jobs: JobPostingDocument[]): Promise<void> {
    await JobPostingModel.populate(jobs, [
      { path: 'companyId', select: 'name logoUrl industry companyType isVerified status' },
      { path: 'eligibility.departmentIds', select: 'name code' },
      { path: 'eligibility.batchIds', select: 'name code' },
    ]);
  }

  async compensationSummary(): Promise<{
    averageCtc: number;
    highestCtc: number;
    totalOpenings: number;
  }> {
    const rows = await this.aggregate<{
      _id: null;
      averageCtc: number | null;
      highestCtc: number | null;
      totalOpenings: number;
    }>([
      { $match: { status: { $in: ['published', 'closed', 'completed'] } } },
      {
        $group: {
          _id: null,
          averageCtc: { $avg: '$compensation.ctcMax' },
          highestCtc: { $max: '$compensation.ctcMax' },
          totalOpenings: { $sum: '$openings' },
        },
      },
    ]);

    const row = rows[0];

    return {
      averageCtc: row?.averageCtc ? Math.round(row.averageCtc) : 0,
      highestCtc: row?.highestCtc ?? 0,
      totalOpenings: row?.totalOpenings ?? 0,
    };
  }
}

export class JobApplicationRepository extends BaseRepository<JobApplicationDocument> {
  constructor() {
    super(JobApplicationModel, {
      tenantScoped: true,
      sortableFields: ['appliedAt', 'status', 'currentRound', 'createdAt'],
      searchableFields: [],
      filterableFields: [
        'jobPostingId',
        'companyId',
        'studentId',
        'departmentId',
        'batchId',
        'status',
        'currentRound',
      ],
      populatableFields: ['studentId', 'jobPostingId', 'companyId'],
      defaultSort: '-appliedAt',
    });
  }

  async findForStudent(
    studentId: mongoose.Types.ObjectId,
  ): Promise<JobApplicationDocument[]> {
    return this.findMany({ studentId }, { sort: '-appliedAt', limit: 500 });
  }

  async findByJobAndStudent(
    jobPostingId: mongoose.Types.ObjectId,
    studentId: mongoose.Types.ObjectId,
  ): Promise<JobApplicationDocument | null> {
    return this.findOne({ jobPostingId, studentId });
  }

  /** Every id a student has already applied to, for marking a job list. */
  async appliedJobIds(studentId: mongoose.Types.ObjectId): Promise<string[]> {
    const rows = await this.model
      .find(this.scope({ studentId }))
      .select('jobPostingId')
      .lean()
      .exec();

    return rows.map((row) => String(row.jobPostingId));
  }

  async countByStatus(
    filter: FilterQuery<JobApplicationDocument> = {},
  ): Promise<Record<string, number>> {
    const rows = await this.aggregate<{ _id: string; count: number }>([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    return Object.fromEntries(rows.map((row) => [row._id, row.count]));
  }

  /** Counts that keep the posting's denormalised stats honest. */
  async statsForJob(jobPostingId: mongoose.Types.ObjectId): Promise<{
    applications: number;
    shortlisted: number;
    selected: number;
  }> {
    const byStatus = await this.countByStatus({ jobPostingId });

    const total = Object.entries(byStatus)
      .filter(([status]) => status !== 'withdrawn')
      .reduce((sum, [, count]) => sum + count, 0);

    return {
      applications: total,
      // A candidate past the shortlist stage was still shortlisted.
      shortlisted:
        (byStatus.shortlisted ?? 0) + (byStatus.in_process ?? 0) + (byStatus.selected ?? 0),
      selected: byStatus.selected ?? 0,
    };
  }

  async populateRelations(applications: JobApplicationDocument[]): Promise<void> {
    await JobApplicationModel.populate(applications, [
      {
        path: 'studentId',
        select: 'rollNumber userId academics',
        populate: { path: 'userId', select: 'firstName lastName email' },
      },
      { path: 'jobPostingId', select: 'title jobType workMode applicationCloseAt status' },
      { path: 'companyId', select: 'name logoUrl industry' },
    ]);
  }
}

export class PlacementRepository extends BaseRepository<PlacementDocument> {
  constructor() {
    super(PlacementModel, {
      tenantScoped: true,
      sortableFields: ['offerDate', 'joiningDate', 'package.ctc', 'status', 'createdAt'],
      searchableFields: ['designation', 'location'],
      filterableFields: [
        'studentId',
        'companyId',
        'departmentId',
        'batchId',
        'jobPostingId',
        'applicationId',
        'academicYear',
        'status',
        'jobType',
        'isPrimaryOffer',
        'isVerified',
      ],
      populatableFields: ['studentId', 'companyId', 'jobPostingId', 'applicationId'],
      defaultSort: '-offerDate',
    });
  }

  async findForStudent(studentId: mongoose.Types.ObjectId): Promise<PlacementDocument[]> {
    return this.findMany({ studentId }, { sort: '-offerDate', limit: 200 });
  }

  async findByApplication(
    applicationId: mongoose.Types.ObjectId,
  ): Promise<PlacementDocument | null> {
    return this.findOne({ applicationId });
  }

  /**
   * Clears the primary flag on a student's other offers for the same year, so
   * the partial unique index never rejects a new primary.
   */
  async clearPrimary(
    studentId: mongoose.Types.ObjectId,
    academicYear: string,
    exceptId?: mongoose.Types.ObjectId,
    session?: ClientSession,
  ): Promise<void> {
    const filter: FilterQuery<PlacementDocument> = {
      studentId,
      academicYear,
      isPrimaryOffer: true,
    };

    if (exceptId) filter._id = { $ne: exceptId };

    await this.updateMany(filter, { $set: { isPrimaryOffer: false } }, session);
  }

  async countByStatus(
    filter: FilterQuery<PlacementDocument> = {},
  ): Promise<Record<string, number>> {
    const rows = await this.aggregate<{ _id: string; count: number }>([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    return Object.fromEntries(rows.map((row) => [row._id, row.count]));
  }

  /**
   * Package figures across offers that were actually taken up.
   *
   * Counts primary offers only: a student holding three offers is one
   * placement, and averaging all three would overstate the cohort.
   */
  async packageSummary(filter: FilterQuery<PlacementDocument> = {}): Promise<{
    placedStudents: number;
    averageCtc: number;
    highestCtc: number;
    lowestCtc: number;
    medianCtc: number;
  }> {
    const rows = await this.aggregate<{ _id: null; ctcs: number[]; count: number }>([
      {
        $match: {
          ...filter,
          isPrimaryOffer: true,
          status: { $in: ['offered', 'accepted', 'joined'] },
        },
      },
      { $group: { _id: null, ctcs: { $push: '$package.ctc' }, count: { $sum: 1 } } },
    ]);

    const row = rows[0];
    if (!row || row.count === 0) {
      return { placedStudents: 0, averageCtc: 0, highestCtc: 0, lowestCtc: 0, medianCtc: 0 };
    }

    const sorted = [...row.ctcs].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);

    // The median is the more honest headline: one outlier offer skews a mean
    // badly on a cohort of a few hundred.
    const median =
      sorted.length % 2 === 0
        ? Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2)
        : (sorted[middle] ?? 0);

    return {
      placedStudents: row.count,
      averageCtc: Math.round(sorted.reduce((sum, ctc) => sum + ctc, 0) / sorted.length),
      highestCtc: sorted[sorted.length - 1] ?? 0,
      lowestCtc: sorted[0] ?? 0,
      medianCtc: median,
    };
  }

  /** Placed counts per department, for the placement report. */
  async countByDepartment(
    filter: FilterQuery<PlacementDocument> = {},
  ): Promise<Array<{ departmentId: string; placed: number; highestCtc: number }>> {
    const rows = await this.aggregate<{
      _id: mongoose.Types.ObjectId;
      placed: number;
      highestCtc: number;
    }>([
      {
        $match: {
          ...filter,
          isPrimaryOffer: true,
          status: { $in: ['offered', 'accepted', 'joined'] },
        },
      },
      {
        $group: {
          _id: '$departmentId',
          placed: { $sum: 1 },
          highestCtc: { $max: '$package.ctc' },
        },
      },
    ]);

    return rows.map((row) => ({
      departmentId: String(row._id),
      placed: row.placed,
      highestCtc: row.highestCtc,
    }));
  }

  async countByBatch(
    filter: FilterQuery<PlacementDocument> = {},
  ): Promise<Array<{ batchId: string; placed: number; highestCtc: number }>> {
    const rows = await this.aggregate<{
      _id: mongoose.Types.ObjectId;
      placed: number;
      highestCtc: number;
    }>([
      {
        $match: {
          ...filter,
          isPrimaryOffer: true,
          status: { $in: ['offered', 'accepted', 'joined'] },
        },
      },
      {
        $group: { _id: '$batchId', placed: { $sum: 1 }, highestCtc: { $max: '$package.ctc' } },
      },
    ]);

    return rows.map((row) => ({
      batchId: String(row._id),
      placed: row.placed,
      highestCtc: row.highestCtc,
    }));
  }

  /** The companies that made the most offers, for the recruiter report. */
  async topRecruiters(
    filter: FilterQuery<PlacementDocument> = {},
    limit = 10,
  ): Promise<Array<{ companyId: string; offers: number; highestCtc: number }>> {
    const rows = await this.aggregate<{
      _id: mongoose.Types.ObjectId;
      offers: number;
      highestCtc: number;
    }>([
      { $match: { ...filter, status: { $in: ['offered', 'accepted', 'joined'] } } },
      {
        $group: { _id: '$companyId', offers: { $sum: 1 }, highestCtc: { $max: '$package.ctc' } },
      },
      { $sort: { offers: -1 } },
      { $limit: limit },
    ]);

    return rows.map((row) => ({
      companyId: String(row._id),
      offers: row.offers,
      highestCtc: row.highestCtc,
    }));
  }

  async populateRelations(placements: PlacementDocument[]): Promise<void> {
    await PlacementModel.populate(placements, [
      {
        path: 'studentId',
        select: 'rollNumber userId departmentId batchId',
        populate: { path: 'userId', select: 'firstName lastName email' },
      },
      { path: 'companyId', select: 'name logoUrl industry' },
      { path: 'jobPostingId', select: 'title jobType workMode' },
      { path: 'applicationId', select: 'status appliedAt' },
    ]);
  }
}

export class InterviewRepository extends BaseRepository<InterviewDocument> {
  constructor() {
    super(InterviewModel, {
      tenantScoped: true,
      sortableFields: ['scheduledAt', 'roundOrder', 'status', 'createdAt'],
      // Round names are the only free text worth matching; everything else a
      // caller would search for lives on a relation.
      searchableFields: ['roundName'],
      filterableFields: [
        'applicationId',
        'studentId',
        'jobPostingId',
        'companyId',
        'status',
        'mode',
        'roundOrder',
        'scheduledAt',
        'result.status',
      ],
      populatableFields: ['studentId', 'jobPostingId', 'companyId', 'applicationId'],
      defaultSort: '-scheduledAt',
    });
  }

  async findForStudent(studentId: mongoose.Types.ObjectId): Promise<InterviewDocument[]> {
    return this.findMany({ studentId }, { sort: '-scheduledAt', limit: 500 });
  }

  async findByApplicationAndRound(
    applicationId: mongoose.Types.ObjectId,
    roundOrder: number,
  ): Promise<InterviewDocument | null> {
    return this.findOne({ applicationId, roundOrder });
  }

  /** Every round already scheduled for a set of applications, for bulk work. */
  async findScheduledRounds(
    applicationIds: mongoose.Types.ObjectId[],
    roundOrder: number,
  ): Promise<InterviewDocument[]> {
    return this.findMany(
      { applicationId: { $in: applicationIds }, roundOrder },
      { limit: 1000 },
    );
  }

  async countByStatus(
    filter: FilterQuery<InterviewDocument> = {},
  ): Promise<Record<string, number>> {
    const rows = await this.aggregate<{ _id: string; count: number }>([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    return Object.fromEntries(rows.map((row) => [row._id, row.count]));
  }

  async countByResult(
    filter: FilterQuery<InterviewDocument> = {},
  ): Promise<Record<string, number>> {
    const rows = await this.aggregate<{ _id: string; count: number }>([
      { $match: filter },
      { $group: { _id: '$result.status', count: { $sum: 1 } } },
    ]);

    return Object.fromEntries(rows.map((row) => [row._id, row.count]));
  }

  /** Interviews still to come, for the office dashboard and reminders. */
  async countUpcoming(now = new Date()): Promise<number> {
    return this.count({
      scheduledAt: { $gte: now },
      status: { $in: ['scheduled', 'confirmed', 'rescheduled'] },
    });
  }

  async populateRelations(interviews: InterviewDocument[]): Promise<void> {
    await InterviewModel.populate(interviews, [
      {
        path: 'studentId',
        select: 'rollNumber userId',
        populate: { path: 'userId', select: 'firstName lastName email' },
      },
      { path: 'jobPostingId', select: 'title jobType workMode' },
      { path: 'companyId', select: 'name logoUrl industry' },
      { path: 'applicationId', select: 'status currentRound' },
    ]);
  }
}
