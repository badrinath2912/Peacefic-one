import { FILE_PURPOSE, type FilePurpose } from '@peacefic/shared';
import type { Request, Response } from 'express';

import { ValidationError } from '@/errors';
import { AUDIT_ACTIONS, type AuditService } from '@/services/audit.service';
import type { StorageService } from '@/services/storage/storage.service';
import { sendCreated, sendSuccess } from '@/utils/response';

export class FileController {
  constructor(
    private readonly storageService: StorageService,
    private readonly auditService: AuditService,
  ) {}

  upload = async (req: Request, res: Response): Promise<Response> => {
    const file = req.file;

    if (!file) {
      throw new ValidationError('No file was received.', [
        { field: 'file', message: 'Choose a file to upload' },
      ]);
    }

    const purpose = (req.body as { purpose?: string }).purpose;

    if (!purpose || !FILE_PURPOSE.includes(purpose as FilePurpose)) {
      throw new ValidationError('A valid upload purpose is required.', [
        { field: 'purpose', message: `One of: ${FILE_PURPOSE.join(', ')}` },
      ]);
    }

    const replacesKey = (req.body as { replacesKey?: string }).replacesKey || null;

    const stored = await this.storageService.upload({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      purpose: purpose as FilePurpose,
      replacesKey,
    });

    await this.auditService.log({
      action: 'file.uploaded',
      category: 'data',
      entity: { type: 'File', label: stored.fileName },
      metadata: {
        purpose,
        sizeBytes: stored.sizeBytes,
        mimeType: stored.mimeType,
        replaced: Boolean(replacesKey),
      },
    });

    return sendCreated(res, stored);
  };

  /** Mints a short-lived URL for a private object. */
  signedUrl = async (req: Request, res: Response): Promise<Response> => {
    const { key } = req.body as { key: string; downloadFileName?: string };

    const url = await this.storageService.getUrl(key, {
      downloadFileName: (req.body as { downloadFileName?: string }).downloadFileName,
    });

    return sendSuccess(res, { url, expiresInSeconds: 900 });
  };

  remove = async (req: Request, res: Response): Promise<Response> => {
    const { key } = req.body as { key: string };

    await this.storageService.delete(key);

    await this.auditService.log({
      action: AUDIT_ACTIONS.STUDENT_UPDATED,
      category: 'data',
      severity: 'info',
      entity: { type: 'File', label: key },
      metadata: { deletedKey: key },
    });

    return sendSuccess(res, { message: 'File removed.' });
  };
}
