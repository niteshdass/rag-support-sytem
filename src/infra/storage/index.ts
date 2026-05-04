import { env } from '../../config/env.js';
import { LocalFsStorage } from './localFs.js';

export interface FileStorage {
  put(tenantId: string, key: string, buffer: Buffer, mimeType: string): Promise<{ fileKey: string }>;
  get(tenantId: string, fileKey: string): Promise<{ buffer: Buffer; mimeType: string }>;
  delete(tenantId: string, fileKey: string): Promise<void>;
  exists(tenantId: string, fileKey: string): Promise<boolean>;
}

let instance: FileStorage | null = null;

export function getStorage(): FileStorage {
  if (instance) return instance;

  const driver = env.STORAGE_DRIVER;

  if (driver === 'local') {
    instance = new LocalFsStorage();
    return instance;
  }

  throw new Error(`Unknown storage driver: "${driver}"`);
}
