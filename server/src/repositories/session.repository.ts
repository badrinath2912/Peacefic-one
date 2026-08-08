import type mongoose from 'mongoose';
import type { ClientSession } from 'mongoose';

import { BaseRepository } from './base.repository';

import {
  SessionModel,
  type SessionDocument,
  type SessionRevokeReason,
} from '@/models/session.model';


export class SessionRepository extends BaseRepository<SessionDocument> {
  constructor() {
    super(SessionModel, {
      tenantScoped: false,
      sortableFields: ['createdAt', 'lastUsedAt', 'expiresAt'],
      searchableFields: [],
      filterableFields: ['userId', 'revokedAt'],
      populatableFields: [],
      defaultSort: '-lastUsedAt',
    });
  }

  async findByTokenHash(hash: string): Promise<SessionDocument | null> {
    return this.model.findOne({ refreshTokenHash: hash, deletedAt: null }).exec();
  }

  async findActiveForUser(userId: mongoose.Types.ObjectId): Promise<SessionDocument[]> {
    return this.model
      .find({ userId, revokedAt: null, expiresAt: { $gt: new Date() }, deletedAt: null })
      .sort({ lastUsedAt: -1 })
      .exec();
  }

  async revoke(
    sessionId: mongoose.Types.ObjectId,
    reason: SessionRevokeReason,
    session?: ClientSession,
  ): Promise<void> {
    await this.model
      .updateOne(
        { _id: sessionId, revokedAt: null },
        { $set: { revokedAt: new Date(), revokedReason: reason } },
        { session },
      )
      .exec();
  }

  /**
   * Kills every session sharing a rotation family. Called when a rotated
   * refresh token is presented again — the system cannot distinguish a race
   * from a theft, so it assumes theft.
   */
  async revokeFamily(
    family: string,
    reason: SessionRevokeReason,
    session?: ClientSession,
  ): Promise<number> {
    const result = await this.model
      .updateMany(
        { family, revokedAt: null },
        { $set: { revokedAt: new Date(), revokedReason: reason } },
        { session },
      )
      .exec();
    return result.modifiedCount;
  }

  async revokeAllForUser(
    userId: mongoose.Types.ObjectId,
    reason: SessionRevokeReason,
    exceptSessionId?: mongoose.Types.ObjectId,
    session?: ClientSession,
  ): Promise<number> {
    const filter: Record<string, unknown> = { userId, revokedAt: null };
    if (exceptSessionId) filter._id = { $ne: exceptSessionId };

    const result = await this.model
      .updateMany(filter, { $set: { revokedAt: new Date(), revokedReason: reason } }, { session })
      .exec();
    return result.modifiedCount;
  }

  async touch(sessionId: mongoose.Types.ObjectId): Promise<void> {
    await this.model.updateOne({ _id: sessionId }, { $set: { lastUsedAt: new Date() } }).exec();
  }

  /** Enforces the per-user device cap by evicting the oldest sessions. */
  async enforceDeviceLimit(userId: mongoose.Types.ObjectId, maxDevices: number): Promise<void> {
    const active = await this.findActiveForUser(userId);
    if (active.length <= maxDevices) return;

    const excess = active.slice(maxDevices);
    await this.model
      .updateMany(
        { _id: { $in: excess.map((s) => s._id) } },
        { $set: { revokedAt: new Date(), revokedReason: 'device_limit' } },
      )
      .exec();
  }
}
