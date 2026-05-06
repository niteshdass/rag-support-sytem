import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { Octokit } from '@octokit/rest';
import type { HydratedDocument } from 'mongoose';
import type { SourceDocument } from '../../../infra/mongo/models/Source.js';
import { logger } from '../../../observability/logger.js';
import { registerConnector, type ConnectorDocument } from './base.js';

const GitHubConfigSchema = z.object({
  token: z.string().min(1),
  repos: z.array(z.object({ owner: z.string(), repo: z.string() })).min(1),
  fixtureMode: z.boolean().optional(),
  fixturePath: z.string().optional(),
});

type GitHubConfig = z.infer<typeof GitHubConfigSchema>;

interface GitHubFixtureDoc {
  externalId: string;
  title: string;
  url: string;
  content: string;
  visibility: 'customer-facing' | 'internal';
}

const DEFAULT_FIXTURE_PATH = new URL(
  '../../../../scripts/seed/fixtures/github-docs.json',
  import.meta.url,
).pathname;

const MD_EXTENSIONS = new Set(['.md', '.mdx', '.markdown']);

function isMdPath(path: string): boolean {
  const lower = path.toLowerCase();
  return MD_EXTENSIONS.has(lower.slice(lower.lastIndexOf('.')));
}

async function* syncRepo(
  octokit: Octokit,
  owner: string,
  repo: string,
): AsyncIterable<ConnectorDocument> {
  const { data: repoInfo } = await octokit.repos.get({ owner, repo });
  const visibility: 'customer-facing' | 'internal' = repoInfo.private ? 'internal' : 'customer-facing';
  const defaultBranch = repoInfo.default_branch;

  // README
  try {
    const { data: readme } = await octokit.repos.getReadme({ owner, repo });
    const content = Buffer.from(readme.content, 'base64').toString('utf-8');
    yield {
      externalId: `${owner}/${repo}/README`,
      title: `${repo} README`,
      url: readme.html_url ?? `https://github.com/${owner}/${repo}`,
      content,
      mimeType: 'text/markdown',
      visibility,
      metadata: { owner, repo, path: readme.path },
    };
  } catch {
    // no README — skip
  }

  // /docs/** markdown files
  try {
    const { data: tree } = await octokit.git.getTree({
      owner,
      repo,
      tree_sha: defaultBranch,
      recursive: '1',
    });

    const docsPaths = tree.tree.filter(
      (item) =>
        item.type === 'blob' &&
        item.path !== undefined &&
        item.path.startsWith('docs/') &&
        isMdPath(item.path),
    );

    for (const item of docsPaths) {
      if (!item.path || !item.sha) continue;
      const { data: blob } = await octokit.git.getBlob({ owner, repo, file_sha: item.sha });
      const content = Buffer.from(blob.content, 'base64').toString('utf-8');
      const title = item.path.split('/').pop()?.replace(/\.[^.]+$/, '') ?? item.path;

      yield {
        externalId: `${owner}/${repo}/${item.path}`,
        title,
        url: `https://github.com/${owner}/${repo}/blob/${defaultBranch}/${item.path}`,
        content,
        mimeType: 'text/markdown',
        visibility,
        metadata: { owner, repo, path: item.path },
      };
    }
  } catch {
    // no tree or docs dir — skip
  }

  // Closed issues with resolution comment
  for await (const resp of octokit.paginate.iterator(octokit.issues.listForRepo, {
    owner,
    repo,
    state: 'closed',
    per_page: 100,
  })) {
    for (const issue of resp.data) {
      if (issue.pull_request) continue;

      let resolution = '';
      try {
        const { data: comments } = await octokit.issues.listComments({
          owner,
          repo,
          issue_number: issue.number,
          per_page: 100,
        });
        resolution = comments[comments.length - 1]?.body ?? '';
      } catch {
        // skip if comments fail
      }

      yield {
        externalId: `${owner}/${repo}/issues/${issue.number}`,
        title: `[${repo}] ${issue.title}`,
        url: issue.html_url,
        content: `Title: ${issue.title}\nBody: ${issue.body ?? ''}\nResolution: ${resolution}`,
        mimeType: 'text/plain',
        visibility,
        metadata: { owner, repo, issueNumber: issue.number, labels: issue.labels },
      };
    }
  }

  // Wiki pages (best-effort — requires wiki to be enabled)
  try {
    const wikiCloneUrl = `https://github.com/${owner}/${repo}.wiki.git`;
    const { data: wikiPages } = await (octokit.request as (url: string, params: Record<string, unknown>) => Promise<{ data: Array<{ path: string; title: string; html_url: string; content_url: string }> }>)(
      'GET /repos/{owner}/{repo}/pages',
      { owner, repo },
    );

    for (const page of wikiPages) {
      try {
        const resp = await fetch(page.content_url);
        if (!resp.ok) continue;
        const content = await resp.text();
        yield {
          externalId: `${owner}/${repo}/wiki/${page.path}`,
          title: page.title,
          url: page.html_url,
          content,
          mimeType: 'text/markdown',
          visibility,
          metadata: { owner, repo, wikiPage: page.path, wikiCloneUrl },
        };
      } catch {
        // skip individual page failures
      }
    }
  } catch {
    // wiki not enabled or pages API unavailable
  }
}

async function* syncFixture(fixturePath: string): AsyncIterable<ConnectorDocument> {
  const raw = await readFile(fixturePath, 'utf-8');
  const docs = JSON.parse(raw) as GitHubFixtureDoc[];
  for (const doc of docs) {
    yield { ...doc, mimeType: 'text/markdown' };
  }
}

registerConnector({
  type: 'github',

  async *sync(source: HydratedDocument<SourceDocument>): AsyncIterable<ConnectorDocument> {
    const config = GitHubConfigSchema.parse(source.config);
    const log = logger.child({ connector: 'github', tenantId: source.tenantId });

    if (config.fixtureMode === true) {
      yield* syncFixture(config.fixturePath ?? DEFAULT_FIXTURE_PATH);
      return;
    }

    const octokit = new Octokit({ auth: config.token });
    let count = 0;

    for (const { owner, repo } of config.repos) {
      for await (const doc of syncRepo(octokit, owner, repo)) {
        yield doc;
        count++;
      }
    }

    log.info({ count }, 'github sync complete');
  },
});
