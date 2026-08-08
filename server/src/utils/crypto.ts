import crypto from 'node:crypto';

import bcrypt from 'bcryptjs';
import { ulid } from 'ulid';

import { config } from '@/config/env';

/** A dummy hash so failed logins still pay bcrypt's cost — timing must not
 *  reveal whether an email is registered. */
export const DUMMY_PASSWORD_HASH =
  '$2a$12$K8HFqPYQ3vJ5nZ8XZ9wXaOxQZ5vJ8nZ9wXaOxQZ5vJ8nZ9wXaOxQZ5';

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, config.security.bcryptRounds);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Always runs a comparison, even when no user was found. */
export async function verifyPasswordConstantTime(
  plain: string,
  hash: string | undefined,
): Promise<boolean> {
  if (!hash) {
    await bcrypt.compare(plain, DUMMY_PASSWORD_HASH);
    return false;
  }
  return bcrypt.compare(plain, hash);
}

export function generateOtp(): string {
  // crypto.randomInt is uniform; Math.random is not, and predictable OTPs
  // defeat the point of a second factor.
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export async function hashOtp(code: string): Promise<string> {
  return bcrypt.hash(code, 10);
}

export async function verifyOtp(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(code, hash);
}

/** Opaque refresh token: 256 bits of entropy, prefixed with a sortable id. */
export function generateRefreshToken(): string {
  return `${ulid()}.${crypto.randomBytes(32).toString('base64url')}`;
}

/** Fast hash is correct for refresh tokens — the input is already high-entropy. */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateTokenFamily(): string {
  return ulid();
}

/** Unguessable and not derived from the certificate number, so the public
 *  verification endpoint cannot be enumerated. */
export function generateVerificationCode(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function generateJoinCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i += 1) {
    code += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return code;
}

export function generateRequestId(): string {
  return ulid();
}

export function checksum(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Reduces an Aadhaar number to what is safe to keep: the last four digits for
 * display and a keyed hash for duplicate detection. The full number is never
 * written anywhere.
 *
 * The key comes from JWT_INVITE_SECRET rather than being unkeyed — a plain
 * SHA-256 of a 12-digit number is trivially reversible by brute force, since
 * the entire keyspace is only a few billion entries.
 */
export function digestAadhaar(aadhaarNumber: string): { last4: string; hash: string } {
  const digits = aadhaarNumber.replace(/\D/g, '');

  return {
    last4: digits.slice(-4),
    hash: crypto.createHmac('sha256', config.jwt.inviteSecret).update(digits).digest('hex'),
  };
}

/** Formats a stored last-4 for display: "XXXX XXXX 1234". */
export function maskAadhaar(last4: string | null | undefined): string | null {
  return last4 ? `XXXX XXXX ${last4}` : null;
}

export function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Sequence numbers for human-quotable references (TR-2608-0042). */
export function formatSequence(prefix: string, sequence: number, date = new Date()): string {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${prefix}-${yy}${mm}-${String(sequence).padStart(4, '0')}`;
}
