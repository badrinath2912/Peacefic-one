import type { UpdateCollegeInput, UpdateCollegeSettingsInput } from '@peacefic/shared';

import { AUDIT_ACTIONS, type AuditService } from './audit.service';

import { requestContext } from '@/config/request-context';
import { AuthorizationError, BusinessRuleError, NotFoundError } from '@/errors';
import type { CollegeDocument } from '@/models/college.model';
import type { ListOptions, PaginatedResult } from '@/repositories/base.repository';
import type { CollegeRepository } from '@/repositories/college.repository';
import { generateJoinCode } from '@/utils/crypto';

/**
 * The caller's own institution.
 *
 * `CollegeRepository` is `tenantScoped: false` — a college *is* the tenant, so
 * there is no `collegeId` column to scope it by. Isolation therefore comes from
 * this service resolving the id from the request context and never from the
 * request body or a path parameter. That is the whole boundary, so every method
 * goes through `currentCollegeId()`.
 */
export class CollegeService {
  constructor(
    private readonly collegeRepository: CollegeRepository,
    private readonly auditService: AuditService,
  ) {}

  /**
   * The signed-in user's college id, from the token.
   *
   * A platform administrator has no college of their own, so these
   * self-service routes are simply not for them — they get a clear refusal
   * rather than a confusing 404.
   */
  private currentCollegeId(): string {
    const collegeId = requestContext.collegeId();

    if (!collegeId) {
      throw new AuthorizationError('Your account is not attached to an institution.');
    }

    return collegeId;
  }

  /**
   * `joinCode` carries `select: false` on the model, so it is absent from
   * everything read here without needing to be stripped. That is deliberate —
   * a leaked join code is an open door into the tenant.
   */
  async getOwn(): Promise<CollegeDocument> {
    return this.collegeRepository.findByIdOrFail(this.currentCollegeId());
  }

  /**
   * The institution's profile.
   *
   * Fields are copied one at a time rather than spread, so `code`, `status`,
   * `approvedBy`, `settings` or `stats` cannot reach the document even if the
   * validator were ever loosened. `code` in particular is the tenant's
   * identity and is fixed at registration.
   */
  async updateOwn(input: UpdateCollegeInput): Promise<CollegeDocument> {
    const collegeId = this.currentCollegeId();
    const patch: Record<string, unknown> = {};

    if (input.name !== undefined) patch.name = input.name;
    if (input.type !== undefined) patch.type = input.type;
    if (input.affiliatedTo !== undefined) patch.affiliatedTo = input.affiliatedTo;
    if (input.accreditation !== undefined) patch.accreditation = input.accreditation;
    if (input.establishedYear !== undefined) patch.establishedYear = input.establishedYear;
    if (input.logoUrl !== undefined) patch.logoUrl = input.logoUrl;
    if (input.website !== undefined) patch.website = input.website;
    if (input.email !== undefined) patch.email = input.email;
    if (input.phone !== undefined) patch.phone = input.phone;
    if (input.address !== undefined) patch.address = input.address;
    if (input.timezone !== undefined) patch.timezone = input.timezone;
    if (input.academicYearStartMonth !== undefined) {
      patch.academicYearStartMonth = input.academicYearStartMonth;
    }
    if (input.primaryContact !== undefined) patch.primaryContact = input.primaryContact;

    if (Object.keys(patch).length === 0) return this.getOwn();

    const college = await this.collegeRepository.updateByIdOrFail(collegeId, { $set: patch });

    await this.auditService.log({
      action: AUDIT_ACTIONS.COLLEGE_UPDATED,
      category: 'admin',
      entity: { type: 'College', id: college._id, label: college.code },
      metadata: { fields: Object.keys(patch) },
    });

    return college;
  }

  /**
   * The institution's settings.
   *
   * Written with dot-notation keys so an unspecified setting keeps its stored
   * value — replacing the whole sub-document would reset the others, and would
   * also wipe `joinCode`, which lives in the same object but is deliberately
   * absent from the schema and must never be touched from here.
   */
  async updateSettings(input: UpdateCollegeSettingsInput): Promise<CollegeDocument> {
    const collegeId = this.currentCollegeId();
    const patch: Record<string, unknown> = {};

    if (input.allowStudentSelfRegistration !== undefined) {
      patch['settings.allowStudentSelfRegistration'] = input.allowStudentSelfRegistration;
    }
    if (input.attendanceThresholdPercent !== undefined) {
      patch['settings.attendanceThresholdPercent'] = input.attendanceThresholdPercent;
    }
    if (input.gradingScale !== undefined) {
      patch['settings.gradingScale'] = input.gradingScale;
    }
    if (input.certificateSignatory !== undefined) {
      patch['settings.certificateSignatory'] = input.certificateSignatory;
    }

    if (Object.keys(patch).length === 0) return this.getOwn();

    const college = await this.collegeRepository.updateByIdOrFail(collegeId, { $set: patch });

    await this.auditService.log({
      action: AUDIT_ACTIONS.COLLEGE_UPDATED,
      // Changing the attendance threshold or grading scale re-decides who is a
      // defaulter and how every future result reads, so it is worth noting.
      category: 'admin',
      severity: 'warning',
      entity: { type: 'College', id: college._id, label: college.code },
      metadata: { settings: Object.keys(patch).map((key) => key.replace('settings.', '')) },
    });

    return college;
  }

  /* -------------------------------- join code -------------------------------- */
  /**
   * The join code students type to self-register.
   *
   * Session 45 deliberately made this unreadable and unwritable: it is excluded
   * from `collegeSettingsSchema`, carries `select: false`, and is preserved by
   * dot-notation writes. That still holds for every route that lists or reads a
   * college — the code appears in none of them.
   *
   * These two methods are the single, explicit exception, and they are narrow:
   * the code is returned only to a caller who already administers **their own**
   * college, resolved from the token via `currentCollegeId()`. No route takes a
   * college id, so there is no parameter to substitute.
   */
  async getJoinCode(): Promise<{ joinCode: string | null; allowStudentSelfRegistration: boolean }> {
    const collegeId = this.currentCollegeId();
    const college = await this.collegeRepository.findByIdWithJoinCode(collegeId);

    if (!college) throw new NotFoundError('College');

    return {
      joinCode: college.settings?.joinCode ?? null,
      allowStudentSelfRegistration: Boolean(college.settings?.allowStudentSelfRegistration),
    };
  }

  /**
   * Issues a new code and invalidates the old one in the same write.
   *
   * `findByJoinCode` matches on the stored value, so replacing it is what makes
   * the previous code stop working — there is no separate revocation list to
   * fall out of step with.
   */
  async regenerateJoinCode(): Promise<{ joinCode: string }> {
    const collegeId = this.currentCollegeId();
    const joinCode = generateJoinCode();

    // Dot notation, so the other settings — including the self-registration
    // switch — survive untouched.
    await this.collegeRepository.updateByIdOrFail(collegeId, {
      $set: { 'settings.joinCode': joinCode },
    });

    await this.auditService.log({
      action: AUDIT_ACTIONS.COLLEGE_JOIN_CODE_REGENERATED,
      category: 'admin',
      // Anyone holding the old code loses access to registration immediately.
      severity: 'warning',
      collegeId,
      entity: { type: 'College', id: collegeId, label: 'join code' },
      // The code itself is a shared secret and is never written to the log.
      metadata: { rotated: true },
    });

    return { joinCode };
  }

  /* ----------------------------- platform review ---------------------------- */
  /**
   * The three methods below are the **only** ones that reach outside the
   * caller's own institution, and they exist because public registration would
   * otherwise go nowhere: a college is created `pending`, and login refuses a
   * pending college, so without an approver nobody can ever sign in.
   *
   * They are gated on `college:approve`, which is flagged dangerous in the
   * catalogue and is held by no role except `platform_admin`'s wildcard —
   * notably **not** by `college_admin`, whose own institution is reachable
   * through the self-service methods above. That permission is the entire
   * boundary here, because `CollegeRepository` is `tenantScoped: false` and
   * applies no narrowing of its own.
   */

  /** Every institution, for review. `joinCode` stays unselected throughout. */
  async listForReview(options: ListOptions): Promise<PaginatedResult<CollegeDocument>> {
    return this.collegeRepository.paginate({
      ...options,
      sort: options.sort ?? '-createdAt',
    });
  }

  async approve(collegeId: string, notes?: string): Promise<CollegeDocument> {
    const existing = await this.collegeRepository.findByIdOrFail(collegeId);
    this.assertAwaitingReview(existing, 'approved');

    const college = await this.collegeRepository.updateByIdOrFail(collegeId, {
      $set: {
        status: 'active',
        approvedBy: requestContext.get().userId,
        approvedAt: new Date(),
        // A previous rejection is cleared, so the record does not carry a
        // reason that contradicts its current status.
        rejectionReason: null,
      },
    });

    await this.auditService.log({
      action: AUDIT_ACTIONS.COLLEGE_APPROVED,
      category: 'admin',
      // Approval turns a dormant registration into a live tenant whose
      // administrator can then sign in.
      severity: 'warning',
      collegeId: String(college._id),
      entity: { type: 'College', id: college._id, label: college.code },
      metadata: { notes: notes ?? null },
    });

    return college;
  }

  async reject(collegeId: string, reason: string): Promise<CollegeDocument> {
    const existing = await this.collegeRepository.findByIdOrFail(collegeId);
    this.assertAwaitingReview(existing, 'rejected');

    const college = await this.collegeRepository.updateByIdOrFail(collegeId, {
      $set: {
        status: 'rejected',
        rejectionReason: reason,
        approvedBy: null,
        approvedAt: null,
      },
    });

    await this.auditService.log({
      action: AUDIT_ACTIONS.COLLEGE_REJECTED,
      category: 'admin',
      severity: 'warning',
      collegeId: String(college._id),
      entity: { type: 'College', id: college._id, label: college.code },
      // The reason is shown to the applicant, so it is recorded verbatim.
      metadata: { reason },
    });

    return college;
  }

  /**
   * Only a `pending` registration is reviewable.
   *
   * Without this, approving an already-suspended college would quietly
   * reinstate it — suspension is a separate act with its own permission, and a
   * review route must not become a backdoor around it.
   */
  private assertAwaitingReview(college: CollegeDocument, verb: string): void {
    if (college.status !== 'pending') {
      throw new BusinessRuleError(
        `This registration is already ${college.status} and cannot be ${verb}.`,
      );
    }
  }
}
