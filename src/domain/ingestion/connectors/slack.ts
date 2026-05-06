import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { WebClient } from '@slack/web-api';
import type { HydratedDocument } from 'mongoose';
import type { SourceDocument } from '../../../infra/mongo/models/Source.js';
import { logger } from '../../../observability/logger.js';
import { registerConnector, type ConnectorDocument } from './base.js';

const SlackHistoryConfigSchema = z.object({
  botToken: z.string().min(1),
  channelIds: z.array(z.string()).min(1),
  resolvedReaction: z.string().default('white_check_mark'),
  fixtureMode: z.boolean().optional(),
  fixturePath: z.string().optional(),
});

type SlackHistoryConfig = z.infer<typeof SlackHistoryConfigSchema>;

interface SlackMessage {
  ts: string;
  text?: string;
  user?: string;
  reply_count?: number;
  replies?: Array<{ ts: string; user: string }>;
  reactions?: Array<{ name: string; users: string[]; count: number }>;
}

interface SlackThread {
  parentTs: string;
  messages: SlackMessage[];
}

interface SlackFixtureThread {
  channelId: string;
  thread: SlackThread;
  channelName: string;
}

const DEFAULT_FIXTURE_PATH = new URL(
  '../../../../scripts/seed/fixtures/slack-threads.json',
  import.meta.url,
).pathname;

function hasResolvedReaction(msg: SlackMessage, reaction: string): boolean {
  return (msg.reactions ?? []).some((r) => r.name === reaction);
}

function threadToContent(messages: SlackMessage[]): string {
  return messages
    .map((m, i) => `${i === 0 ? 'Question' : 'Reply'}: ${m.text ?? ''}`)
    .join('\n');
}

async function* fetchChannelThreads(
  client: WebClient,
  channelId: string,
  resolvedReaction: string,
): AsyncIterable<SlackThread> {
  let cursor: string | undefined;

  do {
    const resp = await client.conversations.history({
      channel: channelId,
      limit: 200,
      ...(cursor ? { cursor } : {}),
    });

    const messages = (resp.messages ?? []) as SlackMessage[];

    for (const msg of messages) {
      // Only process threads (messages with replies)
      if (!msg.reply_count || msg.reply_count === 0) continue;

      // Fetch the full thread
      const threadResp = await client.conversations.replies({
        channel: channelId,
        ts: msg.ts,
        limit: 100,
      });

      const threadMessages = (threadResp.messages ?? []) as SlackMessage[];

      // Check if any message in the thread has the resolved reaction
      const isResolved = threadMessages.some((m) =>
        hasResolvedReaction(m, resolvedReaction),
      );

      if (isResolved) {
        yield { parentTs: msg.ts, messages: threadMessages };
      }
    }

    cursor = resp.response_metadata?.next_cursor || undefined;
  } while (cursor);
}

async function getChannelName(client: WebClient, channelId: string): Promise<string> {
  try {
    const info = await client.conversations.info({ channel: channelId });
    return (info.channel as { name?: string }).name ?? channelId;
  } catch {
    return channelId;
  }
}

async function* syncFixture(fixturePath: string): AsyncIterable<ConnectorDocument> {
  const raw = await readFile(fixturePath, 'utf-8');
  const threads = JSON.parse(raw) as SlackFixtureThread[];

  for (const { channelId, thread, channelName } of threads) {
    yield threadToDoc(channelId, channelName, thread);
  }
}

function threadToDoc(
  channelId: string,
  channelName: string,
  thread: SlackThread,
): ConnectorDocument {
  const firstMessage = thread.messages[0];
  const preview = (firstMessage?.text ?? '').slice(0, 80);

  return {
    externalId: `slack:${channelId}:${thread.parentTs}`,
    title: preview || `Slack thread ${thread.parentTs}`,
    content: threadToContent(thread.messages),
    mimeType: 'text/plain',
    visibility: 'internal',
    metadata: {
      channelId,
      channelName,
      threadTs: thread.parentTs,
      messageCount: thread.messages.length,
    },
  };
}

registerConnector({
  type: 'slack-history',

  async *sync(source: HydratedDocument<SourceDocument>): AsyncIterable<ConnectorDocument> {
    const config = SlackHistoryConfigSchema.parse(source.config);
    const log = logger.child({ connector: 'slack-history', tenantId: source.tenantId });

    if (config.fixtureMode === true) {
      yield* syncFixture(config.fixturePath ?? DEFAULT_FIXTURE_PATH);
      return;
    }

    const client = new WebClient(config.botToken);
    let count = 0;

    for (const channelId of config.channelIds) {
      const channelName = await getChannelName(client, channelId);

      for await (const thread of fetchChannelThreads(client, channelId, config.resolvedReaction)) {
        yield threadToDoc(channelId, channelName, thread);
        count++;
      }
    }

    log.info({ count }, 'slack history sync complete');
  },
});
