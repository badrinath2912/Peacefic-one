import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { StorageError, type SignedUrlOptions, type StorageDriver, type StoredFile, type UploadInput } from './types';

import { config } from '@/config/env';
import { checksum, generateVerificationCode } from '@/utils/crypto';


const DEFAULT_EXPIRY_SECONDS = 15 * 60;

/**
 * Production driver. Objects are private and reached through short-lived
 * signed URLs — a résumé or certificate must not be readable by anyone who
 * guesses a bucket path.
 */
export class S3StorageDriver implements StorageDriver {
  readonly name = 's3';
  readonly supportsSignedUrls = true;

  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    const { region, bucket, accessKeyId, secretAccessKey } = config.storage.s3;

    if (!region || !bucket || !accessKeyId || !secretAccessKey) {
      throw new StorageError('S3 storage is selected but its configuration is incomplete.');
    }

    this.bucket = bucket;
    this.client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  private buildKey(input: UploadInput, safeName: string): string {
    const tenant = input.collegeId ?? 'platform';
    return `${tenant}/${input.purpose}/${generateVerificationCode()}-${safeName}`;
  }

  async upload(input: UploadInput): Promise<StoredFile> {
    const safeName = input.originalName;
    const key = this.buildKey(input, safeName);

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: input.buffer,
          ContentType: input.mimeType,
          // Forces a download rather than inline rendering, so an uploaded
          // SVG or HTML file cannot execute against the bucket's origin.
          ContentDisposition: `attachment; filename="${safeName}"`,
          ServerSideEncryption: 'AES256',
          Metadata: {
            purpose: input.purpose,
            college: input.collegeId ?? 'platform',
          },
        }),
      );
    } catch (error) {
      throw new StorageError('Could not upload that file to S3.', error);
    }

    return {
      key,
      // Private object: callers request a signed URL when they need one.
      url: await this.getUrl(key),
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
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      throw new StorageError('Could not delete that file from S3.', error);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async getUrl(key: string, options: SignedUrlOptions = {}): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ...(options.downloadFileName
        ? { ResponseContentDisposition: `attachment; filename="${options.downloadFileName}"` }
        : {}),
    });

    return getSignedUrl(this.client, command, {
      expiresIn: options.expiresInSeconds ?? DEFAULT_EXPIRY_SECONDS,
    });
  }
}
