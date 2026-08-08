import type { ClientSession } from 'mongoose';
import mongoose from 'mongoose';

import { config } from '@/config/env';
import { AuthenticationError } from '@/errors';
import type { SessionDocument, SessionRevokeReason } from '@/models/session.model';
import type { SessionRepository } from '@/repositories/session.repository';
import {
  generateRefreshToken,
  generateTokenFamily,
  hashToken,
} from '@/utils/crypto';
import { signAccessToken } from '@/utils/jwt';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  sessionId: string;
  refreshExpiresAt: Date;
}

export interface TokenSubject {
  userId: string;
  collegeId: string | null;
  roleKey: string;
  permissions: string[];
  permissionsVersion: number;
}

/** Derives a readable device label without pulling in a UA parser. */
function deviceLabelFrom(userAgent: string): string {
  const browser =
    /Edg\//.test(userAgent) ? 'Edge'
    : /OPR\//.test(userAgent) ? 'Opera'
    : /Chrome\//.test(userAgent) ? 'Chrome'
    : /Safari\//.test(userAgent) ? 'Safari'
    : /Firefox\//.test(userAgent) ? 'Firefox'
    : 'Unknown browser';

  const os =
    /Windows/.test(userAgent) ? 'Windows'
    : /Android/.test(userAgent) ? 'Android'
    : /iPhone|iPad/.test(userAgent) ? 'iOS'
    : /Mac OS X/.test(userAgent) ? 'macOS'
    : /Linux/.test(userAgent) ? 'Linux'
    : 'Unknown OS';

  return `${browser} on ${os}`;
}

export class TokenService {
  constructor(private readonly sessionRepository: SessionRepository) {}

  /** Creates a new session and its first token pair. */
  async issue(
    subject: TokenSubject,
    meta: { ip: string; userAgent: string; rememberMe?: boolean },
    session?: ClientSession,
  ): Promise<IssuedTokens> {
    const family = generateTokenFamily();
    return this.createSession(subject, meta, family, session);
  }

  /**
   * Rotates a refresh token. Presenting a token that has already been rotated
   * means either a race or a theft, and the two are indistinguishable — so the
   * whole family is revoked and the user must sign in again.
   */
  async rotate(
    presentedToken: string,
    subjectLoader: (userId: string) => Promise<TokenSubject | null>,
    meta: { ip: string; userAgent: string },
  ): Promise<{ tokens: IssuedTokens; userId: string; reuseDetected: boolean }> {
    const hash = hashToken(presentedToken);
    const existing = await this.sessionRepository.findByTokenHash(hash);

    if (!existing) {
      throw new AuthenticationError('Your session is no longer valid. Please sign in again.');
    }

    if (existing.revokedAt) {
      await this.sessionRepository.revokeFamily(existing.family, 'reuse_detected');
      throw Object.assign(
        new AuthenticationError('Your session was ended for security reasons. Please sign in again.'),
        { reuseDetected: true, userId: String(existing.userId), family: existing.family },
      );
    }

    if (existing.expiresAt.getTime() < Date.now()) {
      await this.sessionRepository.revoke(existing._id, 'logout');
      throw new AuthenticationError('Your session has expired. Please sign in again.');
    }

    const subject = await subjectLoader(String(existing.userId));
    if (!subject) {
      await this.sessionRepository.revokeFamily(existing.family, 'admin_revoke');
      throw new AuthenticationError('This account is no longer active.');
    }

    await this.sessionRepository.revoke(existing._id, 'rotated');

    const rememberMe =
      existing.expiresAt.getTime() - existing.createdAt.getTime() >
      config.jwt.refreshExpiryDays * 24 * 60 * 60 * 1000 + 1000;

    const tokens = await this.createSession(
      subject,
      { ...meta, rememberMe },
      existing.family,
    );

    return { tokens, userId: subject.userId, reuseDetected: false };
  }

  private async createSession(
    subject: TokenSubject,
    meta: { ip: string; userAgent: string; rememberMe?: boolean },
    family: string,
    session?: ClientSession,
  ): Promise<IssuedTokens> {
    const refreshToken = generateRefreshToken();
    const days = meta.rememberMe ? config.jwt.refreshRememberDays : config.jwt.refreshExpiryDays;
    const refreshExpiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const created = await this.sessionRepository.create(
      {
        userId: new mongoose.Types.ObjectId(subject.userId),
        refreshTokenHash: hashToken(refreshToken),
        family,
        userAgent: meta.userAgent.slice(0, 500),
        ip: meta.ip,
        deviceLabel: deviceLabelFrom(meta.userAgent),
        expiresAt: refreshExpiresAt,
        lastUsedAt: new Date(),
      } as Partial<SessionDocument>,
      session,
    );

    await this.sessionRepository.enforceDeviceLimit(
      new mongoose.Types.ObjectId(subject.userId),
      config.security.sessionMaxDevices,
    );

    const accessToken = signAccessToken({
      userId: subject.userId,
      collegeId: subject.collegeId,
      roleKey: subject.roleKey,
      permissions: subject.permissions,
      sessionId: String(created._id),
      permissionsVersion: subject.permissionsVersion,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: config.jwt.accessExpirySeconds,
      sessionId: String(created._id),
      refreshExpiresAt,
    };
  }

  async revokeByToken(token: string, reason: SessionRevokeReason): Promise<void> {
    const existing = await this.sessionRepository.findByTokenHash(hashToken(token));
    if (existing && !existing.revokedAt) {
      await this.sessionRepository.revoke(existing._id, reason);
    }
  }

  async revokeSession(sessionId: string, reason: SessionRevokeReason): Promise<void> {
    if (!mongoose.isValidObjectId(sessionId)) return;
    await this.sessionRepository.revoke(new mongoose.Types.ObjectId(sessionId), reason);
  }

  async revokeAllForUser(
    userId: string,
    reason: SessionRevokeReason,
    exceptSessionId?: string,
    session?: ClientSession,
  ): Promise<number> {
    return this.sessionRepository.revokeAllForUser(
      new mongoose.Types.ObjectId(userId),
      reason,
      exceptSessionId && mongoose.isValidObjectId(exceptSessionId)
        ? new mongoose.Types.ObjectId(exceptSessionId)
        : undefined,
      session,
    );
  }

  async listSessions(userId: string): Promise<SessionDocument[]> {
    return this.sessionRepository.findActiveForUser(new mongoose.Types.ObjectId(userId));
  }

  async touch(sessionId: string): Promise<void> {
    if (!mongoose.isValidObjectId(sessionId)) return;
    await this.sessionRepository.touch(new mongoose.Types.ObjectId(sessionId));
  }
}
