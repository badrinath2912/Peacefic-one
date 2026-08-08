import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { runInSystemContext } from '@/config/request-context';
import { LocalStorageDriver } from '@/services/storage/local.driver';
import { StorageError } from '@/services/storage/types';

describe('LocalStorageDriver', () => {
  let root: string;
  let driver: LocalStorageDriver;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'peacefic-storage-'));
    driver = new LocalStorageDriver(root);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const upload = () =>
    driver.upload({
      buffer: Buffer.from('hello'),
      originalName: 'photo.png',
      mimeType: 'image/png',
      purpose: 'avatar',
      collegeId: 'college-a',
    });

  it('writes a file and returns a retrievable key', async () => {
    const stored = await upload();

    expect(stored.key).toContain('college-a/avatar/');
    expect(stored.sizeBytes).toBe(5);
    expect(await driver.exists(stored.key)).toBe(true);
  });

  it('namespaces keys by tenant so two colleges never share a prefix', async () => {
    const a = await upload();

    const b = await driver.upload({
      buffer: Buffer.from('hello'),
      originalName: 'photo.png',
      mimeType: 'image/png',
      purpose: 'avatar',
      collegeId: 'college-b',
    });

    expect(a.key.startsWith('college-a/')).toBe(true);
    expect(b.key.startsWith('college-b/')).toBe(true);
  });

  it('does not let one upload overwrite another with the same name', async () => {
    const first = await upload();
    const second = await upload();

    expect(first.key).not.toBe(second.key);
    expect(await driver.exists(first.key)).toBe(true);
    expect(await driver.exists(second.key)).toBe(true);
  });

  it('deletes a file', async () => {
    const stored = await upload();
    await driver.delete(stored.key);
    expect(await driver.exists(stored.key)).toBe(false);
  });

  it('treats deleting a missing file as success', async () => {
    // Already gone is the desired end state.
    await expect(driver.delete('college-a/avatar/missing.png')).resolves.toBeUndefined();
  });

  it('refuses a key that escapes the storage root', async () => {
    // Without the guard this would resolve outside the upload directory.
    await expect(driver.delete('../../../etc/passwd')).rejects.toBeInstanceOf(StorageError);
    await expect(driver.exists('../../../etc/passwd')).resolves.toBe(false);
  });

  it('refuses to write outside the root rather than silently sanitising', async () => {
    // A tenant id that traverses is a bug or an attack; either way the upload
    // is rejected instead of being quietly rewritten to somewhere else.
    await expect(
      driver.upload({
        buffer: Buffer.from('x'),
        originalName: 'safe.png',
        mimeType: 'image/png',
        purpose: 'avatar',
        collegeId: '../../escape',
      }),
    ).rejects.toBeInstanceOf(StorageError);
  });

  it('reports that it cannot sign URLs', async () => {
    expect(driver.supportsSignedUrls).toBe(false);

    const stored = await upload();
    const url = await driver.getUrl(stored.key);
    expect(url).toContain('/uploads/');
  });

  it('works inside a system context', async () => {
    await runInSystemContext('storage-test', async () => {
      const stored = await upload();
      expect(stored.key).toBeTruthy();
    });
  });
});
