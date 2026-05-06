import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HydratedDocument } from 'mongoose';
import type { SourceDocument } from '../../src/infra/mongo/models/Source.js';

import '../../src/domain/ingestion/connectors/slack.js';
import { getConnector } from '../../src/domain/ingestion/connectors/base.js';

function makeSource(config: Record<string, unknown>): HydratedDocument<SourceDocument> {
  return {
    tenantId: 'tenant-abc',
    type: 'connector',
    subtype: 'slack-history',
    config,
    addedBy: 'user-1',
    status: 'active',
  } as unknown as HydratedDocument<SourceDocument>;
}

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of it) out.push(item);
  return out;
}

// ---------------------------------------------------------------------------
// Fixture mode
// ---------------------------------------------------------------------------

describe('slack-history connector — fixture mode', () => {
  it('yields all resolved threads from fixture', async () => {
    const connector = getConnector('slack-history');
    const source = makeSource({
      botToken: 'xoxb-test',
      channelIds: ['C001SUPPORT'],
      fixtureMode: true,
    });
    const docs = await collect(connector.sync(source));
    expect(docs.length).toBe(3);
  });

  it('doc has expected fields', async () => {
    const connector = getConnector('slack-history');
    const source = makeSource({
      botToken: 'xoxb-test',
      channelIds: ['C001SUPPORT'],
      fixtureMode: true,
    });
    const docs = await collect(connector.sync(source));
    const first = docs[0]!;

    expect(first.externalId).toMatch(/^slack:/);
    expect(first.mimeType).toBe('text/plain');
    expect(first.visibility).toBe('internal');
    expect(first.content).toContain('Question:');
    expect(first.content).toContain('Reply:');
  });

  it('metadata includes channelId and threadTs', async () => {
    const connector = getConnector('slack-history');
    const source = makeSource({
      botToken: 'xoxb-test',
      channelIds: ['C001SUPPORT'],
      fixtureMode: true,
    });
    const docs = await collect(connector.sync(source));
    const meta = docs[0]!.metadata as Record<string, unknown>;
    expect(meta['channelId']).toBe('C001SUPPORT');
    expect(typeof meta['threadTs']).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// HTTP mode (mocked @slack/web-api module)
// ---------------------------------------------------------------------------

const mockHistory = vi.fn();
const mockReplies = vi.fn();
const mockInfo = vi.fn();

vi.mock('@slack/web-api', () => ({
  WebClient: vi.fn().mockImplementation(() => ({
    conversations: {
      history: mockHistory,
      replies: mockReplies,
      info: mockInfo,
    },
  })),
}));

describe('slack-history connector — HTTP mode (mocked)', () => {
  beforeEach(() => {
    mockHistory.mockResolvedValue({
      messages: [
        { ts: '111.000', text: 'How do I reset 2FA?', user: 'U001', reply_count: 1 },
        { ts: '222.000', text: 'No replies here', user: 'U002', reply_count: 0 },
      ],
      response_metadata: { next_cursor: '' },
    });
    mockReplies.mockResolvedValue({
      messages: [
        { ts: '111.000', text: 'How do I reset 2FA?', user: 'U001', reactions: [] },
        {
          ts: '111.100',
          text: 'Go to Admin → Security → Reset 2FA.',
          user: 'U003',
          reactions: [{ name: 'white_check_mark', users: ['U001'], count: 1 }],
        },
      ],
    });
    mockInfo.mockResolvedValue({ channel: { name: 'support-team' } });
  });

  it('yields resolved threads', async () => {
    // Re-import to pick up mock
    const { getConnector: gc } = await import('../../src/domain/ingestion/connectors/base.js');
    const connector = gc('slack-history');

    const source = makeSource({ botToken: 'xoxb-live', channelIds: ['C001SUPPORT'] });
    const docs = await collect(connector.sync(source));

    expect(docs.length).toBeGreaterThanOrEqual(1);
    expect(docs[0]!.content).toContain('How do I reset 2FA?');
    expect(docs[0]!.visibility).toBe('internal');
  });
});
