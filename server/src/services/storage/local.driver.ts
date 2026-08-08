import fs from 'node:fs/promises';
import path from 'node:path';

import { StorageError, type SignedUrlOptions, type StorageDriver, type StoredFile, type UploadInput } from './types';

import { config } from '@/config/env';
import { checksum, generateVerificationCode } from '@/utils/crypto';


/**
 * Development driver. Files land under `LOCAL_UPLOAD_DIR` and are served by the
 * static handler in `app.ts`, which sets `nosniff` so an uploaded HTML file
 * cannot execute in the API origin.
 */
export class LocalStorageDriver implements StorageDriver {
  readonly name = 'local';
  readonly supportsSignedUrls = false;

  private readonly root: string;

  constructor(rootDir = config.storage.localDir) {
    this.root = path.resolve(process.cwd(), rootDir);
  }

  private buildKey(input: UploadInput, safeName: string): string {
    const tenant = input.collegeId ?? 'platform';
    // A random segment stops one upload overwriting another with the same name
    // and makes keys unguessable.
    return `${tenant}/${input.purpose}/${generateVerificationCode()}-${safeName}`;
  }

  /** Resolves a key inside the root, refusing anything that escapes it. */
  private resolveKey(key: string): string {
    const target = path.resolve(this.root, key);
    const root = this.root.endsWith(path.sep) ? this.root : `${this.root}${path.sep}`;

    if (!target.startsWith(root)) {
      // Path traversal: `../../etc/passwd` must not resolve outside the root.
      throw new StorageError('Refusing to access a path outside the storage root.');
    }

    return target;
  }

  async upload(input: UploadInput): Promise<StoredFile> {
    const safeName = path.basename(input.originalName);
    const key = this.buildKey(input, safeName);
    const target = this.resolveKey(key);

    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, input.buffer);

    return {
      key,
      url: `${config.apiBaseUrl}/uploads/${key.split('/').map(encodeURIComponent).join('/')}`,
      fileName: safeName,
      mimeType: input.mimeType,
      sizeBytes: input.buffer.length,
      checksum: checksum(input.buffer),
      width: null,
      height: null,
    };
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolveKey(key));
    } catch (error) {
      // Already gone is the desired end state, not a failure.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new StorageError('Could not delete that file.', error);
      }
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolveKey(key));
      return true;
    } catch {
      return false;
    }
  }

  async getUrl(key: string, _options?: SignedUrlOptions): Promise<string> {
    return `${config.apiBaseUrl}/uploads/${key.split('/').map(encodeURIComponent).join('/')}`;
  }
}
