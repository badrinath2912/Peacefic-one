import mongoose, { type ClientSession, type FilterQuery } from 'mongoose';

import { BaseRepository } from './base.repository';

import { UserModel, type UserDocument } from '@/models/user.model';


export class UserRepository extends BaseRepository<UserDocument> {
  constructor() {
    // Not tenant-scoped: the login lookup is global by email. Tenant narrowing
    // happens through explicit collegeId filters on the college-facing queries.
    super(UserModel, {
      tenantScoped: false,
      sortableFields: ['createdAt', 'updatedAt', 'firstName', 'lastName', 'email', 'lastLoginAt', 'status'],
      searchableFields: ['firstName', 'lastName', 'email'],
      filterableFields: ['status', 'roleId', 'collegeId', 'createdAt'],
      populatableFields: ['roleId', 'collegeId'],
    });
  }

  /** Includes the password hash, which is `select: false` everywhere else. */
  async findByEmailWithSecrets(email: string): Promise<UserDocument | null> {
    return this.model
      .findOne({ email: email.toLowerCase().trim(), deletedAt: null })
      .select('+passwordHash +previousPasswordHashes')
      .exec();
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.model.findOne({ email: email.toLowerCase().trim(), deletedAt: null }).exec();
  }

  async findByIdWithSecrets(id: string | mongoose.Types.ObjectId): Promise<UserDocument | null> {
    if (!mongoose.isValidObjectId(id)) return null;
    return this.model
      .findOne({ _id: id, deletedAt: null })
      .select('+passwordHash +previousPasswordHashes +inviteTokenId')
      .exec();
  }

  async findByOAuthProvider(
    provider: 'google' | 'microsoft',
    providerId: string,
  ): Promise<UserDocument | null> {
    return this.model
      .findOne({
        'oauthProviders.provider': provider,
        'oauthProviders.providerId': providerId,
        deletedAt: null,
      })
      .exec();
  }

  async emailExists(email: string, excludeId?: string): Promise<boolean> {
    const filter: FilterQuery<UserDocument> = {
      email: email.toLowerCase().trim(),
      deletedAt: null,
    };
    if (excludeId) filter._id = { $ne: new mongoose.Types.ObjectId(excludeId) };
    return (await this.model.exists(filter)) !== null;
  }

  async findInCollege(
    collegeId: string | mongoose.Types.ObjectId,
    filter: FilterQuery<UserDocument> = {},
  ): Promise<UserDocument[]> {
    return this.model.find({ ...filter, collegeId, deletedAt: null }).exec();
  }

  async recordSuccessfulLogin(
    userId: mongoose.Types.ObjectId,
    ip: string,
    session?: ClientSession,
  ): Promise<void> {
    await this.model
      .updateOne(
        { _id: userId },
        {
          $set: {
            lastLoginAt: new Date(),
            lastLoginIp: ip,
            failedLoginAttempts: 0,
            lockedUntil: null,
          },
        },
        { session },
      )
      .exec();
  }

  /** Returns the new failure count so the caller can decide about locking. */
  async recordFailedLogin(userId: mongoose.Types.ObjectId): Promise<number> {
    const updated = await this.model
      .findOneAndUpdate({ _id: userId }, { $inc: { failedLoginAttempts: 1 } }, { new: true })
      .exec();
    return updated?.failedLoginAttempts ?? 0;
  }

  async lockAccount(userId: mongoose.Types.ObjectId, until: Date): Promise<void> {
    await this.model.updateOne({ _id: userId }, { $set: { lockedUntil: until } }).exec();
  }

  async setPassword(
    userId: mongoose.Types.ObjectId,
    passwordHash: string,
    previousHashes: string[],
    session?: ClientSession,
  ): Promise<void> {
    await this.model
      .updateOne(
        { _id: userId },
        {
          $set: {
            passwordHash,
            // Keep only the last three: the reuse check does not need more.
            previousPasswordHashes: previousHashes.slice(-3),
            passwordChangedAt: new Date(),
            mustChangePassword: false,
            failedLoginAttempts: 0,
            lockedUntil: null,
          },
        },
        { session },
      )
      .exec();
  }

  async markEmailVerified(userId: mongoose.Types.ObjectId, session?: ClientSession): Promise<void> {
    await this.model
      .updateOne(
        { _id: userId },
        { $set: { emailVerifiedAt: new Date() } },
        { session },
      )
      .exec();
  }

  /** Bumping this invalidates permission claims embedded in live access tokens. */
  async bumpPermissionsVersion(userId: mongoose.Types.ObjectId): Promise<void> {
    await this.model.updateOne({ _id: userId }, { $inc: { permissionsVersion: 1 } }).exec();
  }

  async countByCollegeAndRole(
    collegeId: mongoose.Types.ObjectId,
    roleId: mongoose.Types.ObjectId,
  ): Promise<number> {
    return this.model.countDocuments({ collegeId, roleId, deletedAt: null }).exec();
  }
}
