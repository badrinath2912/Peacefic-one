import path from 'node:path';

import type { FilePurpose } from '@peacefic/shared';

import { FileTooLargeError, UnsupportedFileTypeError, ValidationError } from '@/errors';
import { checksum } from '@/utils/crypto';

export interface PurposeRule {
  maxBytes: number;
  mimeTypes: string[];
  extensions: string[];
}

const MB = 1024 * 1024;

/**
 * Limits are per purpose rather than global: a 25 MB résumé is reasonable, a
 * 25 MB avatar is someone uploading a RAW photo by accident.
 */
export const PURPOSE_RULES: Record<FilePurpose, PurposeRule> = {
  avatar: {
    maxBytes: 5 * MB,
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    extensions: ['.jpg', '.jpeg', '.png', '.webp'],
  },
  college_logo: {
    maxBytes: 5 * MB,
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
    extensions: ['.jpg', '.jpeg', '.png', '.webp', '.svg'],
  },
  company_logo: {
    maxBytes: 5 * MB,
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
    extensions: ['.jpg', '.jpeg', '.png', '.webp', '.svg'],
  },
  // Job descriptions, MoUs and offer templates a recruiter sends across.
  company_document: {
    maxBytes: 15 * MB,
    mimeTypes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
    ],
    extensions: ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'],
  },
  resume: {
    maxBytes: 10 * MB,
    mimeTypes: ['application/pdf'],
    extensions: ['.pdf'],
  },
  certificate: {
    maxBytes: 10 * MB,
    mimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    extensions: ['.pdf', '.jpg', '.jpeg', '.png'],
  },
  assignment: {
    maxBytes: 25 * MB,
    mimeTypes: [
      'application/pdf',
      'application/zip',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'text/plain',
    ],
    extensions: ['.pdf', '.zip', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.txt'],
  },
  submission: {
    maxBytes: 25 * MB,
    mimeTypes: [
      'application/pdf',
      'application/zip',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'text/plain',
    ],
    extensions: ['.pdf', '.zip', '.docx', '.jpg', '.jpeg', '.png', '.txt'],
  },
  learning_material: {
    maxBytes: 200 * MB,
    mimeTypes: [
      'application/pdf',
      'video/mp4',
      'video/webm',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'image/jpeg',
      'image/png',
    ],
    extensions: ['.pdf', '.mp4', '.webm', '.pptx', '.jpg', '.jpeg', '.png'],
  },
  ticket_attachment: {
    maxBytes: 10 * MB,
    mimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'text/plain'],
    extensions: ['.pdf', '.jpg', '.jpeg', '.png', '.txt'],
  },
  offer_letter: {
    maxBytes: 10 * MB,
    mimeTypes: ['application/pdf'],
    extensions: ['.pdf'],
  },
  import: {
    maxBytes: 10 * MB,
    mimeTypes: [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
    extensions: ['.csv', '.xls', '.xlsx'],
  },
  other: {
    maxBytes: 10 * MB,
    mimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    extensions: ['.pdf', '.jpg', '.jpeg', '.png'],
  },
};

/**
 * Magic-number signatures. The browser-supplied MIME type is attacker
 * controlled, so it is treated as a hint and the bytes are checked instead —
 * a PHP shell renamed to `.png` announces itself as `image/png`.
 */
const SIGNATURES: Array<{ mime: string; offset: number; bytes: number[] }> = [
  { mime: 'image/jpeg', offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'application/pdf', offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] },
  // ZIP container — also xlsx, docx, pptx.
  { mime: 'application/zip', offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] },
  { mime: 'video/mp4', offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] },
];

function detectSignature(buffer: Buffer): string | null {
  for (const signature of SIGNATURES) {
    const slice = buffer.subarray(signature.offset, signature.offset + signature.bytes.length);
    if (slice.length === signature.bytes.length && signature.bytes.every((byte, index) => slice[index] === byte)) {
      return signature.mime;
    }
  }

  // WEBP is "RIFF????WEBP".
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

const ZIP_BACKED = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
]);

const TEXT_LIKE = new Set(['text/csv', 'text/plain', 'application/vnd.ms-excel', 'image/svg+xml']);

export interface ValidatedFile {
  buffer: Buffer;
  safeName: string;
  extension: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
}

/** Extension point for a real scanner. Returning false rejects the upload. */
export type VirusScanner = (buffer: Buffer, fileName: string) => Promise<boolean>;

export class FileValidator {
  constructor(private readonly scanner?: VirusScanner) {}

  async validate(
    buffer: Buffer,
    originalName: string,
    declaredMime: string,
    purpose: FilePurpose,
  ): Promise<ValidatedFile> {
    const rule = PURPOSE_RULES[purpose];
    if (!rule) throw new ValidationError(`Unknown upload purpose "${purpose}".`);

    if (buffer.length === 0) {
      throw new ValidationError('That file is empty.');
    }

    if (buffer.length > rule.maxBytes) {
      const limit = Math.round(rule.maxBytes / MB);
      throw new FileTooLargeError(
        `That file is ${(buffer.length / MB).toFixed(1)} MB. The limit for this upload is ${limit} MB.`,
      );
    }

    const extension = path.extname(originalName).toLowerCase();
    if (!rule.extensions.includes(extension)) {
      throw new UnsupportedFileTypeError(
        `"${extension || 'that file type'}" is not accepted here. Allowed: ${rule.extensions.join(', ')}.`,
      );
    }

    if (!rule.mimeTypes.includes(declaredMime)) {
      throw new UnsupportedFileTypeError(
        `Files of type ${declaredMime} are not accepted here.`,
      );
    }

    // Content check. Text-like formats have no signature, so they are exempt.
    if (!TEXT_LIKE.has(declaredMime)) {
      const detected = detectSignature(buffer);

      if (!detected) {
        throw new UnsupportedFileTypeError(
          'That file could not be recognised. It may be corrupt or renamed from another format.',
        );
      }

      const matches = ZIP_BACKED.has(declaredMime)
        ? detected === 'application/zip'
        : detected === declaredMime;

      if (!matches) {
        throw new UnsupportedFileTypeError(
          `That file claims to be ${declaredMime} but its contents are ${detected}.`,
        );
      }
    }

    if (this.scanner) {
      const clean = await this.scanner(buffer, originalName);
      if (!clean) {
        throw new ValidationError('That file was rejected by the malware scanner.');
      }
    }

    return {
      buffer,
      safeName: this.sanitiseName(originalName),
      extension,
      mimeType: declaredMime,
      sizeBytes: buffer.length,
      checksum: checksum(buffer),
    };
  }

  /**
   * Strips directory separators, control characters and leading dots so a name
   * can never escape its prefix or become hidden.
   */
  sanitiseName(originalName: string): string {
    const extension = path.extname(originalName).toLowerCase();
    const base = path.basename(originalName, path.extname(originalName));

    const safe = base
      // eslint-disable-next-line no-control-regex
      .replace(/[ -]/g, '')
      .replace(/[/\\]/g, '-')
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[.-]+/, '')
      .slice(0, 80);

    return `${safe || 'file'}${extension}`;
  }
}
