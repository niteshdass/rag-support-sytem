import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  listDocuments,
  deleteDocument,
  bulkDeleteDocuments,
  updateVisibility,
  type Document,
  type Visibility,
  type SourceType,
  type Status,
} from '../api/documents';
import DocumentRow from '../components/DocumentRow';
import DeleteConfirmDialog from '../components/DeleteConfirmDialog';

const PAGE_SIZE = 20;
const VISIBILITIES: Visibility[] = ['customer-facing', 'internal', 'draft'];
const SOURCE_TYPES: SourceType[] = ['connector', 'upload', 'paste', 'crawl'];
const STATUSES: Status[] = ['processing', 'ready', 'failed', 'purged'];

const VISIBILITY_LABELS: Record<Visibility, string> = {
  'customer-facing': 'Customer-facing',
  internal: 'Internal',
  draft: 'Draft',
};

const VISIBILITY_HINTS: Record<Visibility, string> = {
  'customer-facing': 'Shown to end users via chat and email',
  internal: 'Visible to agents and internal tools only',
  draft: 'Not active — requires promotion before use',
};

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

type DeleteTarget = { id: string; title: string } | null;
type VisibilityTarget = { doc: Document } | null;

export default function Documents() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [inputQ, setInputQ] = useState('');
  const [visibility, setVisibility] = useState<Visibility | ''>('');
  const [sourceType, setSourceType] = useState<SourceType | ''>('');
  const [status, setStatus] = useState<Status | ''>('');
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [visibilityTarget, setVisibilityTarget] = useState<VisibilityTarget>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);

  const q = useDebounce(inputQ, 300);

  useEffect(() => { setPage(1); }, [q, visibility, sourceType, status]);
  useEffect(() => { setSelected(new Set()); }, [page, q, visibility, sourceType, status]);

  const queryKey = ['documents', { q, visibility, sourceType, status, page }] as const;

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () =>
      listDocuments({
        q: q || undefined,
        visibility: visibility || undefined,
        sourceType: sourceType || undefined,
        status: status || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    staleTime: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDocument(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      setDeleteTarget(null);
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => bulkDeleteDocuments(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      setSelected(new Set());
      setShowBulkConfirm(false);
    },
  });

  const visibilityMutation = useMutation({
    mutationFn: ({ id, vis }: { id: string; vis: Visibility }) => updateVisibility(id, vis),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      setVisibilityTarget(null);
    },
  });

  const docs = data?.results ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const allPageSelected = docs.length > 0 && docs.every(d => selected.has(d._id));
  const somePageSelected = docs.some(d => selected.has(d._id));

  function toggleAll() {
    if (allPageSelected) {
      setSelected(prev => {
        const next = new Set(prev);
        docs.forEach(d => next.delete(d._id));
        return next;
      });
    } else {
      setSelected(prev => {
        const next = new Set(prev);
        docs.forEach(d => next.add(d._id));
        return next;
      });
    }
  }

  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Documents</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          {isLoading ? 'Loading…' : `${total} document${total !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-48 flex-1">
          <input
            type="text"
            placeholder="Search documents…"
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

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400">Visibility</span>
          {(['', ...VISIBILITIES] as const).map(v => (
            <button
              key={v}
              onClick={() => setVisibility(v)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                visibility === v
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {v === '' ? 'All' : VISIBILITY_LABELS[v]}
            </button>
          ))}
        </div>

        <select
          value={sourceType}
          onChange={e => setSourceType(e.target.value as SourceType | '')}
          className="rounded-md border border-gray-300 py-2 pl-3 pr-8 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">All sources</option>
          {SOURCE_TYPES.map(s => (
            <option key={s} value={s} className="capitalize">
              {s}
            </option>
          ))}
        </select>

        <select
          value={status}
          onChange={e => setStatus(e.target.value as Status | '')}
          className="rounded-md border border-gray-300 py-2 pl-3 pr-8 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">All statuses</option>
          {STATUSES.map(s => (
            <option key={s} value={s} className="capitalize">
              {s}
            </option>
          ))}
        </select>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-2.5">
          <span className="text-sm font-medium text-red-700">
            {selected.size} document{selected.size !== 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelected(new Set())}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Clear selection
            </button>
            <button
              onClick={() => setShowBulkConfirm(true)}
              className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
            >
              Delete {selected.size} document{selected.size !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        {isLoading && (
          <div className="flex h-48 items-center justify-center">
            <span className="text-sm text-gray-500">Loading…</span>
          </div>
        )}
        {isError && (
          <div className="flex h-48 items-center justify-center">
            <span className="text-sm text-red-500">Failed to load documents.</span>
          </div>
        )}
        {!isLoading && !isError && docs.length === 0 && (
          <div className="flex h-48 items-center justify-center">
            <span className="text-sm text-gray-500">No documents found.</span>
          </div>
        )}
        {!isLoading && !isError && docs.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    ref={el => { if (el) el.indeterminate = somePageSelected && !allPageSelected; }}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-gray-300 accent-indigo-600 cursor-pointer"
                  />
                </th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Visibility</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Added</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {docs.map(doc => (
                <DocumentRow
                  key={doc._id}
                  doc={doc}
                  selected={selected.has(doc._id)}
                  onToggleSelect={() => toggleOne(doc._id)}
                  onView={() => navigate(`/documents/${doc._id}`)}
                  onChangeVisibility={() => setVisibilityTarget({ doc })}
                  onDelete={() => setDeleteTarget({ id: doc._id, title: doc.title })}
                />
              ))}
            </tbody>
          </table>
        )}
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

      {/* Single delete confirm */}
      {deleteTarget && (
        <DeleteConfirmDialog
          title={deleteTarget.title}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
          isPending={deleteMutation.isPending}
        />
      )}

      {/* Bulk delete confirm */}
      {showBulkConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40" onClick={() => setShowBulkConfirm(false)} />
          <div className="relative z-10 w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-base font-semibold text-gray-900">Delete {selected.size} documents?</h2>
            <p className="mt-2 text-sm text-gray-500">
              This will permanently remove {selected.size} document{selected.size !== 1 ? 's' : ''} including all chunks, vectors, and cached responses. This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setShowBulkConfirm(false)}
                disabled={bulkDeleteMutation.isPending}
                className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => bulkDeleteMutation.mutate([...selected])}
                disabled={bulkDeleteMutation.isPending}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {bulkDeleteMutation.isPending ? 'Deleting…' : `Delete ${selected.size}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visibility change */}
      {visibilityTarget && (
        <VisibilityDialog
          doc={visibilityTarget.doc}
          onConfirm={vis => visibilityMutation.mutate({ id: visibilityTarget.doc._id, vis })}
          onCancel={() => setVisibilityTarget(null)}
          isPending={visibilityMutation.isPending}
        />
      )}
    </div>
  );
}

function VisibilityDialog({
  doc,
  onConfirm,
  onCancel,
  isPending,
}: {
  doc: Document;
  onConfirm: (vis: Visibility) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [selected, setSelected] = useState<Visibility>(doc.visibility);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-base font-semibold text-gray-900">Change visibility</h2>
        <p className="mt-1 max-w-xs truncate text-sm text-gray-500">{doc.title}</p>
        <div className="mt-4 space-y-1">
          {VISIBILITIES.map(v => (
            <label
              key={v}
              className="flex cursor-pointer items-start gap-3 rounded-md p-2.5 hover:bg-gray-50"
            >
              <input
                type="radio"
                name="visibility"
                value={v}
                checked={selected === v}
                onChange={() => setSelected(v)}
                className="mt-0.5 accent-indigo-600"
              />
              <div>
                <span className="text-sm font-medium text-gray-900">{VISIBILITY_LABELS[v]}</span>
                <p className="text-xs text-gray-500">{VISIBILITY_HINTS[v]}</p>
              </div>
            </label>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isPending}
            className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(selected)}
            disabled={isPending || selected === doc.visibility}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
