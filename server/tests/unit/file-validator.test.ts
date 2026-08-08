import { FileValidator, PURPOSE_RULES } from '@/services/storage/file-validator';

/** Minimal but genuine file headers, so the magic-number checks are real. */
const FIXTURES = {
  png: Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(64, 1),
  ]),
  jpeg: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]),
  pdf: Buffer.concat([Buffer.from('%PDF-1.7\n', 'ascii'), Buffer.alloc(64, 1)]),
  zip: Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(64, 1)]),
  webp: Buffer.concat([
    Buffer.from('RIFF', 'ascii'),
    Buffer.alloc(4, 0),
    Buffer.from('WEBP', 'ascii'),
    Buffer.alloc(32, 1),
  ]),
  csv: Buffer.from('name,email\nMeera,meera@example.edu\n', 'utf8'),
  html: Buffer.from('<script>alert(1)</script>', 'utf8'),
};

describe('FileValidator', () => {
  const validator = new FileValidator();

  describe('accepts legitimate files', () => {
    it('accepts a real PNG as an avatar', async () => {
      const result = await validator.validate(FIXTURES.png, 'photo.png', 'image/png', 'avatar');
      expect(result.mimeType).toBe('image/png');
      expect(result.checksum).toHaveLength(64);
    });

    it('accepts a real PDF as a resume', async () => {
      const result = await validator.validate(FIXTURES.pdf, 'cv.pdf', 'application/pdf', 'resume');
      expect(result.safeName).toBe('cv.pdf');
    });

    it('accepts a WEBP, whose signature is split across the header', async () => {
      const result = await validator.validate(FIXTURES.webp, 'p.webp', 'image/webp', 'avatar');
      expect(result.mimeType).toBe('image/webp');
    });

    it('accepts an xlsx, which is a zip underneath', async () => {
      const result = await validator.validate(
        FIXTURES.zip,
        'roster.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'import',
      );
      expect(result.extension).toBe('.xlsx');
    });

    it('accepts a CSV, which has no magic number', async () => {
      const result = await validator.validate(FIXTURES.csv, 'roster.csv', 'text/csv', 'import');
      expect(result.sizeBytes).toBeGreaterThan(0);
    });
  });

  describe('rejects disguised content', () => {
    it('rejects an executable renamed to .png', async () => {
      // The declared type says image; the bytes say otherwise.
      await expect(
        validator.validate(FIXTURES.html, 'evil.png', 'image/png', 'avatar'),
      ).rejects.toMatchObject({ statusCode: 415 });
    });

    it('rejects a PDF uploaded as an avatar', async () => {
      await expect(
        validator.validate(FIXTURES.pdf, 'cv.png', 'image/png', 'avatar'),
      ).rejects.toMatchObject({ statusCode: 415 });
    });

    it('rejects an extension the purpose does not allow', async () => {
      await expect(
        validator.validate(FIXTURES.png, 'photo.exe', 'image/png', 'avatar'),
      ).rejects.toMatchObject({ statusCode: 415 });
    });

    it('rejects a MIME type the purpose does not allow', async () => {
      await expect(
        validator.validate(FIXTURES.zip, 'archive.zip', 'application/zip', 'avatar'),
      ).rejects.toMatchObject({ statusCode: 415 });
    });

    it('rejects unrecognisable bytes', async () => {
      await expect(
        validator.validate(Buffer.alloc(64, 7), 'mystery.png', 'image/png', 'avatar'),
      ).rejects.toMatchObject({ statusCode: 415 });
    });
  });

  describe('size limits', () => {
    it('rejects a file over the per-purpose limit', async () => {
      const oversized = Buffer.concat([
        FIXTURES.png,
        Buffer.alloc(PURPOSE_RULES.avatar.maxBytes + 1, 0),
      ]);

      await expect(
        validator.validate(oversized, 'huge.png', 'image/png', 'avatar'),
      ).rejects.toMatchObject({ statusCode: 413 });
    });

    it('rejects an empty file', async () => {
      await expect(
        validator.validate(Buffer.alloc(0), 'empty.png', 'image/png', 'avatar'),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('applies a larger limit to a resume than to an avatar', () => {
      expect(PURPOSE_RULES.resume.maxBytes).toBeGreaterThan(PURPOSE_RULES.avatar.maxBytes);
    });
  });

  describe('filename sanitisation', () => {
    it('discards path traversal segments entirely', () => {
      // basename() drops the directories, so nothing of the traversal survives.
      expect(validator.sanitiseName('../../etc/passwd.png')).toBe('passwd.png');
      expect(validator.sanitiseName('/absolute/path/photo.png')).toBe('photo.png');
      expect(validator.sanitiseName('C:\\Windows\\System32\\photo.png')).not.toContain('\\');
    });

    it('strips a leading dot so the file cannot become hidden', () => {
      expect(validator.sanitiseName('.htaccess.png')).not.toMatch(/^\./);
    });

    it('replaces characters a filesystem would object to', () => {
      expect(validator.sanitiseName('my photo<>:"|?*.png')).toBe('my-photo-.png');
    });

    it('preserves a reasonable name unchanged', () => {
      expect(validator.sanitiseName('student_photo-2024.png')).toBe('student_photo-2024.png');
    });

    it('truncates an absurdly long name', () => {
      const long = `${'a'.repeat(300)}.png`;
      expect(validator.sanitiseName(long).length).toBeLessThanOrEqual(84);
    });

    it('always yields a usable name', () => {
      expect(validator.sanitiseName('...png')).toBeTruthy();
    });
  });

  describe('virus scan extension point', () => {
    it('rejects a file the scanner flags', async () => {
      const scanning = new FileValidator(async () => false);

      await expect(
        scanning.validate(FIXTURES.png, 'photo.png', 'image/png', 'avatar'),
      ).rejects.toThrow(/malware/i);
    });

    it('accepts a file the scanner clears, and passes it the bytes', async () => {
      const scanner = jest.fn().mockResolvedValue(true);
      const scanning = new FileValidator(scanner);

      await scanning.validate(FIXTURES.png, 'photo.png', 'image/png', 'avatar');

      expect(scanner).toHaveBeenCalledWith(FIXTURES.png, 'photo.png');
    });
  });
});
