import { App } from '@slack/bolt';
import type { KnownBlock } from '@slack/types/dist/block-kit/blocks.js';
import { env } from '../../config/env.js';
import { SlackInstallModel } from '../../infra/mongo/models/SlackInstall.js';
import { logger } from '../../observability/logger.js';

interface Citation {
  documentId: string;
  snippet: string;
  score: number;
  document?: {
    title?: string;
    url?: string;
  };
}

interface QueryResponse {
  text: string;
  citations: Citation[];
  confidence: number;
  route: 'auto' | 'draft';
}

async function callQueryEndpoint(
  tenantId: string,
  question: string,
  slackUserId: string,
): Promise<QueryResponse> {
  const url = `${env.INTERNAL_API_URL}/api/query`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantId,
      query: question,
      audience: 'agent',
      context: { slackUserId },
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Query API error ${resp.status}: ${body}`);
  }

  return (await resp.json()) as QueryResponse;
}

function buildAnswerBlocks(
  question: string,
  answer: QueryResponse,
): KnownBlock[] {
  const blocks: KnownBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Question:* ${question}`,
      },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: answer.text,
      },
    },
  ];

  if (answer.citations.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '*Sources:*' },
    });

    const citationButtons = answer.citations.map((c, i) => {
      const label = c.document?.title ?? `Source ${i + 1}`;
      const url = c.document?.url;

      if (url) {
        return {
          type: 'button',
          text: { type: 'plain_text', text: label.slice(0, 75), emoji: false },
          url,
          action_id: `citation_${i}`,
        };
      }

      return {
        type: 'button',
        text: { type: 'plain_text', text: label.slice(0, 75), emoji: false },
        value: c.documentId,
        action_id: `citation_${i}`,
      };
    });

    blocks.push({
      type: 'actions',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      elements: citationButtons.slice(0, 5) as any,
    });
  }

  const confidencePct = Math.round(answer.confidence * 100);
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Confidence: ${confidencePct}% · Route: ${answer.route}`,
      },
    ],
  });

  return blocks;
}

export function createSlackApp(): App {
  const signingSecret = env.SLACK_SIGNING_SECRET;
  const token = env.SLACK_BOT_TOKEN;

  if (!signingSecret || !token) {
    throw new Error('SLACK_SIGNING_SECRET and SLACK_BOT_TOKEN are required');
  }

  const app = new App({
    token,
    signingSecret,
    ...(env.SLACK_APP_TOKEN
      ? { socketMode: true, appToken: env.SLACK_APP_TOKEN }
      : {}),
  });

  app.command('/ask', async ({ command, ack, respond }) => {
    await ack();

    const question = command.text.trim();
    if (!question) {
      await respond({ text: 'Usage: `/ask <your question>`', response_type: 'ephemeral' });
      return;
    }

    const teamId = command.team_id;

    try {
      const install = await SlackInstallModel.findOne({ teamId });
      if (!install) {
        await respond({
          text: 'This workspace is not linked to a SupportPilot tenant. Ask your admin to connect Slack in the dashboard.',
          response_type: 'ephemeral',
        });
        return;
      }

      await respond({
        text: `Searching knowledge base for: _${question}_`,
        response_type: 'in_channel',
      });

      const answer = await callQueryEndpoint(
        install.tenantId.toString(),
        question,
        command.user_id,
      );

      await respond({
        response_type: 'in_channel',
        blocks: buildAnswerBlocks(question, answer),
        text: answer.text,
      });
    } catch (err) {
      logger.error({ err, teamId, question }, 'slack /ask command failed');
      await respond({
        text: 'Something went wrong while searching the knowledge base. Please try again.',
        response_type: 'ephemeral',
      });
    }
  });

  // No-op handler for citation button clicks (prevents "operation_timeout" in Slack)
  app.action(/^citation_\d+$/, async ({ ack }) => {
    await ack();
  });

  return app;
}

export async function startSlackApp(): Promise<void> {
  const app = createSlackApp();
  const port = 3001;
  await app.start(port);
  logger.info({ port }, 'slack bolt app started');
}
