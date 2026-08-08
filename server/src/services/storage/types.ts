import type { FilePurpose } from '@peacefic/shared';

export interface StoredFile {
  /** Provider-agnostic identifier used for delete and signed-URL calls. */
  key: string;
  url: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  /** Set only by providers that transform images (Cloudinary). */
  width?: number | null;
  height?: number | null;
}

export interface UploadInput {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  purpose: FilePurpose;
  /** Namespaces the object so one tenant's files never share a prefix with another's. */
  collegeId: string | null;
  /** Requests a resized derivative where the driver supports it. */
  image?: ImageTransform;
}

export interface ImageTransform {
  width?: number;
  height?: number;
  fit?: 'cover' | 'contain';
  quality?: number;
  format?: 'webp' | 'jpeg' | 'png' | 'auto';
}

export interface SignedUrlOptions {
  expiresInSeconds?: number;
  downloadFileName?: string;
}

/**
 * Every driver implements this and nothing above it knows which one is active.
 * Swapping local for S3 is an environment variable, not a code change.
 */
export interface StorageDriver {
  readonly name: string;
  /** False for local disk: URLs are served directly and cannot be signed. */
  readonly supportsSignedUrls: boolean;

  upload(input: UploadInput): Promise<StoredFile>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  /** Signed when the driver supports it, otherwise the public URL. */
  getUrl(key: string, options?: SignedUrlOptions): Promise<string>;
}

export class StorageError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'StorageError';
  }
}
