import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  listActivity,
  type TicketStatus,
  type Route,
  type ActivityItem,
} from '../api/activity';
import ActivityCard from '../components/ActivityCard';

const PAGE_SIZE = 20;

const STATUSES: TicketStatus[] = [
  'new',
  'awaiting_agent',
  'drafted',
  'auto_resolved',
  'escalated',
  'closed',
];

const STATUS_LABELS: Record<TicketStatus, string> = {
  new: 'New',
  awaiting_agent: 'Awaiting agent',
  drafted: 'Drafted',
  auto_resolved: 'Auto-resolved',
  escalated: 'Escalated',
  closed: 'Closed',
};

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function Activity() {
  const [inputQ, setInputQ] = useState('');
  const [status, setStatus] = useState<TicketStatus | ''>('');
  const [route, setRoute] = useState<Route | ''>('');
  const [confidenceMin, setConfidenceMin] = useState(0);
  const [confidenceMax, setConfidenceMax] = useState(1);
  const [page, setPage] = useState(1);

  const q = useDebounce(inputQ, 300);

  useEffect(() => {
    setPage(1);
  }, [q, status, route, confidenceMin, confidenceMax]);

  const queryKey = ['activity', { q, status, route, confidenceMin, confidenceMax, page }] as const;

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () =>
      listActivity({
        q: q || undefined,
        status: status || undefined,
        route: route || undefined,
        confidenceMin: confidenceMin > 0 ? confidenceMin : undefined,
        confidenceMax: confidenceMax < 1 ? confidenceMax : undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    staleTime: 30_000,
  });

  const items: ActivityItem[] = data?.results ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Activity</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          {isLoading ? 'Loading…' : `${total} entr${total !== 1 ? 'ies' : 'y'}`}
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3">
        {/* Search */}
        <div className="relative min-w-48 flex-1">
          <input
            type="text"
            placeholder="Search tickets…"
            value={inputQ}
            onChange={e => setInputQ(e.target.value)}
            className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <svg
            className="absolute left-3 top-2.5 h-4 w-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        {/* Status */}
        <select
          value={status}
          onChange={e => setStatus(e.target.value as TicketStatus | '')}
          className="rounded-md border border-gray-300 py-2 pl-3 pr-8 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">All statuses</option>
          {STATUSES.map(s => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>

        {/* Route */}
        <select
          value={route}
          onChange={e => setRoute(e.target.value as Route | '')}
          className="rounded-md border border-gray-300 py-2 pl-3 pr-8 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">All routes</option>
          <option value="auto">Auto-resolved</option>
          <option value="draft">Drafted</option>
        </select>

        {/* Confidence range */}
        <div className="flex items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-gray-500">Min confidence</label>
            <div className="flex items-center gap-1.5">
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={confidenceMin}
                onChange={e => {
                  const v = Number(e.target.value);
                  setConfidenceMin(v);
                  if (v > confidenceMax) setConfidenceMax(v);
                }}
                className="w-24 accent-indigo-600"
              />
              <span className="w-8 text-xs text-gray-600">{(confidenceMin * 100).toFixed(0)}%</span>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Max</label>
            <div className="flex items-center gap-1.5">
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={confidenceMax}
                onChange={e => {
                  const v = Number(e.target.value);
                  setConfidenceMax(v);
                  if (v < confidenceMin) setConfidenceMin(v);
                }}
                className="w-24 accent-indigo-600"
              />
              <span className="w-8 text-xs text-gray-600">{(confidenceMax * 100).toFixed(0)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {isLoading && (
          <div className="flex h-48 items-center justify-center">
            <span className="text-sm text-gray-500">Loading…</span>
          </div>
        )}
        {isError && (
          <div className="flex h-48 items-center justify-center">
            <span className="text-sm text-red-500">Failed to load activity.</span>
          </div>
        )}
        {!isLoading && !isError && items.length === 0 && (
          <div className="flex h-48 items-center justify-center rounded-lg border border-gray-200 bg-white">
            <span className="text-sm text-gray-400">No activity found.</span>
          </div>
        )}
        {!isLoading &&
          !isError &&
          items.map(item => <ActivityCard key={item.ticketId} item={item} />)}
      </div>

      {/* Pagination */}
      {!isLoading && !isError && totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">
            Page {page} of {totalPages} · {total} results
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
