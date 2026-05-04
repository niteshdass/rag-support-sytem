import crypto from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentModel } from '../../../../src/infra/mongo/models/Document.js';
import { DocumentService, type JobQueue } from '../../../../src/domain/knowledge/documentService.js';

describe('DocumentService.add', () => {
  let mongod: MongoMemoryServer;
  let service: DocumentService;
  let mockEnqueue: ReturnType<typeof vi.fn>;

  const tenantId = new mongoose.Types.ObjectId().toString();
  const sourceId = new mongoose.Types.ObjectId().toString();
  const addedBy = new mongoose.Types.ObjectId().toString();

  const baseInput = () => ({
    tenantId,
    sourceId,
    sourceType: 'upload' as const,
    title: 'Getting Started',
    content: 'This guide helps you get started with Acme.',
    visibility: 'customer-facing' as const,
    addedBy,
  });

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    await DocumentModel.syncIndexes();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    mockEnqueue = vi.fn().mockResolvedValue(undefined);
    const jobQueue: JobQueue = { enqueue: mockEnqueue };
    service = new DocumentService(jobQueue);
    await DocumentModel.deleteMany({});
  });

  it('insert path: creates doc with status=processing and correct contentHash', async () => {
    const doc = await service.add(baseInput());

    expect(doc.status).toBe('processing');
    expect(doc.title).toBe('Getting Started');
    expect(doc.visibility).toBe('customer-facing');
    expect(doc.contentHash).toBe(
      crypto.createHash('sha256').update(baseInput().content).digest('hex'),
    );

    const stored = await DocumentModel.findById(doc._id);
    expect(stored).not.toBeNull();
    expect(stored!.status).toBe('processing');
  });

  it('upsert path: same externalId updates content and re-enqueues job', async () => {
    const first = await service.add({
      ...baseInput(),
      externalId: 'zen-article-001',
      content: 'Original content.',
    });

    const second = await service.add({
      ...baseInput(),
      externalId: 'zen-article-001',
      content: 'Updated content.',
    });

    expect(second._id.toString()).toBe(first._id.toString());
    expect(second.content).toBe('Updated content.');
    expect(second.contentHash).toBe(
      crypto.createHash('sha256').update('Updated content.').digest('hex'),
    );

    const count = await DocumentModel.countDocuments({ tenantId: new mongoose.Types.ObjectId(tenantId) });
    expect(count).toBe(1);
  });

  it('enqueues ingest-document job with documentId on insert', async () => {
    const doc = await service.add(baseInput());

    expect(mockEnqueue).toHaveBeenCalledOnce();
    expect(mockEnqueue).toHaveBeenCalledWith('ingest-document', {
      documentId: doc._id.toString(),
    });
  });

  it('enqueues ingest-document job with documentId on upsert', async () => {
    mockEnqueue.mockClear();

    await service.add({ ...baseInput(), externalId: 'ext-job-test', content: 'v1' });
    const doc = await service.add({ ...baseInput(), externalId: 'ext-job-test', content: 'v2' });

    expect(mockEnqueue).toHaveBeenCalledTimes(2);
    expect(mockEnqueue).toHaveBeenLastCalledWith('ingest-document', {
      documentId: doc._id.toString(),
    });
  });

  it('defaults title to Untitled when omitted', async () => {
    const { title: _title, ...noTitle } = baseInput();
    const doc = await service.add(noTitle);
    expect(doc.title).toBe('Untitled');
  });

  it('defaults tags to empty array when omitted', async () => {
    const doc = await service.add(baseInput());
    expect(doc.tags).toEqual([]);
  });

  it('stores optional fields when provided', async () => {
    const doc = await service.add({
      ...baseInput(),
      fileKey: 'uploads/t1/doc1/file.pdf',
      fileMimeType: 'application/pdf',
      url: 'https://help.acme.com/start',
      tags: ['onboarding'],
    });

    expect(doc.fileKey).toBe('uploads/t1/doc1/file.pdf');
    expect(doc.fileMimeType).toBe('application/pdf');
    expect(doc.url).toBe('https://help.acme.com/start');
    expect(doc.tags).toEqual(['onboarding']);
  });
});
