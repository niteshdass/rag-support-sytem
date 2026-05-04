import { mkdir, readFile, writeFile, unlink, access } from 'node:fs/promises';
import { join, isAbsolute, normalize, dirname } from 'node:path';
import { FileStorage } from './index.js';

interface MetaFile {
  mimeType: string;
}

export class LocalFsStorage implements FileStorage {
  constructor(private readonly baseDir: string = join(process.cwd(), 'data', 'uploads')) {}

  private resolveKey(tenantId: string, fileKey: string): string {
    if (isAbsolute(fileKey)) {
      throw new Error(`Absolute paths not allowed: "${fileKey}"`);
    }

    const normalized = normalize(fileKey);
    if (normalized.startsWith('..') || normalized.includes('/..') || normalized.includes('\\..')){
      throw new Error(`Path traversal not allowed: "${fileKey}"`);
    }

    return join(this.baseDir, tenantId, normalized);
  }

  async put(tenantId: string, key: string, buffer: Buffer, mimeType: string): Promise<{ fileKey: string }> {
    const filePath = this.resolveKey(tenantId, key);
    const metaPath = filePath + '.meta.json';

    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
    await writeFile(metaPath, JSON.stringify({ mimeType } satisfies MetaFile));

    return { fileKey: key };
  }

  async get(tenantId: string, fileKey: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const filePath = this.resolveKey(tenantId, fileKey);
    const metaPath = filePath + '.meta.json';

    let buffer: Buffer;
    let meta: MetaFile;

    try {
      [buffer, meta] = await Promise.all([
        readFile(filePath),
        readFile(metaPath, 'utf8').then((raw) => JSON.parse(raw) as MetaFile),
      ]);
    } catch {
      throw new Error(`File not found: tenantId="${tenantId}" fileKey="${fileKey}"`);
    }

    return { buffer, mimeType: meta.mimeType };
  }

  async delete(tenantId: string, fileKey: string): Promise<void> {
    const filePath = this.resolveKey(tenantId, fileKey);
    const metaPath = filePath + '.meta.json';

    await Promise.all([unlink(filePath), unlink(metaPath)]);
  }

  async exists(tenantId: string, fileKey: string): Promise<boolean> {
    const filePath = this.resolveKey(tenantId, fileKey);
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
