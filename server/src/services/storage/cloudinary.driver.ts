import { v2 as cloudinary, type UploadApiOptions, type UploadApiResponse } from 'cloudinary';

import {
  StorageError,
  type ImageTransform,
  type SignedUrlOptions,
  type StorageDriver,
  type StoredFile,
  type UploadInput,
} from './types';

import { config } from '@/config/env';
import { checksum } from '@/utils/crypto';


/**
 * Image-oriented driver. Chosen when the product wants server-side resizing and
 * format negotiation without running an image pipeline — Cloudinary returns
 * WebP to browsers that accept it and JPEG to those that do not.
 */
export class CloudinaryStorageDriver implements StorageDriver {
  readonly name = 'cloudinary';
  readonly supportsSignedUrls = true;

  constructor() {
    const { cloudName, apiKey, apiSecret } = config.storage.cloudinary;

    if (!cloudName || !apiKey || !apiSecret) {
      throw new StorageError('Cloudinary storage is selected but its configuration is incomplete.');
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
  }

  private transformation(image?: ImageTransform): Record<string, unknown>[] {
    if (!image) return [];

    return [
      {
        width: image.width,
        height: image.height,
        crop: image.fit === 'contain' ? 'fit' : 'fill',
        gravity: image.fit === 'contain' ? undefined : 'auto',
        quality: image.quality ?? 'auto',
        fetch_format: image.format ?? 'auto',
      },
    ];
  }

  async upload(input: UploadInput): Promise<StoredFile> {
    const folder = `peacefic/${input.collegeId ?? 'platform'}/${input.purpose}`;
    const isImage = input.mimeType.startsWith('image/');

    const options: UploadApiOptions = {
      folder,
      // `authenticated` keeps the asset private; a delivery URL must be signed.
      type: 'authenticated',
      resource_type: isImage ? 'image' : 'raw',
      use_filename: true,
      unique_filename: true,
      overwrite: false,
      ...(isImage && input.image ? { transformation: this.transformation(input.image) } : {}),
    };

    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(options, (error, response) => {
        if (error || !response) {
          reject(new StorageError('Could not upload that file to Cloudinary.', error));
          return;
        }
        resolve(response);
      });

      stream.end(input.buffer);
    });

    return {
      key: result.public_id,
      url: result.secure_url,
      fileName: input.originalName,
      mimeType: input.mimeType,
      sizeBytes: result.bytes ?? input.buffer.length,
      checksum: checksum(input.buffer),
      width: result.width ?? null,
      height: result.height ?? null,
    };
  }

  async delete(key: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(key, { type: 'authenticated', invalidate: true });
    } catch (error) {
      throw new StorageError('Could not delete that file from Cloudinary.', error);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await cloudinary.api.resource(key, { type: 'authenticated' });
      return true;
    } catch {
      return false;
    }
  }

  async getUrl(key: string, options: SignedUrlOptions = {}): Promise<string> {
    const expiresAt = Math.floor(Date.now() / 1000) + (options.expiresInSeconds ?? 15 * 60);

    return cloudinary.utils.private_download_url(key, '', {
      expires_at: expiresAt,
      attachment: Boolean(options.downloadFileName),
    });
  }
}
