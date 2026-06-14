import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  escalateSession,
  getThread,
  listSessions,
  sendReply,
  type InboxSession,
  type InboxThread,
} from '../api/inbox';
import { cn } from '../lib/utils';

const STATUS_CONFIG: Record<string, { label: string; dot: string }> = {
  new:            { label: 'New',            dot: 'bg-blue-500' },
  awaiting_agent: { label: 'Waiting',        dot: 'bg-yellow-500' },
  drafted:        { label: 'Draft ready',    dot: 'bg-purple-500' },
  auto_resolved:  { label: 'Auto-resolved',  dot: 'bg-green-500' },
  escalated:      { label: 'Escalated',      dot: 'bg-red-500' },
  closed:         { label: 'Closed',         dot: 'bg-gray-400' },
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function confidenceColor(score: number) {
  if (score >= 0.8) return 'text-green-700 bg-green-50 border-green-200';
  if (score >= 0.5) return 'text-yellow-700 bg-yellow-50 border-yellow-200';
  return 'text-red-700 bg-red-50 border-red-200';
}

// ── Session list item ─────────────────────────────────────────────────────────

function SessionItem({
  session,
  selected,
  onClick,
}: {
  session: InboxSession;
  selected: boolean;
  onClick: () => void;
}) {
  const cfg = STATUS_CONFIG[session.status] ?? { label: session.status, dot: 'bg-gray-400' };
  const preview = session.lastMessage?.content.slice(0, 80) ?? '—';

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-4 py-3 border-b transition-colors',
        selected ? 'bg-indigo-50 border-l-2 border-l-indigo-500' : 'hover:bg-gray-50 border-l-2 border-l-transparent',
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <span className="truncate text-sm font-medium text-gray-900">{session.subject}</span>
        <span className="shrink-0 text-xs text-gray-400">{timeAgo(session.updatedAt)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className={cn('inline-block h-2 w-2 rounded-full shrink-0', cfg.dot)} />
        <span className="text-xs text-gray-500">{cfg.label}</span>
        <span className="text-xs text-gray-400">· {session.customer?.name ?? session.customer?.email ?? 'Anonymous'}</span>
      </div>
      <p className="mt-1 truncate text-xs text-gray-400">{preview}</p>
    </button>
  );
}

// ── Thread view ───────────────────────────────────────────────────────────────

function ThreadView({
  thread,
  onReplied,
}: {
  thread: InboxThread;
  onReplied: () => void;
}) {
  const qc = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [replyText, setReplyText] = useState(thread.latestDraft?.text ?? '');
  const [showCitations, setShowCitations] = useState(false);

  useEffect(() => {
    setReplyText(thread.latestDraft?.text ?? '');
    setShowCitations(false);
  }, [thread.conversationId, thread.latestDraft?.text]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread.messages.length]);

  const replyMutation = useMutation({
    mutationFn: () =>
      sendReply(thread.conversationId, replyText.trim(), thread.latestDraft?.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inbox-sessions'] });
      qc.invalidateQueries({ queryKey: ['inbox-thread', thread.conversationId] });
      onReplied();
    },
  });

  const escalateMutation = useMutation({
    mutationFn: () => escalateSession(thread.conversationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inbox-sessions'] });
      qc.invalidateQueries({ queryKey: ['inbox-thread', thread.conversationId] });
    },
  });

  const isClosed = thread.status === 'closed' || thread.status === 'escalated';
  const draft = thread.latestDraft;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-3 border-b bg-white shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-900 truncate">{thread.subject}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {thread.customer?.name ?? thread.customer?.email ?? 'Anonymous'}
              {' · '}
              <span className={cn(
                'inline-flex items-center gap-1',
                STATUS_CONFIG[thread.status]?.dot ? '' : '',
              )}>
                <span className={cn('inline-block h-1.5 w-1.5 rounded-full', STATUS_CONFIG[thread.status]?.dot ?? 'bg-gray-400')} />
                {STATUS_CONFIG[thread.status]?.label ?? thread.status}
              </span>
            </p>
          </div>
          {!isClosed && (
            <button
              onClick={() => escalateMutation.mutate()}
              disabled={escalateMutation.isPending}
              className="shrink-0 rounded border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              Escalate
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-gray-50">
        {thread.messages.map((msg, i) => {
          const isUser = msg.role === 'user';
          const isAgent = msg.role === 'agent';
          return (
            <div key={i} className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[75%] rounded-xl px-4 py-2.5 text-sm',
                  isUser
                    ? 'bg-indigo-600 text-white'
                    : isAgent
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white border border-gray-200 text-gray-800 shadow-sm',
                )}
              >
                {!isUser && (
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide opacity-60">
                    {isAgent ? 'Agent' : 'SupportPilot AI'}
                  </p>
                )}
                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                <p className={cn(
                  'mt-1 text-[10px] opacity-50',
                  isUser ? 'text-right' : 'text-left',
                )}>
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Draft + reply panel */}
      {!isClosed ? (
        <div className="shrink-0 border-t bg-white px-5 py-4 space-y-3">
          {draft && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-500">AI Draft</span>
                <span className={cn('rounded border px-1.5 py-0.5 text-[10px] font-medium', confidenceColor(draft.confidence))}>
                  {Math.round(draft.confidence * 100)}% confidence
                </span>
                <span className={cn(
                  'rounded border px-1.5 py-0.5 text-[10px] font-medium',
                  draft.route === 'auto' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-indigo-50 border-indigo-200 text-indigo-700',
                )}>
                  {draft.route === 'auto' ? 'auto-resolve' : 'draft'}
                </span>
              </div>
              {draft.citations.length > 0 && (
                <button
                  onClick={() => setShowCitations(v => !v)}
                  className="text-xs text-indigo-600 hover:underline"
                >
                  {showCitations ? 'Hide' : 'Show'} {draft.citations.length} source{draft.citations.length !== 1 ? 's' : ''}
                </button>
              )}
            </div>
          )}

          {showCitations && draft && draft.citations.length > 0 && (
            <div className="space-y-1.5 max-h-40 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 p-3">
              {draft.citations.map((c, i) => (
                <div key={i} className="text-xs text-gray-600">
                  <span className={cn('mr-2 rounded px-1 py-0.5 text-[10px] font-medium', confidenceColor(c.score))}>
                    {Math.round(c.score * 100)}%
                  </span>
                  <span className="italic">"{c.snippet.slice(0, 120)}{c.snippet.length > 120 ? '…' : ''}"</span>
                </div>
              ))}
            </div>
          )}

          <textarea
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            placeholder="Edit the AI draft or write your own reply…"
            rows={4}
            className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />

          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">
              {draft ? 'AI draft loaded — review and send' : 'No draft yet — write your reply'}
            </p>
            <button
              onClick={() => replyMutation.mutate()}
              disabled={!replyText.trim() || replyMutation.isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {replyMutation.isPending ? 'Sending…' : 'Send Reply'}
            </button>
          </div>
        </div>
      ) : (
        <div className="shrink-0 border-t bg-gray-50 px-5 py-3 text-center text-sm text-gray-400">
          {thread.status === 'escalated' ? 'Escalated to human agent' : 'Conversation closed'}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Inbox() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['inbox-sessions'],
    queryFn: listSessions,
    refetchInterval: 5000,
  });

  const sessions = data?.sessions ?? [];

  const { data: thread, isLoading: threadLoading } = useQuery({
    queryKey: ['inbox-thread', selectedId],
    queryFn: () => getThread(selectedId!),
    enabled: !!selectedId,
    refetchInterval: 5000,
  });

  // Auto-select first session
  useEffect(() => {
    if (!selectedId && sessions.length > 0) {
      setSelectedId(sessions[0]!.conversationId);
    }
  }, [sessions, selectedId]);

  return (
    <div className="flex h-full -m-6 overflow-hidden">
      {/* Left: session list */}
      <aside className="w-72 shrink-0 border-r flex flex-col bg-white">
        <div className="px-4 py-3 border-b">
          <h1 className="text-sm font-semibold text-gray-900">Inbox</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {isLoading ? 'Loading…' : `${sessions.length} open conversation${sessions.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {!isLoading && sessions.length === 0 && (
            <div className="flex h-48 items-center justify-center">
              <p className="text-sm text-gray-400">No open conversations</p>
            </div>
          )}
          {sessions.map(s => (
            <SessionItem
              key={s.conversationId}
              session={s}
              selected={selectedId === s.conversationId}
              onClick={() => setSelectedId(s.conversationId)}
            />
          ))}
        </div>
      </aside>

      {/* Right: thread */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedId && (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            Select a conversation
          </div>
        )}
        {selectedId && threadLoading && (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            Loading…
          </div>
        )}
        {selectedId && thread && (
          <ThreadView
            key={selectedId}
            thread={thread}
            onReplied={() => {
              qc.invalidateQueries({ queryKey: ['inbox-sessions'] });
            }}
          />
        )}
      </div>
    </div>
  );
}
