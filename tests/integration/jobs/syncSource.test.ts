import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { SourceModel } from '../../../src/infra/mongo/models/Source.js';
import { DocumentModel } from '../../../src/infra/mongo/models/Document.js';
import {
  _resetRegistry,
  registerConnector,
  type Connector,
  type ConnectorDocument,
} from '../../../src/domain/ingestion/connectors/base.js';

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

vi.mock('../../../src/domain/ingestion/chunker.js', () => ({
  chunk: vi.fn().mockReturnValue([{ text: 'chunk', position: 0 }]),
}));

import { runSyncSource } from '../../../src/jobs/syncSource.js';
import { embedWithCache } from '../../../src/domain/embeddings/cachedEmbedder.js';

vi.mocked(embedWithCache).mockResolvedValue([new Float32Array([0.1, 0.2, 0.3])]);

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

// ---------------------------------------------------------------------------
// Fake job queue (captures enqueue calls without real Agenda)
// ---------------------------------------------------------------------------
const enqueuedJobs: Array<{ jobName: string; data: Record<string, unknown> }> = [];
const fakeJobQueue = {
  async enqueue(jobName: string, data: Record<string, unknown>) {
    enqueuedJobs.push({ jobName, data });
  },
};

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------
const TENANT_ID = new mongoose.Types.ObjectId();
const USER_ID = new mongoose.Types.ObjectId();

const FIXTURES: ConnectorDocument[] = [
  { externalId: 'ext-1', title: 'Article One', content: 'Content of article one.' },
  { externalId: 'ext-2', title: 'Article Two', content: 'Content of article two.' },
  { externalId: 'ext-3', title: 'Article Three', content: 'Content of article three.', url: 'https://example.com/3' },
];

function makeFakeConnector(): Connector {
  return {
    type: 'fake',
    async *sync() {
      for (const doc of FIXTURES) {
        yield doc;
      }
    },
  };
}

async function makeSource(overrides: Record<string, unknown> = {}) {
  return SourceModel.create({
    tenantId: TENANT_ID,
    type: 'connector',
    subtype: 'fake',
    config: {},
    status: 'active',
    addedBy: USER_ID,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Per-test teardown
// ---------------------------------------------------------------------------
beforeEach(async () => {
  enqueuedJobs.length = 0;
  vi.mocked(embedWithCache).mockResolvedValue([new Float32Array([0.1, 0.2, 0.3])]);
  await Promise.all([
    SourceModel.deleteMany({ tenantId: TENANT_ID }),
    DocumentModel.deleteMany({ tenantId: TENANT_ID }),
  ]);
  _resetRegistry();
  registerConnector(makeFakeConnector());
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('runSyncSource', () => {
  it('creates a document for each yielded connector doc', async () => {
    const source = await makeSource();

    await runSyncSource(source._id.toString(), fakeJobQueue);

    const docs = await DocumentModel.find({ tenantId: TENANT_ID, sourceId: source._id });
    expect(docs).toHaveLength(3);

    const externalIds = docs.map(d => d.externalId).sort();
    expect(externalIds).toEqual(['ext-1', 'ext-2', 'ext-3'].sort());
  });

  it('sets sourceType=connector and visibility=customer-facing on all docs', async () => {
    const source = await makeSource();

    await runSyncSource(source._id.toString(), fakeJobQueue);

    const docs = await DocumentModel.find({ tenantId: TENANT_ID });
    for (const d of docs) {
      expect(d.sourceType).toBe('connector');
      expect(d.visibility).toBe('customer-facing');
    }
  });

  it('enqueues ingest-document job for each created doc', async () => {
    const source = await makeSource();

    await runSyncSource(source._id.toString(), fakeJobQueue);

    expect(enqueuedJobs).toHaveLength(3);
    for (const j of enqueuedJobs) {
      expect(j.jobName).toBe('ingest-document');
      expect(typeof j.data['documentId']).toBe('string');
    }
  });

  it('marks source status=active and sets lastSyncedAt on success', async () => {
    const source = await makeSource();
    const before = new Date();

    await runSyncSource(source._id.toString(), fakeJobQueue);

    const updated = await SourceModel.findById(source._id);
    expect(updated?.status).toBe('active');
    expect(updated?.lastSyncedAt).toBeDefined();
    expect(updated!.lastSyncedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it('marks source status=error when connector throws', async () => {
    _resetRegistry();
    registerConnector({
      type: 'fake',
      async *sync() {
        throw new Error('connector exploded');
        // eslint-disable-next-line no-unreachable
        yield { externalId: 'x', title: 'x', content: 'x' };
      },
    });

    const source = await makeSource();

    await expect(runSyncSource(source._id.toString(), fakeJobQueue)).rejects.toThrow(
      'connector exploded',
    );

    const updated = await SourceModel.findById(source._id);
    expect(updated?.status).toBe('error');
  });

  it('throws for unknown sourceId', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    await expect(runSyncSource(fakeId, fakeJobQueue)).rejects.toThrow('Source not found');
  });

  it('throws when no connector registered for subtype', async () => {
    _resetRegistry(); // empty registry
    const source = await makeSource({ subtype: 'unregistered' });

    await expect(runSyncSource(source._id.toString(), fakeJobQueue)).rejects.toThrow(
      'No connector registered for type: unregistered',
    );
  });
});
