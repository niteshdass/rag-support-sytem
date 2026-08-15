import { useState } from 'react';
import type { ActivityItem, FeedbackItem } from '../api/activity';
import CitationCard from './CitationCard';

interface Props {
  item: ActivityItem;
}

const TICKET_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  new: { label: 'New', className: 'bg-blue-100 text-blue-700' },
  awaiting_agent: { label: 'Awaiting agent', className: 'bg-yellow-100 text-yellow-700' },
  drafted: { label: 'Drafted', className: 'bg-purple-100 text-purple-700' },
  auto_resolved: { label: 'Auto-resolved', className: 'bg-green-100 text-green-700' },
  escalated: { label: 'Escalated', className: 'bg-red-100 text-red-700' },
  closed: { label: 'Closed', className: 'bg-gray-100 text-gray-500' },
};

function confidencePill(score: number) {
  const pct = `${(score * 100).toFixed(0)}%`;
  if (score > 0.85) return { label: pct, className: 'bg-green-100 text-green-700' };
  if (score >= 0.5) return { label: pct, className: 'bg-yellow-100 text-yellow-700' };
  return { label: pct, className: 'bg-red-100 text-red-700' };
}

function feedbackEmoji(fb: FeedbackItem[]): string {
  if (!fb.length) return '';
  const thumbs = fb.find(f => f.type === 'thumbs');
  if (thumbs) {
    const p = thumbs.payload as { value?: boolean | number };
    return p.value === true || p.value === 1 ? '👍' : '👎';
  }
  if (fb.some(f => f.type === 'edit')) return '✏️';
  if (fb.some(f => f.type === 'rating')) return '⭐';
  return '';
}

export default function ActivityCard({ item }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { draft } = item;
  const conf = confidencePill(draft.confidence);
  const statusCfg = TICKET_STATUS_CONFIG[item.status] ?? {
    label: item.status,
    className: 'bg-gray-100 text-gray-500',
  };
  const emoji = feedbackEmoji(item.feedback);
  const excerpt = draft.text.length > 180 ? draft.text.slice(0, 180).trimEnd() + '…' : draft.text;

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      {/* Clickable header */}
      <div
        role="button"
        tabIndex={0}
        className="cursor-pointer px-4 py-4 hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(v => !v)}
        onKeyDown={e => e.key === 'Enter' && setExpanded(v => !v)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {/* Badges row */}
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusCfg.className}`}>
                {statusCfg.label}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  draft.route === 'auto' ? 'bg-green-100 text-green-700' : 'bg-indigo-100 text-indigo-700'
                }`}
              >
                {draft.route === 'auto' ? 'Auto-resolved' : 'Drafted'}
              </span>
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${conf.className}`}>
                {conf.label}
              </span>
              {emoji && <span className="text-base leading-none">{emoji}</span>}
            </div>
            <p className="truncate text-sm font-medium text-gray-900">{item.subject}</p>
            <p className="mt-0.5 truncate text-xs text-gray-500">
              {item.customer?.name ?? item.customer?.email ?? 'Anonymous'} · {item.channel}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="whitespace-nowrap text-xs text-gray-400">
              {new Date(item.createdAt).toLocaleDateString()}
            </span>
            <svg
              className={`h-4 w-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Draft excerpt */}
        <p className="mt-2 text-sm leading-relaxed text-gray-600">{excerpt}</p>

        {/* Citation chips — stop propagation so clicks open modal, not toggle card */}
        {draft.citations.length > 0 && (
          <div
            className="mt-2 flex flex-wrap gap-1.5"
            onClick={e => e.stopPropagation()}
            onKeyDown={e => e.stopPropagation()}
          >
            {draft.citations.map((c, i) => (
              <CitationCard key={`${c.documentId}-${i}`} citation={c} />
            ))}
          </div>
        )}
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="space-y-4 border-t border-gray-100 bg-gray-50 px-4 py-4">
          {/* Full draft */}
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Full draft</p>
            <div className="rounded-md border border-gray-200 bg-white p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{draft.text}</p>
            </div>
          </div>

          {/* Agent edits diff */}
          {draft.agentEdits && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Agent edits</p>
              <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{draft.agentEdits}</p>
              </div>
            </div>
          )}

          {/* Citations detail */}
          {draft.citations.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                Citations ({draft.citations.length})
              </p>
              <div className="space-y-2">
                {draft.citations.map((c, i) => {
                  const cp = confidencePill(c.score);
                  return (
                    <div key={`${c.documentId}-${i}`} className="rounded-md border border-gray-200 bg-white p-3">
                      <div className="mb-1.5 flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cp.className}`}>
                          {cp.label}
                        </span>
                        <span className="max-w-[200px] truncate font-mono text-xs text-gray-400">
                          {c.documentId}
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed text-gray-700">{c.snippet}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Feedback */}
          {item.feedback.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                Feedback ({item.feedback.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {item.feedback.map((fb, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600"
                  >
                    {fb.type === 'thumbs' && ((fb.payload as { value?: boolean }).value ? '👍' : '👎')}
                    {fb.type === 'edit' && '✏️'}
                    {fb.type === 'rating' && '⭐'}
                    <span className="capitalize">{fb.type}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
