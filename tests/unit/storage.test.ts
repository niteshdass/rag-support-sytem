import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalFsStorage } from '../../src/infra/storage/localFs.js';

let baseDir: string;
let storage: LocalFsStorage;

beforeEach(async () => {
  baseDir = await mkdtemp(join(tmpdir(), 'supportpilot-storage-'));
  storage = new LocalFsStorage(baseDir);
});

afterEach(async () => {
  await rm(baseDir, { recursive: true, force: true });
});

describe('LocalFsStorage', () => {
  describe('put / get / delete roundtrip', () => {
    it('stores and retrieves a file', async () => {
      const buf = Buffer.from('hello world');
      const { fileKey } = await storage.put('tenant-a', 'docs/hello.txt', buf, 'text/plain');

      expect(fileKey).toBe('docs/hello.txt');

      const result = await storage.get('tenant-a', fileKey);
      expect(result.buffer.toString()).toBe('hello world');
      expect(result.mimeType).toBe('text/plain');
    });

    it('exists returns true after put, false after delete', async () => {
      await storage.put('tenant-a', 'file.pdf', Buffer.from('%PDF'), 'application/pdf');

      expect(await storage.exists('tenant-a', 'file.pdf')).toBe(true);

      await storage.delete('tenant-a', 'file.pdf');

      expect(await storage.exists('tenant-a', 'file.pdf')).toBe(false);
    });

    it('exists returns false for unknown file', async () => {
      expect(await storage.exists('tenant-a', 'ghost.txt')).toBe(false);
    });
  });

  describe('cross-tenant isolation', () => {
    it('get with wrong tenantId throws — file lives in a different tenant path', async () => {
      await storage.put('tenant-a', 'secret.txt', Buffer.from('sensitive'), 'text/plain');

      await expect(storage.get('tenant-b', 'secret.txt')).rejects.toThrow('File not found');
    });
  });

  describe('path traversal protection', () => {
    it('rejects fileKey with ../ prefix', async () => {
      await expect(storage.put('tenant-a', '../etc/passwd', Buffer.from('x'), 'text/plain'))
        .rejects.toThrow('Path traversal not allowed');
    });

    it('rejects fileKey with embedded ..', async () => {
      await expect(storage.get('tenant-a', 'docs/../../etc/passwd'))
        .rejects.toThrow('Path traversal not allowed');
    });

    it('rejects absolute fileKey', async () => {
      await expect(storage.get('tenant-a', '/etc/passwd'))
        .rejects.toThrow('Absolute paths not allowed');
    });

    it('rejects absolute fileKey in put', async () => {
      await expect(storage.put('tenant-a', '/tmp/evil', Buffer.from('x'), 'text/plain'))
        .rejects.toThrow('Absolute paths not allowed');
    });
  });
});
