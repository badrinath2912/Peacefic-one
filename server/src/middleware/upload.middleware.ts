import multer from 'multer';

import { PURPOSE_RULES } from '@/services/storage/file-validator';

/**
 * Memory storage: files are validated (magic numbers, size, optional scan)
 * before anything is persisted, so nothing untrusted ever touches the disk.
 * The ceiling here is the largest per-purpose limit; the real check happens in
 * `FileValidator`, which knows which purpose is being uploaded.
 */
const MAX_BYTES = Math.max(...Object.values(PURPOSE_RULES).map((rule) => rule.maxBytes));

export const uploadSingle = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_BYTES,
    files: 1,
    // Caps the multipart body itself, not just the file part.
    fields: 10,
    parts: 12,
  },
}).single('file');

export const uploadImport = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PURPOSE_RULES.import.maxBytes, files: 1, fields: 5, parts: 6 },
}).single('file');
