import type { OtpPurpose } from '@peacefic/shared';
import type mongoose from 'mongoose';
import type { ClientSession } from 'mongoose';

import { BaseRepository } from './base.repository';

import { OtpModel, type OtpDocument } from '@/models/otp.model';


export class OtpRepository extends BaseRepository<OtpDocument> {
  constructor() {
    super(OtpModel, {
      tenantScoped: false,
      sortableFields: ['createdAt', 'expiresAt'],
      searchableFields: [],
      filterableFields: ['purpose', 'identifier'],
      populatableFields: [],
    });
  }

  /** Returns the newest unconsumed, unexpired OTP with its hash attached. */
  async findActive(identifier: string, purpose: OtpPurpose): Promise<OtpDocument | null> {
    return this.model
      .findOne({
        identifier: identifier.toLowerCase().trim(),
        purpose,
        consumedAt: null,
        expiresAt: { $gt: new Date() },
        deletedAt: null,
      })
      .select('+codeHash')
      .sort({ createdAt: -1 })
      .exec();
  }

  async invalidateExisting(identifier: string, purpose: OtpPurpose): Promise<void> {
    await this.model
      .updateMany(
        { identifier: identifier.toLowerCase().trim(), purpose, consumedAt: null },
        { $set: { consumedAt: new Date() } },
      )
      .exec();
  }

  async consume(otpId: mongoose.Types.ObjectId, session?: ClientSession): Promise<void> {
    await this.model
      .updateOne({ _id: otpId }, { $set: { consumedAt: new Date() } }, { session })
      .exec();
  }

  async incrementAttempts(otpId: mongoose.Types.ObjectId): Promise<number> {
    const updated = await this.model
      .findOneAndUpdate({ _id: otpId }, { $inc: { attempts: 1 } }, { new: true })
      .exec();
    return updated?.attempts ?? 0;
  }

  /** Counts recent sends for the resend cooldown and hourly cap. */
  async countRecent(identifier: string, purpose: OtpPurpose, sinceMs: number): Promise<number> {
    return this.model
      .countDocuments({
        identifier: identifier.toLowerCase().trim(),
        purpose,
        createdAt: { $gte: new Date(Date.now() - sinceMs) },
      })
      .exec();
  }

  async findLatest(identifier: string, purpose: OtpPurpose): Promise<OtpDocument | null> {
    return this.model
      .findOne({ identifier: identifier.toLowerCase().trim(), purpose })
      .sort({ createdAt: -1 })
      .exec();
  }
}
