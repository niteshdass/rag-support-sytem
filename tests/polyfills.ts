import { webcrypto } from 'crypto';

// Node 18 doesn't expose globalThis.crypto by default; MongoDB driver needs it
if (!globalThis.crypto) {
  (globalThis as typeof globalThis & { crypto: typeof webcrypto }).crypto = webcrypto;
}
