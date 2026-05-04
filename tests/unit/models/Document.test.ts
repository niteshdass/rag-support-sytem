import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DocumentModel } from '../../../src/infra/mongo/models/Document.js';

describe('Document model', () => {
  let mongod: MongoMemoryServer;
  const tenantA = new mongoose.Types.ObjectId();
  const tenantB = new mongoose.Types.ObjectId();
  const sourceId = new mongoose.Types.ObjectId();
  const addedBy = new mongoose.Types.ObjectId();

  const base = () => ({
    tenantId: tenantA,
    sourceId,
    sourceType: 'upload' as const,
    title: 'Acme Help Article',
    content: 'How to export your data from Acme.',
    contentHash: 'abc123',
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

  it('creates and round-trips a document', async () => {
    const doc = await DocumentModel.create({
      ...base(),
      visibility: 'customer-facing',
      status: 'ready',
      url: 'https://help.acme.com/export',
      tags: ['export', 'data'],
    });

    const found = await DocumentModel.findById(doc._id);
    expect(found).not.toBeNull();
    expect(found!.title).toBe('Acme Help Article');
    expect(found!.visibility).toBe('customer-facing');
    expect(found!.status).toBe('ready');
    expect(found!.tags).toEqual(['export', 'data']);
    expect(found!.url).toBe('https://help.acme.com/export');
  });

  it('defaults visibility to draft', async () => {
    const doc = await DocumentModel.create({ ...base(), contentHash: 'hash-defaults' });
    expect(doc.visibility).toBe('draft');
  });

  it('defaults status to processing', async () => {
    const doc = await DocumentModel.create({ ...base(), contentHash: 'hash-status' });
    expect(doc.status).toBe('processing');
  });

  it('defaults tags to empty array', async () => {
    const doc = await DocumentModel.create({ ...base(), contentHash: 'hash-tags' });
    expect(doc.tags).toEqual([]);
  });

  it('stores optional fields', async () => {
    const doc = await DocumentModel.create({
      ...base(),
      contentHash: 'hash-optional',
      externalId: 'ext-001',
      fileKey: 'uploads/tenantA/docId/file.pdf',
      fileMimeType: 'application/pdf',
      processingError: 'parse failed',
      status: 'failed',
    });
    expect(doc.externalId).toBe('ext-001');
    expect(doc.fileKey).toBe('uploads/tenantA/docId/file.pdf');
    expect(doc.fileMimeType).toBe('application/pdf');
    expect(doc.processingError).toBe('parse failed');
  });

  it('enforces unique (tenantId, sourceId, externalId) sparse index', async () => {
    await DocumentModel.create({
      ...base(),
      contentHash: 'hash-uniq-1',
      externalId: 'ext-dup',
    });
    await expect(
      DocumentModel.create({
        ...base(),
        contentHash: 'hash-uniq-2',
        externalId: 'ext-dup',
      }),
    ).rejects.toThrow();
  });

  it('allows two docs without externalId (sparse index)', async () => {
    await DocumentModel.create({ ...base(), contentHash: 'hash-sparse-1' });
    await DocumentModel.create({ ...base(), contentHash: 'hash-sparse-2' });
  });

  it('forTenant() scopes to correct tenant', async () => {
    await DocumentModel.create({
      tenantId: tenantB,
      sourceId,
      sourceType: 'paste',
      title: 'ByteStore doc',
      content: 'Bytestore content',
      contentHash: 'bytestore-hash',
      addedBy,
    });

    const aDocs = await DocumentModel.forTenant(tenantA).find();
    const bDocs = await DocumentModel.forTenant(tenantB).find();

    expect(aDocs.every(d => d.tenantId.equals(tenantA))).toBe(true);
    expect(bDocs.every(d => d.tenantId.equals(tenantB))).toBe(true);
    expect(bDocs).toHaveLength(1);
  });
});
