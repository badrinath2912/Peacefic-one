import type { FilePurpose } from '@peacefic/shared';


import { CloudinaryStorageDriver } from './cloudinary.driver';
import { FileValidator, type VirusScanner } from './file-validator';
import { LocalStorageDriver } from './local.driver';
import { S3StorageDriver } from './s3.driver';
import type { ImageTransform, SignedUrlOptions, StorageDriver, StoredFile } from './types';

import { config } from '@/config/env';
import { logger } from '@/config/logger';
import { requestContext } from '@/config/request-context';

/** Derivative sizes applied when the driver can transform images. */
export const IMAGE_PRESETS: Partial<Record<FilePurpose, ImageTransform>> = {
  avatar: { width: 512, height: 512, fit: 'cover', quality: 82, format: 'auto' },
  college_logo: { width: 512, height: 512, fit: 'contain', quality: 90, format: 'auto' },
  // 'contain' not 'cover': a logo cropped to a square loses the wordmark.
  company_logo: { width: 512, height: 512, fit: 'contain', quality: 90, format: 'auto' },
};

export interface UploadRequest {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  purpose: FilePurpose;
  /** Deleted after a successful upload — used by "replace photo". */
  replacesKey?: string | null;
}

/**
 * The single entry point for uploads. Callers never touch a driver, so the
 * validation, tenant prefixing and image presets cannot be bypassed by
 * reaching for the SDK directly.
 */
export class StorageService {
  private readonly driver: StorageDriver;
  private readonly validator: FileValidator;

  constructor(driver?: StorageDriver, scanner?: VirusScanner) {
    this.driver = driver ?? StorageService.createDriver();
    this.validator = new FileValidator(scanner);
    logger.info('Storage driver ready', { driver: this.driver.name });
  }

  static createDriver(): StorageDriver {
    switch (config.storage.driver) {
      case 's3':
        return new S3StorageDriver();
      case 'cloudinary':
        return new CloudinaryStorageDriver();
      default:
        return new LocalStorageDriver();
    }
  }

  get driverName(): string {
    return this.driver.name;
  }

  async upload(request: UploadRequest): Promise<StoredFile> {
    const validated = await this.validator.validate(
      request.buffer,
      request.originalName,
      request.mimeType,
      request.purpose,
    );

    const collegeId = requestContext.tryGet()?.collegeId ?? null;

    const stored = await this.driver.upload({
      buffer: validated.buffer,
      originalName: validated.safeName,
      mimeType: validated.mimeType,
      purpose: request.purpose,
      collegeId,
      image: validated.mimeType.startsWith('image/') ? IMAGE_PRESETS[request.purpose] : undefined,
    });

    // Replacement deletes the old object only after the new one is safely
    // stored, so a failed upload never destroys the existing file.
    if (request.replacesKey) {
      await this.delete(request.replacesKey);
    }

    return stored;
  }

  async delete(key: string): Promise<void> {
    try {
      await this.driver.delete(key);
    } catch (error) {
      // An orphaned object costs pennies; failing the user's action over it
      // costs them their work. Logged for the cleanup job to reconcile.
      logger.warn('Could not delete a stored file', {
        key,
        driver: this.driver.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async getUrl(key: string, options?: SignedUrlOptions): Promise<string> {
    return this.driver.getUrl(key, options);
  }

  async exists(key: string): Promise<boolean> {
    return this.driver.exists(key);
  }
}
