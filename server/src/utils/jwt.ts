import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';

import { config } from '@/config/env';
import { AuthenticationError, TokenExpiredError } from '@/errors';

export interface AccessTokenClaims extends JwtPayload {
  sub: string;
  cid: string | null;
  rol: string;
  per: string[];
  sid: string;
  pv: number;
  typ: 'access';
}

export interface InviteTokenClaims extends JwtPayload {
  sub: string;
  purpose: 'invite' | 'password_reset';
  jti: string;
}

const baseOptions: SignOptions = {
  issuer: config.jwt.issuer,
  audience: config.jwt.audience,
  algorithm: 'HS256',
};

export function signAccessToken(claims: {
  userId: string;
  collegeId: string | null;
  roleKey: string;
  permissions: string[];
  sessionId: string;
  permissionsVersion: number;
}): string {
  return jwt.sign(
    {
      sub: claims.userId,
      cid: claims.collegeId,
      rol: claims.roleKey,
      per: claims.permissions,
      sid: claims.sessionId,
      pv: claims.permissionsVersion,
      typ: 'access',
    },
    config.jwt.accessSecret,
    { ...baseOptions, expiresIn: config.jwt.accessExpirySeconds },
  );
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  try {
    const decoded = jwt.verify(token, config.jwt.accessSecret, {
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
      algorithms: ['HS256'],
    }) as AccessTokenClaims;

    if (decoded.typ !== 'access') {
      throw new AuthenticationError('Invalid token type.');
    }
    return decoded;
  } catch (error) {
    // TOKEN_EXPIRED is distinct from UNAUTHENTICATED on purpose: the client
    // refreshes on the former and logs out on the latter.
    if (error instanceof jwt.TokenExpiredError) {
      throw new TokenExpiredError();
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthenticationError('Your session is invalid. Please sign in again.');
    }
    throw error;
  }
}

export function signInviteToken(userId: string, jti: string, expiresInDays = 7): string {
  return jwt.sign({ sub: userId, purpose: 'invite', jti }, config.jwt.inviteSecret, {
    ...baseOptions,
    expiresIn: `${expiresInDays}d`,
  });
}

export function signPasswordResetToken(userId: string, jti: string): string {
  return jwt.sign({ sub: userId, purpose: 'password_reset', jti }, config.jwt.inviteSecret, {
    ...baseOptions,
    expiresIn: '15m',
  });
}

export function verifyInviteToken(
  token: string,
  expectedPurpose: 'invite' | 'password_reset',
): InviteTokenClaims {
  try {
    const decoded = jwt.verify(token, config.jwt.inviteSecret, {
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
      algorithms: ['HS256'],
    }) as InviteTokenClaims;

    if (decoded.purpose !== expectedPurpose) {
      throw new AuthenticationError('This link is not valid for that action.');
    }
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError('This link has expired. Please request a new one.');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthenticationError('This link is invalid or has already been used.');
    }
    throw error;
  }
}

export function decodeWithoutVerify(token: string): JwtPayload | null {
  const decoded = jwt.decode(token);
  return typeof decoded === 'object' ? decoded : null;
}
