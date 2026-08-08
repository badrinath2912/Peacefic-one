import {
  hasPermission,
  type BulkOperationResult,
  type CreateCompanyInput,
  type UpdateCompanyInput,
  type VerifyCompanyInput,
} from '@peacefic/shared';
import mongoose from 'mongoose';

import type { AuditService } from './audit.service';
import type { StorageService } from './storage/storage.service';

import { requestContext } from '@/config/request-context';
import { BusinessRuleError, DuplicateResourceError, NotFoundError, ValidationError } from '@/errors';
import type { CompanyDocument } from '@/models/company.model';
import type { ListOptions, PaginatedResult } from '@/repositories/base.repository';
import type { CompanyRepository, JobPostingRepository } from '@/repositories/placement.repository';
import { toPlain } from '@/utils/mongo';

export class CompanyService {
  constructor(
    private readonly companyRepository: CompanyRepository,
    private readonly jobRepository: JobPostingRepository,
    private readonly storageService: StorageService,
    private readonly auditService: AuditService,
  ) {}

  async list(options: ListOptions): Promise<PaginatedResult<CompanyDocument>> {
    return this.companyRepository.paginate(options);
  }

  async get(id: string): Promise<CompanyDocument> {
    return this.companyRepository.findByIdOrFail(id);
  }

  /**
   * Whether the caller may see recruiter contact details.
   *
   * Students hold `company:read` so they can see which companies visit campus,
   * which is useful. They must not get HR names, direct dials and personal
   * email addresses — that is exactly what gets harvested and spammed, and a
   * recruiter gave those details to the placement office, not to 4,000
   * students. Managing a company is the bar for seeing how to contact it.
   */
  callerMaySeeContacts(): boolean {
    return hasPermission(requestContext.tryGet()?.permissions ?? [], 'company:update');
  }

  /** Strips recruiter contact details for a caller who may not see them. */
  redact(company: CompanyDocument): Record<string, unknown> {
    const plain = toPlain(company);

    plain.id = String(company._id);
    delete plain._id;
    delete plain.__v;
    delete plain.deletedAt;
    delete plain.deletedBy;

    if (!this.callerMaySeeContacts()) {
      plain.contacts = [];
      plain.email = null;
      plain.phone = null;
    }

    return plain;
  }

  redactMany(companies: CompanyDocument[]): Record<string, unknown>[] {
    // Resolved once rather than per row — the permission cannot change
    // partway through a single request.
    const maySeeContacts = this.callerMaySeeContacts();

    return companies.map((company) => {
      const plain = this.redact(company);
      if (!maySeeContacts) plain.contacts = [];
      return plain;
    });
  }

  /** Detail view: the company, its drives and how they have gone. */
  async getProfile(id: string) {
    const company = await this.get(id);

    const jobs = await this.jobRepository.findMany(
      { companyId: company._id },
      { sort: '-createdAt', limit: 50 },
    );

    const byStatus: Record<string, number> = {};
    for (const job of jobs) byStatus[job.status] = (byStatus[job.status] ?? 0) + 1;

    return {
      company,
      jobs,
      counts: {
        total: jobs.length,
        published: byStatus.published ?? 0,
        draft: byStatus.draft ?? 0,
        closed: byStatus.closed ?? 0,
        applications: jobs.reduce((sum, job) => sum + job.stats.applicationCount, 0),
        selected: jobs.reduce((sum, job) => sum + job.stats.selectedCount, 0),
      },
    };
  }

  async create(input: CreateCompanyInput): Promise<CompanyDocument> {
    if (await this.companyRepository.nameExists(input.name)) {
      throw new DuplicateResourceError(`A company named "${input.name}" already exists.`, [
        { field: 'name', message: 'Already on the register' },
      ]);
    }

    const company = await this.companyRepository.create({
      name: input.name,
      legalName: input.legalName ?? null,
      logoUrl: input.logoUrl ?? null,
      logoKey: input.logoKey ?? null,
      website: input.website ?? null,
      industry: input.industry,
      companyType: input.companyType,
      sizeRange: input.sizeRange ?? null,
      headquarters: input.headquarters ?? null,
      locations: input.locations,
      description: input.description ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      contacts: input.contacts,
      // A new company is unverified until someone checks it. Recruitment fraud
      // is real, so this is never granted on creation.
      isVerified: false,
      status: 'active',
    } as Partial<CompanyDocument>);

    await this.auditService.log({
      action: 'company.created',
      category: 'data',
      entity: { type: 'Company', id: company._id, label: company.name },
      metadata: { industry: company.industry, companyType: company.companyType },
    });

    return company;
  }

  async update(id: string, input: UpdateCompanyInput): Promise<CompanyDocument> {
    const existing = await this.companyRepository.findByIdOrFail(id);

    if (input.name && (await this.companyRepository.nameExists(input.name, id))) {
      throw new DuplicateResourceError(`A company named "${input.name}" already exists.`, [
        { field: 'name', message: 'Already on the register' },
      ]);
    }

    // Reinstating a blacklisted company is its own decision, made through the
    // blacklist endpoint where a reason is on the record.
    if (input.status && existing.status === 'blacklisted' && input.status !== 'blacklisted') {
      throw new BusinessRuleError(
        'A blacklisted company is reinstated through the blacklist endpoint, not a status edit.',
      );
    }

    const patch: Record<string, unknown> = {};
    const assign = (key: string, value: unknown): void => {
      if (value !== undefined) patch[key] = value;
    };

    assign('name', input.name);
    assign('legalName', input.legalName);
    assign('logoUrl', input.logoUrl);
    assign('logoKey', input.logoKey);
    assign('website', input.website);
    assign('industry', input.industry);
    assign('companyType', input.companyType);
    assign('sizeRange', input.sizeRange);
    assign('headquarters', input.headquarters);
    assign('locations', input.locations);
    assign('description', input.description);
    assign('email', input.email);
    assign('phone', input.phone);
    assign('contacts', input.contacts);
    assign('status', input.status);

    // Kept in step with `name` so the unique index still catches a rename onto
    // an existing company.
    if (input.name) patch.nameKey = input.name.trim().toLowerCase();

    const updated = await this.companyRepository.updateByIdOrFail(id, { $set: patch });

    await this.auditService.log({
      action: 'company.updated',
      category: 'data',
      entity: { type: 'Company', id: updated._id, label: updated.name },
      changes: this.auditService.diff(toPlain(existing), patch, Object.keys(patch)),
    });

    return updated;
  }

  /**
   * Verification is a statement that someone checked this company is real.
   * It is separate from an ordinary edit because a student deciding whether to
   * share their details with a recruiter relies on it.
   */
  async setVerification(id: string, input: VerifyCompanyInput): Promise<CompanyDocument> {
    const company = await this.companyRepository.findByIdOrFail(id);
    const userId = requestContext.get().userId;

    const updated = await this.companyRepository.updateByIdOrFail(id, {
      $set: {
        isVerified: input.isVerified,
        verifiedAt: input.isVerified ? new Date() : null,
        verifiedBy: input.isVerified && userId ? new mongoose.Types.ObjectId(userId) : null,
        verificationNote: input.note ?? null,
      },
    });

    await this.auditService.log({
      action: input.isVerified ? 'company.verified' : 'company.unverified',
      category: 'admin',
      severity: input.isVerified ? 'info' : 'warning',
      entity: { type: 'Company', id: company._id, label: company.name },
      changes: [{ field: 'isVerified', from: company.isVerified, to: input.isVerified }],
      metadata: { note: input.note ?? null },
    });

    return updated;
  }

  /**
   * Blacklisting stops new drives without erasing history. Past applications
   * and offers stay readable — a student's placement record must not vanish
   * because the company later misbehaved.
   */
  async blacklist(id: string, reason: string): Promise<CompanyDocument> {
    const company = await this.companyRepository.findByIdOrFail(id);

    if (company.status === 'blacklisted') {
      throw new BusinessRuleError('This company is already blacklisted.');
    }

    const userId = requestContext.get().userId;
    const openJobs = await this.jobRepository.count({
      companyId: company._id,
      status: 'published',
    });

    const updated = await this.companyRepository.updateByIdOrFail(id, {
      $set: {
        status: 'blacklisted',
        blacklistReason: reason,
        blacklistedAt: new Date(),
        blacklistedBy: userId ? new mongoose.Types.ObjectId(userId) : null,
      },
    });

    await this.auditService.log({
      action: 'company.blacklisted',
      category: 'admin',
      severity: 'critical',
      entity: { type: 'Company', id: company._id, label: company.name },
      changes: [{ field: 'status', from: company.status, to: 'blacklisted' }],
      metadata: { reason, openJobs },
    });

    return updated;
  }

  async reinstate(id: string, reason: string): Promise<CompanyDocument> {
    const company = await this.companyRepository.findByIdOrFail(id);

    if (company.status !== 'blacklisted') {
      throw new BusinessRuleError('This company is not blacklisted.');
    }

    const updated = await this.companyRepository.updateByIdOrFail(id, {
      $set: {
        status: 'active',
        blacklistReason: null,
        blacklistedAt: null,
        blacklistedBy: null,
      },
    });

    await this.auditService.log({
      action: 'company.reinstated',
      category: 'admin',
      severity: 'warning',
      entity: { type: 'Company', id: company._id, label: company.name },
      changes: [{ field: 'status', from: 'blacklisted', to: 'active' }],
      metadata: { reason },
    });

    return updated;
  }

  /** Replaces the logo, deleting the previous object only after the new one lands. */
  async setLogo(
    id: string,
    file: { buffer: Buffer; originalName: string; mimeType: string },
  ): Promise<CompanyDocument> {
    const company = await this.companyRepository.findByIdOrFail(id);

    const stored = await this.storageService.upload({
      buffer: file.buffer,
      originalName: file.originalName,
      mimeType: file.mimeType,
      purpose: 'company_logo',
      replacesKey: company.logoKey,
    });

    const updated = await this.companyRepository.updateByIdOrFail(id, {
      $set: { logoUrl: stored.url, logoKey: stored.key },
    });

    await this.auditService.log({
      action: 'company.logo_updated',
      category: 'data',
      entity: { type: 'Company', id: company._id, label: company.name },
      metadata: { sizeBytes: stored.sizeBytes, mimeType: stored.mimeType },
    });

    return updated;
  }

  async remove(id: string): Promise<{ id: string; deletedAt: Date }> {
    const company = await this.companyRepository.findByIdOrFail(id);

    const jobs = await this.jobRepository.count({ companyId: company._id });

    // Deleting a company with drive history would orphan every application
    // and placement pointing at it. Blacklisting is the intended exit.
    if (jobs > 0) {
      throw new BusinessRuleError(
        `${jobs} job posting(s) reference this company. Blacklist it instead of deleting.`,
      );
    }

    const deleted = await this.companyRepository.softDelete(id);
    if (!deleted) throw new NotFoundError('Company');

    await this.auditService.log({
      action: 'company.deleted',
      category: 'data',
      severity: 'warning',
      entity: { type: 'Company', id: company._id, label: company.name },
    });

    return { id, deletedAt: deleted.deletedAt ?? new Date() };
  }

  async analytics() {
    const [byStatus, verified, industries] = await Promise.all([
      this.companyRepository.countByStatus(),
      this.companyRepository.count({ isVerified: true }),
      this.companyRepository.industries(),
    ]);

    return {
      total: Object.values(byStatus).reduce((sum, count) => sum + count, 0),
      active: byStatus.active ?? 0,
      blacklisted: byStatus.blacklisted ?? 0,
      inactive: byStatus.inactive ?? 0,
      verified,
      industries: industries.filter(Boolean).sort(),
      byStatus,
    };
  }

  async export(
    filter: Record<string, unknown>,
    options: { ids?: string[] } = {},
  ): Promise<CompanyDocument[]> {
    const query: Record<string, unknown> = options.ids?.length
      ? { _id: { $in: options.ids.map((id) => new mongoose.Types.ObjectId(id)) } }
      : { ...filter };

    const companies = await this.companyRepository.findMany(query, { sort: 'name', limit: 5000 });

    await this.auditService.log({
      action: 'company.exported',
      category: 'data',
      metadata: { rows: companies.length },
    });

    return companies;
  }

  async bulkDelete(ids: string[]): Promise<BulkOperationResult> {
    const results: Array<{
      index: number;
      success: boolean;
      id?: string;
      code?: string;
      message?: string;
    }> = [];

    let successCount = 0;

    // One blocked company must not fail the batch, so each row reports its own
    // outcome and the reason it was skipped.
    for (const [index, id] of ids.entries()) {
      try {
        await this.remove(id);
        successCount += 1;
        results.push({ index, success: true, id });
      } catch (error) {
        results.push({
          index,
          success: false,
          id,
          code: (error as { code?: string }).code ?? 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Delete failed',
        });
      }
    }

    return {
      totalSubmitted: ids.length,
      successCount,
      failureCount: ids.length - successCount,
      results,
    };
  }

  /** Guards job creation: a blacklisted company must not run a new drive. */
  async assertCanRecruit(companyId: string | mongoose.Types.ObjectId): Promise<CompanyDocument> {
    const company = await this.companyRepository.findById(companyId);

    if (!company) {
      throw new ValidationError('That company could not be found.', [
        { field: 'companyId', message: 'Unknown company' },
      ]);
    }

    if (company.status === 'blacklisted') {
      throw new BusinessRuleError(
        `${company.name} is blacklisted and cannot post new roles.`,
      );
    }

    if (company.status === 'inactive') {
      throw new BusinessRuleError(`${company.name} is marked inactive.`);
    }

    return company;
  }
}
