import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { DocumentModel } from '../../../src/infra/mongo/models/Document.js';
import { ChunkModel } from '../../../src/infra/mongo/models/Chunk.js';

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any import that transitively loads them
// ---------------------------------------------------------------------------
vi.mock('../../../src/domain/embeddings/cachedEmbedder.js', () => ({
  embedWithCache: vi.fn(),
}));

vi.mock('../../../src/infra/qdrant/client.js', () => ({
  ensureCollection: vi.fn().mockResolvedValue(undefined),
  upsertPoints: vi.fn().mockResolvedValue(undefined),
  deletePoints: vi.fn().mockResolvedValue(undefined),
  deleteByFilter: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/infra/meilisearch/client.js', () => ({
  ensureIndex: vi.fn().mockResolvedValue(undefined),
  addDocs: vi.fn().mockResolvedValue(undefined),
  deleteDocs: vi.fn().mockResolvedValue(undefined),
}));

// Also mock the chunker so tests control chunk output without real tokenisation
vi.mock('../../../src/domain/ingestion/chunker.js', () => ({
  chunk: vi.fn(),
}));

import { runIngestDocument } from '../../../src/jobs/ingestDocument.js';
import { embedWithCache } from '../../../src/domain/embeddings/cachedEmbedder.js';
import { chunk } from '../../../src/domain/ingestion/chunker.js';
import * as qdrantClient from '../../../src/infra/qdrant/client.js';
import * as meiliClient from '../../../src/infra/meilisearch/client.js';

const mockChunk = vi.mocked(chunk);
const mockEmbedWithCache = vi.mocked(embedWithCache);
const mockUpsertPoints = vi.mocked(qdrantClient.upsertPoints);
const mockAddDocs = vi.mocked(meiliClient.addDocs);

// ---------------------------------------------------------------------------
// MongoDB setup
// ---------------------------------------------------------------------------
let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

// Seed data helpers
const TENANT_ID = new mongoose.Types.ObjectId();
const SOURCE_ID = new mongoose.Types.ObjectId();
const USER_ID = new mongoose.Types.ObjectId();

function makeDoc(overrides: Partial<Parameters<typeof DocumentModel.create>[0]> = {}) {
  return DocumentModel.create({
    tenantId: TENANT_ID,
    sourceId: SOURCE_ID,
    sourceType: 'upload' as const,
    title: 'Test doc',
    content: 'Some content about our product.',
    contentHash: 'abc123',
    visibility: 'customer-facing' as const,
    addedBy: USER_ID,
    status: 'processing' as const,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Per-test setup: default mock behaviour + collection cleanup
// ---------------------------------------------------------------------------
beforeEach(async () => {
  await Promise.all([
    DocumentModel.deleteMany({ tenantId: TENANT_ID }),
    ChunkModel.deleteMany({ tenantId: TENANT_ID }),
  ]);

  mockChunk.mockReturnValue([
    { text: 'chunk one', position: 0 },
    { text: 'chunk two', position: 1 },
  ]);
  mockEmbedWithCache.mockResolvedValue([
    new Float32Array([0.1, 0.2, 0.3]),
    new Float32Array([0.4, 0.5, 0.6]),
  ]);

  vi.mocked(qdrantClient.ensureCollection).mockResolvedValue(undefined);
  vi.mocked(qdrantClient.upsertPoints).mockResolvedValue(undefined);
  vi.mocked(qdrantClient.deletePoints).mockResolvedValue(undefined);
  vi.mocked(meiliClient.ensureIndex).mockResolvedValue(undefined);
  vi.mocked(meiliClient.addDocs).mockResolvedValue(undefined);
  vi.mocked(meiliClient.deleteDocs).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('runIngestDocument', () => {
  describe('happy path', () => {
    it('saves chunks to Mongo with correct tenant + visibility', async () => {
      const doc = await makeDoc();

      await runIngestDocument(doc._id.toString());

      const chunks = await ChunkModel.find({ tenantId: TENANT_ID, documentId: doc._id });
      expect(chunks).toHaveLength(2);

      for (const c of chunks) {
        expect(c.tenantId.toString()).toBe(TENANT_ID.toString());
        expect(c.documentId.toString()).toBe(doc._id.toString());
        expect(c.visibility).toBe('customer-facing');
        expect(c.qdrantPointId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
      }

      const texts = chunks.map(c => c.text).sort();
      expect(texts).toEqual(['chunk one', 'chunk two'].sort());
    });

    it('marks document status=ready', async () => {
      const doc = await makeDoc();
      await runIngestDocument(doc._id.toString());

      const updated = await DocumentModel.findById(doc._id);
      expect(updated?.status).toBe('ready');
    });

    it('upserts vectors in Qdrant with tenantId + visibility in payload', async () => {
      const doc = await makeDoc({ visibility: 'internal' });
      mockEmbedWithCache.mockResolvedValue([
        new Float32Array([0.1, 0.2, 0.3]),
        new Float32Array([0.4, 0.5, 0.6]),
      ]);

      await runIngestDocument(doc._id.toString());

      expect(mockUpsertPoints).toHaveBeenCalledOnce();
      const [collection, points] = mockUpsertPoints.mock.calls[0]!;
      expect(collection).toBe('chunks');
      expect(points).toHaveLength(2);

      for (const p of points) {
        expect(p.payload['tenantId']).toBe(TENANT_ID.toString());
        expect(p.payload['documentId']).toBe(doc._id.toString());
        expect(p.payload['visibility']).toBe('internal');
        expect(p.vector).toHaveLength(3); // mocked 3-dim vectors
      }
    });

    it('adds docs to Meilisearch with correct tenant index and visibility', async () => {
      const doc = await makeDoc();
      await runIngestDocument(doc._id.toString());

      expect(mockAddDocs).toHaveBeenCalledOnce();
      const [tenantArg, docs] = mockAddDocs.mock.calls[0]!;
      expect(tenantArg).toBe(TENANT_ID.toString());
      expect(docs).toHaveLength(2);

      for (const d of docs) {
        expect(d.documentId).toBe(doc._id.toString());
        expect(d.visibility).toBe('customer-facing');
        expect(typeof d.id).toBe('string');
        expect(typeof d.text).toBe('string');
      }
    });

    it('deletes stale chunks before re-ingesting', async () => {
      const doc = await makeDoc();

      // First ingest
      await runIngestDocument(doc._id.toString());
      const firstChunks = await ChunkModel.find({ tenantId: TENANT_ID, documentId: doc._id });
      expect(firstChunks).toHaveLength(2);

      // Reset doc status to allow re-ingest
      await DocumentModel.findByIdAndUpdate(doc._id, { $set: { status: 'processing' } });
      vi.clearAllMocks();

      // Default mocks still return 2 chunks
      mockChunk.mockReturnValue([
        { text: 'new chunk A', position: 0 },
        { text: 'new chunk B', position: 1 },
      ]);
      mockEmbedWithCache.mockResolvedValue([
        new Float32Array([1, 0, 0]),
        new Float32Array([0, 1, 0]),
      ]);

      vi.mocked(qdrantClient.ensureCollection).mockResolvedValue(undefined);
      vi.mocked(qdrantClient.upsertPoints).mockResolvedValue(undefined);
      vi.mocked(qdrantClient.deletePoints).mockResolvedValue(undefined);
      vi.mocked(meiliClient.ensureIndex).mockResolvedValue(undefined);
      vi.mocked(meiliClient.addDocs).mockResolvedValue(undefined);
      vi.mocked(meiliClient.deleteDocs).mockResolvedValue(undefined);

      await runIngestDocument(doc._id.toString());

      // Old stale chunks purged, new ones inserted
      const finalChunks = await ChunkModel.find({ tenantId: TENANT_ID, documentId: doc._id });
      expect(finalChunks).toHaveLength(2);
      const texts = finalChunks.map(c => c.text).sort();
      expect(texts).toEqual(['new chunk A', 'new chunk B'].sort());

      // Qdrant deletePoints was called for stale point IDs
      expect(vi.mocked(qdrantClient.deletePoints)).toHaveBeenCalledOnce();
    });
  });

  describe('failure path', () => {
    it('sets status=failed when chunker throws', async () => {
      const doc = await makeDoc();
      mockChunk.mockImplementation(() => {
        throw new Error('parse error');
      });

      await expect(runIngestDocument(doc._id.toString())).rejects.toThrow('parse error');

      const updated = await DocumentModel.findById(doc._id);
      expect(updated?.status).toBe('failed');
      expect(updated?.processingError).toBe('parse error');
    });

    it('sets status=failed when chunker returns no chunks', async () => {
      const doc = await makeDoc();
      mockChunk.mockReturnValue([]);

      await expect(runIngestDocument(doc._id.toString())).rejects.toThrow(
        'Chunker produced 0 chunks',
      );

      const updated = await DocumentModel.findById(doc._id);
      expect(updated?.status).toBe('failed');
      expect(updated?.processingError).toContain('0 chunks');
    });

    it('sets status=failed when embedding fails', async () => {
      const doc = await makeDoc();
      mockEmbedWithCache.mockRejectedValue(new Error('model load failed'));

      await expect(runIngestDocument(doc._id.toString())).rejects.toThrow('model load failed');

      const updated = await DocumentModel.findById(doc._id);
      expect(updated?.status).toBe('failed');
      expect(updated?.processingError).toBe('model load failed');
    });

    it('throws for unknown documentId', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      await expect(runIngestDocument(fakeId)).rejects.toThrow('Document not found');
    });
  });
});
