import {
  DEFAULT_ROLE_PERMISSIONS,
  ROLE_KEYS,
  resolvePermissions,
  type AuthenticatedUser,
  type LoginResponse,
  type RegisterCollegeInput,
  type RegisterStudentInput,
  type UpdatePreferencesInput,
  type UpdateProfileInput,
} from '@peacefic/shared';
import mongoose from 'mongoose';

import { AUDIT_ACTIONS, type AuditService } from './audit.service';
import type { EmailService } from './email.service';
import type { TokenService, TokenSubject } from './token.service';

import { withTransaction } from '@/config/database';
import { config } from '@/config/env';
import { logger } from '@/config/logger';
import { requestContext, withoutTenantScope } from '@/config/request-context';
import {
  AccountInactiveError,
  AuthenticationError,
  BusinessRuleError,
  DuplicateResourceError,
  InvalidCredentialsError,
  NotFoundError,
  ValidationError,
} from '@/errors';
import type { CollegeDocument } from '@/models/college.model';
import type { StudentRegistrationDocument } from '@/models/student-registration.model';
import type { UserDocument } from '@/models/user.model';
import type { BatchRepository } from '@/repositories/batch.repository';
import type { CollegeRepository } from '@/repositories/college.repository';
import type { DepartmentRepository } from '@/repositories/department.repository';
import type { FacultyRepository } from '@/repositories/faculty.repository';
import type { OtpRepository } from '@/repositories/otp.repository';
import type { RoleRepository } from '@/repositories/role.repository';
import type { StudentRegistrationRepository } from '@/repositories/student-registration.repository';
import type { StudentRepository } from '@/repositories/student.repository';
import type { UserRepository } from '@/repositories/user.repository';
import {
  generateOtp,
  hashOtp,
  hashPassword,
  verifyOtp,
  verifyPassword,
  verifyPasswordConstantTime,
} from '@/utils/crypto';
import { addMinutes } from '@/utils/date';
import { signInviteToken, signPasswordResetToken, verifyInviteToken } from '@/utils/jwt';


const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;
const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

/** The ten thousand most common passwords are not shipped here; this is the
 *  short head that covers the overwhelming majority of real attempts. */
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', 'qwerty123',
  'admin123', 'welcome1', 'welcome123', 'letmein1', 'iloveyou', 'sunshine1',
  'football1', 'monkey123', 'abc12345', 'passw0rd', 'p@ssw0rd', 'trustno1',
]);

export interface RequestMeta {
  ip: string;
  userAgent: string;
}

export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly roleRepository: RoleRepository,
    private readonly collegeRepository: CollegeRepository,
    private readonly studentRepository: StudentRepository,
    private readonly facultyRepository: FacultyRepository,
    private readonly departmentRepository: DepartmentRepository,
    private readonly batchRepository: BatchRepository,
    private readonly otpRepository: OtpRepository,
    private readonly tokenService: TokenService,
    private readonly auditService: AuditService,
    private readonly emailService: EmailService,
    private readonly studentRegistrationRepository: StudentRegistrationRepository,
  ) {}

  /* ------------------------------ registration ----------------------------- */

  /**
   * Self-registration creates a *pending* college. It is not live until a
   * platform admin approves it — anyone could otherwise claim to be an
   * institution and start inviting students.
   */
  async registerCollege(input: RegisterCollegeInput, meta: RequestMeta): Promise<{ email: string }> {
    return withoutTenantScope('college-registration', async () => {
      const [codeTaken, emailTaken] = await Promise.all([
        this.collegeRepository.codeExists(input.college.code),
        this.userRepository.emailExists(input.admin.email),
      ]);

      if (codeTaken) {
        throw new DuplicateResourceError('That college code is already registered.', [
          { field: 'college.code', message: 'Already in use' },
        ]);
      }
      if (emailTaken) {
        throw new DuplicateResourceError('An account with that email already exists.', [
          { field: 'admin.email', message: 'Already in use' },
        ]);
      }

      this.assertPasswordAcceptable(input.admin.password, {
        firstName: input.admin.firstName,
        lastName: input.admin.lastName,
        email: input.admin.email,
      });

      const role = await this.roleRepository.findByKey(ROLE_KEYS.COLLEGE_ADMIN, null);
      if (!role) {
        throw new BusinessRuleError('Roles are not seeded. Run the seed script first.');
      }

      const passwordHash = await hashPassword(input.admin.password);

      const result = await withTransaction(async (session) => {
        const college = await this.collegeRepository.create(
          {
            name: input.college.name,
            code: input.college.code,
            type: input.college.type,
            affiliatedTo: input.college.affiliatedTo ?? null,
            establishedYear: input.college.establishedYear,
            website: input.college.website || null,
            email: input.college.email,
            phone: input.college.phone,
            address: input.college.address,
            status: 'pending',
            primaryContact: {
              name: `${input.admin.firstName} ${input.admin.lastName}`,
              email: input.admin.email,
              phone: input.admin.phone,
              designation: input.admin.designation,
            },
          } as Partial<CollegeDocument>,
          session,
        );

        const user = await this.userRepository.create(
          {
            email: input.admin.email,
            passwordHash,
            firstName: input.admin.firstName,
            lastName: input.admin.lastName,
            phone: input.admin.phone,
            collegeId: college._id,
            roleId: role._id,
            status: 'pending_verification',
          } as Partial<UserDocument>,
          session,
        );

        return { college, user };
      });

      await this.auditService.log({
        action: AUDIT_ACTIONS.COLLEGE_REGISTERED,
        category: 'admin',
        severity: 'info',
        collegeId: String(result.college._id),
        userId: String(result.user._id),
        userEmail: result.user.email,
        entity: { type: 'College', id: result.college._id, label: result.college.name },
        metadata: { ip: meta.ip },
      });

      await this.sendOtp(input.admin.email, 'email_verification', result.user._id);

      return { email: input.admin.email };
    });
  }

  /**
   * A student joining an existing institution with its join code.
   *
   * The college is resolved **only** from the code — no `collegeId` is accepted
   * from the request, so a code issued by one institution cannot create an
   * account under another. `findByJoinCode` already requires the college to be
   * active and `allowStudentSelfRegistration` to be on, so a disabled or
   * suspended institution is unreachable by construction.
   *
   * This creates a `User` (so the existing OTP, verification and login-refusal
   * paths all apply unchanged) plus a `StudentRegistration` holding the academic
   * side. It deliberately does **not** create a `Student`: that needs a
   * department, batch, admission number and admission date, which only a
   * reviewer can supply.
   *
   * Runs `withoutTenantScope` because it is unauthenticated — there is no tenant
   * in context until the join code resolves one.
   */
  async registerStudent(input: RegisterStudentInput, meta: RequestMeta): Promise<{ email: string }> {
    return withoutTenantScope('student-registration', async () => {
      const college = await this.collegeRepository.findByJoinCode(input.joinCode);

      // One message for "no such code", "self-registration is off" and
      // "college not active" — distinguishing them would let anyone probe which
      // institutions exist and which have registration open.
      if (!college) {
        throw new ValidationError('That join code is not valid.', [
          { field: 'joinCode', message: 'Invalid join code' },
        ]);
      }

      // Matches `registerCollege`, which also reports a taken email on its own
      // field. Registration is the one place this system answers plainly:
      // login and password reset stay deliberately silent.
      if (await this.userRepository.emailExists(input.email)) {
        throw new DuplicateResourceError('An account with that email already exists.', [
          { field: 'email', message: 'Already in use' },
        ]);
      }

      const duplicateRoll = await this.studentRegistrationRepository.findPendingByRollNumber(
        String(college._id),
        input.rollNumber,
      );
      if (duplicateRoll) {
        throw new DuplicateResourceError('That roll number is already awaiting approval.', [
          { field: 'rollNumber', message: 'Already registered' },
        ]);
      }

      this.assertPasswordAcceptable(input.password, {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
      });

      const role = await this.roleRepository.findByKey(ROLE_KEYS.STUDENT, null);
      if (!role) {
        throw new BusinessRuleError('Roles are not seeded. Run the seed script first.');
      }

      const passwordHash = await hashPassword(input.password);

      const result = await withTransaction(async (session) => {
        const user = await this.userRepository.create(
          {
            email: input.email,
            passwordHash,
            firstName: input.firstName,
            lastName: input.lastName,
            phone: input.phone,
            collegeId: college._id,
            roleId: role._id,
            // Verification moves this to `pending_approval`; only a reviewer
            // makes it active. Login refuses both states.
            status: 'pending_verification',
          } as Partial<UserDocument>,
          session,
        );

        const registration = await this.studentRegistrationRepository.create(
          {
            collegeId: college._id,
            userId: user._id,
            firstName: input.firstName,
            lastName: input.lastName,
            email: input.email,
            phone: input.phone,
            rollNumber: input.rollNumber,
            approvalStatus: 'pending',
          } as Partial<StudentRegistrationDocument>,
          session,
        );

        return { user, registration };
      });

      await this.auditService.log({
        action: AUDIT_ACTIONS.STUDENT_REGISTERED,
        category: 'admin',
        severity: 'info',
        collegeId: String(college._id),
        userId: String(result.user._id),
        userEmail: result.user.email,
        entity: {
          type: 'StudentRegistration',
          id: result.registration._id,
          label: result.registration.rollNumber,
        },
        // The join code is a shared secret for the tenant and is never recorded.
        metadata: { ip: meta.ip, rollNumber: result.registration.rollNumber },
      });

      await this.sendOtp(input.email, 'email_verification', result.user._id);

      return { email: input.email };
    });
  }

  /* --------------------------------- login --------------------------------- */

  async login(
    email: string,
    password: string,
    rememberMe: boolean,
    meta: RequestMeta,
  ): Promise<LoginResponse & { refreshToken: string; refreshExpiresAt: Date }> {
    const user = await this.userRepository.findByEmailWithSecrets(email);

    if (user?.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      throw new AccountInactiveError(
        `This account is locked after too many failed attempts. Try again in ${minutes} minute(s).`,
      );
    }

    // Always run a bcrypt comparison, even with no user — otherwise response
    // timing reveals which emails are registered.
    const passwordValid = await verifyPasswordConstantTime(password, user?.passwordHash);

    if (!user || !passwordValid) {
      if (user) {
        const failures = await this.userRepository.recordFailedLogin(user._id);
        if (failures >= MAX_FAILED_LOGINS) {
          const until = addMinutes(new Date(), LOCKOUT_MINUTES);
          await this.userRepository.lockAccount(user._id, until);
          await this.auditService.log({
            action: AUDIT_ACTIONS.AUTH_ACCOUNT_LOCKED,
            category: 'security',
            severity: 'warning',
            userId: String(user._id),
            userEmail: user.email,
            collegeId: user.collegeId ? String(user.collegeId) : null,
            outcome: 'failure',
          });
          await this.emailService.enqueue('account-locked', user.email, {
            firstName: user.firstName,
            minutes: LOCKOUT_MINUTES,
            ip: meta.ip,
          });
        }
      }

      await this.auditService.log({
        action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
        category: 'security',
        severity: 'info',
        userId: user ? String(user._id) : null,
        userEmail: email,
        outcome: 'failure',
        metadata: { ip: meta.ip },
      });

      // The same message whether the email is unknown or the password wrong.
      throw new InvalidCredentialsError();
    }

    await this.assertAccountUsable(user);

    const subject = await this.buildTokenSubject(user);
    const tokens = await this.tokenService.issue(subject, { ...meta, rememberMe });

    await this.userRepository.recordSuccessfulLogin(user._id, meta.ip);

    await this.auditService.log({
      action: AUDIT_ACTIONS.AUTH_LOGIN,
      category: 'auth',
      userId: String(user._id),
      userEmail: user.email,
      collegeId: user.collegeId ? String(user.collegeId) : null,
      metadata: { ip: meta.ip, rememberMe },
    });

    const profile = await this.buildAuthenticatedUser(user, subject.permissions);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      refreshExpiresAt: tokens.refreshExpiresAt,
      expiresIn: tokens.expiresIn,
      user: profile,
    };
  }

  /* -------------------------------- refresh -------------------------------- */

  async refresh(
    refreshToken: string,
    meta: RequestMeta,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; refreshExpiresAt: Date }> {
    try {
      const { tokens } = await this.tokenService.rotate(
        refreshToken,
        async (userId) => {
          const user = await this.userRepository.findById(userId);
          if (!user || user.status !== 'active') return null;
          return this.buildTokenSubject(user);
        },
        meta,
      );

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        refreshExpiresAt: tokens.refreshExpiresAt,
      };
    } catch (error) {
      const reuse = error as { reuseDetected?: boolean; userId?: string };
      if (reuse.reuseDetected && reuse.userId) {
        // Deliberately harsh: the alternative is letting a thief keep a session.
        await this.auditService.log({
          action: AUDIT_ACTIONS.AUTH_TOKEN_REUSE_DETECTED,
          category: 'security',
          severity: 'critical',
          userId: reuse.userId,
          outcome: 'failure',
          metadata: { ip: meta.ip },
        });

        const user = await this.userRepository.findById(reuse.userId);
        if (user) {
          await this.emailService.enqueue('token-reuse-alert', user.email, {
            firstName: user.firstName,
            ip: meta.ip,
          });
        }
      }
      throw error;
    }
  }

  /* --------------------------------- logout -------------------------------- */

  async logout(refreshToken: string | undefined, userId: string | null): Promise<void> {
    if (refreshToken) {
      await this.tokenService.revokeByToken(refreshToken, 'logout');
    }
    if (userId) {
      await this.auditService.log({
        action: AUDIT_ACTIONS.AUTH_LOGOUT,
        category: 'auth',
        userId,
      });
    }
  }

  async logoutAll(userId: string): Promise<number> {
    const revoked = await this.tokenService.revokeAllForUser(userId, 'logout');
    await this.auditService.log({
      action: AUDIT_ACTIONS.AUTH_LOGOUT_ALL,
      category: 'auth',
      userId,
      metadata: { revoked },
    });
    return revoked;
  }

  /* ---------------------------------- OTP ---------------------------------- */

  async sendOtp(
    identifier: string,
    purpose: 'email_verification' | 'password_reset',
    userId?: mongoose.Types.ObjectId,
  ): Promise<void> {
    const latest = await this.otpRepository.findLatest(identifier, purpose);
    if (latest && Date.now() - latest.createdAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
      throw new BusinessRuleError('Please wait a minute before requesting another code.');
    }

    await this.otpRepository.invalidateExisting(identifier, purpose);

    const code = generateOtp();
    await this.otpRepository.create({
      userId: userId ?? null,
      identifier: identifier.toLowerCase().trim(),
      codeHash: await hashOtp(code),
      purpose,
      expiresAt: addMinutes(new Date(), OTP_TTL_MINUTES),
    });

    await this.emailService.enqueue(
      purpose === 'email_verification' ? 'verify-email' : 'password-reset',
      identifier,
      { otp: code, expiresInMinutes: OTP_TTL_MINUTES },
    );

    if (config.isDevelopment) {
      logger.debug('OTP issued', { identifier, purpose });
    }
  }

  async verifyEmail(email: string, code: string): Promise<void> {
    const otp = await this.otpRepository.findActive(email, 'email_verification');
    if (!otp) {
      throw new ValidationError('That code is invalid or has expired.', [
        { field: 'otp', message: 'Invalid or expired code' },
      ]);
    }

    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      await this.otpRepository.consume(otp._id);
      throw new BusinessRuleError('Too many incorrect attempts. Request a new code.');
    }

    const valid = await verifyOtp(code, otp.codeHash);
    if (!valid) {
      await this.otpRepository.incrementAttempts(otp._id);
      throw new ValidationError('That code is incorrect.', [
        { field: 'otp', message: 'Incorrect code' },
      ]);
    }

    const user = await this.userRepository.findByEmail(email);
    if (!user) throw new NotFoundError('Account');

    await withTransaction(async (session) => {
      await this.otpRepository.consume(otp._id, session);
      await this.userRepository.markEmailVerified(user._id, session);

      // A student joining by code still needs approval; a college admin waits
      // for platform approval. Only an invited user goes straight to active.
      const nextStatus = user.status === 'pending_verification' ? 'pending_approval' : user.status;
      await this.userRepository.updateById(user._id, { $set: { status: nextStatus } }, { session });
    });

    await this.auditService.log({
      action: AUDIT_ACTIONS.AUTH_EMAIL_VERIFIED,
      category: 'auth',
      userId: String(user._id),
      userEmail: user.email,
      collegeId: user.collegeId ? String(user.collegeId) : null,
    });
  }

  /* ---------------------------- password recovery --------------------------- */

  /** Always resolves the same way: distinguishing here is a user-enumeration oracle. */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.userRepository.findByEmail(email);
    if (!user || user.status === 'archived') return;

    const jti = new mongoose.Types.ObjectId().toString();
    const token = signPasswordResetToken(String(user._id), jti);

    await this.userRepository.updateById(user._id, { $set: { inviteTokenId: jti } });
    await this.sendOtp(email, 'password_reset', user._id);

    await this.emailService.enqueue('password-reset-link', user.email, {
      firstName: user.firstName,
      resetUrl: `${config.clientUrl}/reset-password?token=${encodeURIComponent(token)}`,
    });

    await this.auditService.log({
      action: AUDIT_ACTIONS.AUTH_PASSWORD_RESET_REQUESTED,
      category: 'auth',
      userId: String(user._id),
      userEmail: user.email,
    });
  }

  async resetPassword(token: string, otpCode: string, newPassword: string): Promise<void> {
    const claims = verifyInviteToken(token, 'password_reset');
    const user = await this.userRepository.findByIdWithSecrets(claims.sub);

    if (!user || user.inviteTokenId !== claims.jti) {
      throw new AuthenticationError('This reset link is invalid or has already been used.');
    }

    const otp = await this.otpRepository.findActive(user.email, 'password_reset');
    if (!otp || !(await verifyOtp(otpCode, otp.codeHash))) {
      if (otp) await this.otpRepository.incrementAttempts(otp._id);
      throw new ValidationError('That code is invalid or has expired.', [
        { field: 'otp', message: 'Invalid or expired code' },
      ]);
    }

    this.assertPasswordAcceptable(newPassword, user);
    await this.assertPasswordNotReused(newPassword, user);

    const passwordHash = await hashPassword(newPassword);

    await withTransaction(async (session) => {
      await this.otpRepository.consume(otp._id, session);
      await this.userRepository.setPassword(
        user._id,
        passwordHash,
        [...(user.previousPasswordHashes ?? []), user.passwordHash].filter(Boolean) as string[],
        session,
      );
      await this.userRepository.updateById(user._id, { $set: { inviteTokenId: null } }, { session });
      // A reset is frequently a response to compromise; leaving the attacker's
      // session alive defeats the point.
      await this.tokenService.revokeAllForUser(String(user._id), 'password_change', undefined, session);
    });

    await this.emailService.enqueue('password-changed', user.email, { firstName: user.firstName });

    await this.auditService.log({
      action: AUDIT_ACTIONS.AUTH_PASSWORD_RESET_COMPLETED,
      category: 'security',
      severity: 'warning',
      userId: String(user._id),
      userEmail: user.email,
    });
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    currentSessionId: string | null,
  ): Promise<void> {
    const user = await this.userRepository.findByIdWithSecrets(userId);
    if (!user?.passwordHash) throw new NotFoundError('Account');

    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new ValidationError('Your current password is incorrect.', [
        { field: 'currentPassword', message: 'Incorrect password' },
      ]);
    }

    this.assertPasswordAcceptable(newPassword, user);
    await this.assertPasswordNotReused(newPassword, user);

    const passwordHash = await hashPassword(newPassword);

    await this.userRepository.setPassword(
      user._id,
      passwordHash,
      [...(user.previousPasswordHashes ?? []), user.passwordHash],
    );

    // Other devices are signed out; the current one stays.
    await this.tokenService.revokeAllForUser(userId, 'password_change', currentSessionId ?? undefined);

    await this.emailService.enqueue('password-changed', user.email, { firstName: user.firstName });

    await this.auditService.log({
      action: AUDIT_ACTIONS.AUTH_PASSWORD_CHANGED,
      category: 'security',
      severity: 'warning',
      userId,
      userEmail: user.email,
    });
  }

  /* ------------------------------- self-service ------------------------------ */

  /**
   * The signed-in user's own profile.
   *
   * `userId` comes from the token in the controller — there is no id parameter
   * on the route, so a caller cannot name someone else. Fields are copied one
   * at a time rather than spread, so a body carrying `roleId`, `status`,
   * `collegeId` or `mustChangePassword` cannot reach the document even if the
   * validator were ever loosened. Anything absent is left untouched.
   *
   * Returns the rebuilt session user so the client can sync in one step: the
   * derived `fullName` changes with the name, and guessing at it client-side is
   * how a stale header appears after a rename.
   */
  async updateProfile(userId: string, input: UpdateProfileInput): Promise<AuthenticatedUser> {
    const patch: Record<string, unknown> = {};

    if (input.firstName !== undefined) patch.firstName = input.firstName;
    if (input.lastName !== undefined) patch.lastName = input.lastName;
    if (input.phone !== undefined) patch.phone = input.phone;
    if (input.avatarUrl !== undefined) patch.avatarUrl = input.avatarUrl;

    if (Object.keys(patch).length > 0) {
      await this.userRepository.updateByIdOrFail(userId, { $set: patch });

      // Field names only. A rename is worth recording; the values are ordinary
      // profile data and add nothing to the trail.
      await this.auditService.log({
        action: AUDIT_ACTIONS.USER_UPDATED,
        category: 'data',
        userId,
        metadata: { fields: Object.keys(patch) },
      });
    }

    return this.getSession(userId);
  }

  /**
   * The signed-in user's own preferences.
   *
   * Written with dot-notation keys so an unspecified preference keeps its
   * stored value — replacing the whole sub-document would silently reset the
   * three settings a caller did not mention.
   *
   * Not audited: a theme toggle is not an event worth carrying in a security
   * trail, and the noise would crowd out entries that matter.
   */
  async updatePreferences(
    userId: string,
    input: UpdatePreferencesInput,
  ): Promise<AuthenticatedUser> {
    const patch: Record<string, unknown> = {};

    if (input.theme !== undefined) patch['preferences.theme'] = input.theme;
    if (input.locale !== undefined) patch['preferences.locale'] = input.locale;
    if (input.emailNotifications !== undefined) {
      patch['preferences.emailNotifications'] = input.emailNotifications;
    }
    if (input.pushNotifications !== undefined) {
      patch['preferences.pushNotifications'] = input.pushNotifications;
    }

    if (Object.keys(patch).length > 0) {
      await this.userRepository.updateByIdOrFail(userId, { $set: patch });
    }

    return this.getSession(userId);
  }

  /* --------------------------------- invites -------------------------------- */

  async createInviteToken(userId: mongoose.Types.ObjectId): Promise<string> {
    const jti = new mongoose.Types.ObjectId().toString();
    await this.userRepository.updateById(userId, { $set: { inviteTokenId: jti } });
    return signInviteToken(String(userId), jti);
  }

  async inspectInvite(token: string): Promise<{ firstName: string; email: string; collegeName: string | null }> {
    const claims = verifyInviteToken(token, 'invite');
    const user = await this.userRepository.findByIdWithSecrets(claims.sub);

    if (!user || user.inviteTokenId !== claims.jti) {
      throw new AuthenticationError('This invitation is invalid or has already been used.');
    }

    const college = user.collegeId
      ? await withoutTenantScope('invite-inspect', () =>
          this.collegeRepository.findById(user.collegeId as mongoose.Types.ObjectId),
        )
      : null;

    return { firstName: user.firstName, email: user.email, collegeName: college?.name ?? null };
  }

  async acceptInvite(token: string, password: string, meta: RequestMeta): Promise<void> {
    const claims = verifyInviteToken(token, 'invite');
    const user = await this.userRepository.findByIdWithSecrets(claims.sub);

    if (!user || user.inviteTokenId !== claims.jti) {
      throw new AuthenticationError('This invitation is invalid or has already been used.');
    }

    this.assertPasswordAcceptable(password, user);

    const passwordHash = await hashPassword(password);

    await withTransaction(async (session) => {
      await this.userRepository.setPassword(user._id, passwordHash, [], session);
      await this.userRepository.updateById(
        user._id,
        {
          $set: {
            status: 'active',
            emailVerifiedAt: new Date(),
            inviteTokenId: null,
            mustChangePassword: false,
          },
        },
        { session },
      );
    });

    await this.auditService.log({
      action: AUDIT_ACTIONS.AUTH_INVITE_ACCEPTED,
      category: 'auth',
      userId: String(user._id),
      userEmail: user.email,
      collegeId: user.collegeId ? String(user.collegeId) : null,
      metadata: { ip: meta.ip },
    });

    await this.emailService.enqueue('welcome', user.email, { firstName: user.firstName });
  }

  /* --------------------------------- session -------------------------------- */

  async getSession(userId: string): Promise<AuthenticatedUser> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new NotFoundError('Account');
    const subject = await this.buildTokenSubject(user);
    return this.buildAuthenticatedUser(user, subject.permissions);
  }

  async listSessions(userId: string) {
    const sessions = await this.tokenService.listSessions(userId);
    const currentSessionId = requestContext.tryGet()?.sessionId;
    return sessions.map((s) => ({
      id: String(s._id),
      deviceLabel: s.deviceLabel,
      ip: s.ip,
      lastUsedAt: s.lastUsedAt,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      isCurrent: String(s._id) === currentSessionId,
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const sessions = await this.tokenService.listSessions(userId);
    if (!sessions.some((s) => String(s._id) === sessionId)) {
      throw new NotFoundError('Session');
    }
    await this.tokenService.revokeSession(sessionId, 'admin_revoke');
    await this.auditService.log({
      action: AUDIT_ACTIONS.AUTH_SESSION_REVOKED,
      category: 'auth',
      userId,
      metadata: { sessionId },
    });
  }

  /* --------------------------------- helpers -------------------------------- */

  private async assertAccountUsable(user: UserDocument): Promise<void> {
    if (user.status === 'suspended') {
      throw new AccountInactiveError('This account has been suspended. Contact your administrator.');
    }
    if (user.status === 'archived') {
      throw new AccountInactiveError('This account is no longer active.');
    }
    if (user.status === 'pending_verification') {
      throw new AccountInactiveError('Please verify your email address before signing in.');
    }
    if (user.status === 'pending_approval') {
      throw new AccountInactiveError(
        'Your registration is under review. You will be emailed once it is approved.',
      );
    }

    if (user.collegeId) {
      const college = await withoutTenantScope('login-college-check', () =>
        this.collegeRepository.findById(user.collegeId as mongoose.Types.ObjectId),
      );
      if (!college) throw new AccountInactiveError('Your institution is no longer registered.');
      if (college.status === 'pending') {
        throw new AccountInactiveError('Your institution is still awaiting approval.');
      }
      if (college.status === 'suspended') {
        throw new AccountInactiveError('Your institution has been suspended.');
      }
      if (college.status === 'rejected') {
        throw new AccountInactiveError('Your institution registration was not approved.');
      }
    }
  }

  private async buildTokenSubject(user: UserDocument): Promise<TokenSubject> {
    const role = await this.roleRepository.findById(user.roleId);
    const rolePermissions =
      role?.permissions ?? DEFAULT_ROLE_PERMISSIONS[ROLE_KEYS.STUDENT] ?? [];

    return {
      userId: String(user._id),
      collegeId: user.collegeId ? String(user.collegeId) : null,
      roleKey: role?.key ?? ROLE_KEYS.STUDENT,
      permissions: resolvePermissions(rolePermissions, user.extraPermissions),
      permissionsVersion: user.permissionsVersion,
    };
  }

  private async buildAuthenticatedUser(
    user: UserDocument,
    permissions: string[],
  ): Promise<AuthenticatedUser> {
    const role = await this.roleRepository.findById(user.roleId);

    const college = user.collegeId
      ? await withoutTenantScope('build-profile', () =>
          this.collegeRepository.findById(user.collegeId as mongoose.Types.ObjectId),
        )
      : null;

    const [student, faculty] = await withoutTenantScope('build-profile', async () =>
      Promise.all([
        this.studentRepository.findByUserId(user._id),
        this.facultyRepository.findByUserId(user._id),
      ]),
    );

    return {
      id: String(user._id),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: `${user.firstName} ${user.lastName}`.trim(),
      avatarUrl: user.avatarUrl,
      phone: user.phone,
      collegeId: user.collegeId ? String(user.collegeId) : null,
      collegeName: college?.name ?? null,
      roleKey: role?.key ?? ROLE_KEYS.STUDENT,
      roleName: role?.name ?? 'Student',
      permissions,
      status: user.status,
      mustChangePassword: user.mustChangePassword,
      emailVerified: user.emailVerifiedAt !== null,
      preferences: {
        theme: user.preferences.theme,
        locale: user.preferences.locale,
        emailNotifications: user.preferences.emailNotifications,
        pushNotifications: user.preferences.pushNotifications,
      },
      studentId: student ? String(student._id) : null,
      facultyId: faculty ? String(faculty._id) : null,
      departmentId: student
        ? String(student.departmentId)
        : faculty
          ? String(faculty.departmentId)
          : null,
      batchId: student ? String(student.batchId) : null,
    };
  }

  /**
   * Length beats composition for real strength, so the UI rewards length, but
   * composition minimums stay because institutional policies usually require them.
   */
  private assertPasswordAcceptable(
    password: string,
    user: { firstName?: string; lastName?: string; email?: string },
  ): void {
    const lower = password.toLowerCase();

    if (COMMON_PASSWORDS.has(lower)) {
      throw new ValidationError('That password is too common.', [
        { field: 'password', message: 'Choose a less predictable password' },
      ]);
    }

    const localPart = user.email?.split('@')[0]?.toLowerCase();
    const fragments = [user.firstName?.toLowerCase(), user.lastName?.toLowerCase(), localPart]
      .filter((f): f is string => Boolean(f && f.length >= 3));

    if (fragments.some((fragment) => lower.includes(fragment))) {
      throw new ValidationError('Your password must not contain your name or email.', [
        { field: 'password', message: 'Do not include your name or email address' },
      ]);
    }
  }

  private async assertPasswordNotReused(
    newPassword: string,
    user: { passwordHash?: string; previousPasswordHashes?: string[] },
  ): Promise<void> {
    const hashes = [user.passwordHash, ...(user.previousPasswordHashes ?? [])].filter(
      (h): h is string => Boolean(h),
    );

    for (const hash of hashes.slice(-3)) {
      if (await verifyPassword(newPassword, hash)) {
        throw new ValidationError('You have used that password recently.', [
          { field: 'newPassword', message: 'Choose a password you have not used before' },
        ]);
      }
    }
  }
}
