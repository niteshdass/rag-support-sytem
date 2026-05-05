import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import {
  getDocument,
  getDocumentChunks,
  deleteDocument,
  updateVisibility,
  type Visibility,
} from '../api/documents';
import VisibilityBadge from '../components/VisibilityBadge';
import StatusBadge from '../components/StatusBadge';
import DeleteConfirmDialog from '../components/DeleteConfirmDialog';

const VISIBILITIES: Visibility[] = ['customer-facing', 'internal', 'draft'];

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

type Tab = 'content' | 'chunks';

export default function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>('content');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showVisibilityDialog, setShowVisibilityDialog] = useState(false);

  const { data: doc, isLoading, isError } = useQuery({
    queryKey: ['document', id],
    queryFn: () => getDocument(id!),
    enabled: !!id,
  });

  const { data: chunksData, isLoading: chunksLoading } = useQuery({
    queryKey: ['document-chunks', id],
    queryFn: () => getDocumentChunks(id!),
    enabled: !!id && tab === 'chunks',
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteDocument(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      navigate('/documents');
    },
  });

  const visibilityMutation = useMutation({
    mutationFn: (vis: Visibility) => updateVisibility(id!, vis),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document', id] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      setShowVisibilityDialog(false);
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <span className="text-sm text-gray-500">Loading…</span>
      </div>
    );
  }

  if (isError || !doc) {
    return (
      <div className="flex h-64 items-center justify-center">
        <span className="text-sm text-red-500">Document not found.</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <button
            onClick={() => navigate('/documents')}
            className="mb-2 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Documents
          </button>
          <h1 className="text-xl font-semibold text-gray-900 break-words">{doc.title}</h1>
          {doc.url && (
            <a
              href={doc.url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block truncate text-sm text-indigo-600 hover:underline"
            >
              {doc.url}
            </a>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => setShowVisibilityDialog(true)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Change visibility
          </button>
          <button
            onClick={() => setShowDeleteDialog(true)}
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Metadata row */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-gray-500">Visibility</span>
          <VisibilityBadge visibility={doc.visibility} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-500">Status</span>
          <StatusBadge status={doc.status} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-500">Source</span>
          <span className="capitalize text-gray-700">{doc.sourceType}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-500">Added</span>
          <span className="text-gray-700">{new Date(doc.createdAt).toLocaleDateString()}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-500">Updated</span>
          <span className="text-gray-700">{new Date(doc.updatedAt).toLocaleDateString()}</span>
        </div>
        {doc.tags.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Tags</span>
            <div className="flex flex-wrap gap-1">
              {doc.tags.map(tag => (
                <span
                  key={tag}
                  className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div>
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex gap-6">
            {(['content', 'chunks'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`pb-3 text-sm font-medium capitalize transition-colors ${
                  tab === t
                    ? 'border-b-2 border-indigo-600 text-indigo-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t}
              </button>
            ))}
          </nav>
        </div>

        {tab === 'content' && (
          <div className="mt-4 rounded-lg border border-gray-200 bg-white p-6">
            {doc.contentTruncated && (
              <div className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Content truncated to 5,000 characters for display.
              </div>
            )}
            {doc.content ? (
              <div className="prose prose-sm max-w-none text-gray-800">
                <ReactMarkdown>{doc.content}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No content available.</p>
            )}
          </div>
        )}

        {tab === 'chunks' && (
          <div className="mt-4 space-y-3">
            {chunksLoading && (
              <div className="flex h-40 items-center justify-center">
                <span className="text-sm text-gray-500">Loading chunks…</span>
              </div>
            )}
            {!chunksLoading && (!chunksData || chunksData.chunks.length === 0) && (
              <div className="flex h-40 items-center justify-center rounded-lg border border-gray-200 bg-white">
                <span className="text-sm text-gray-400">No chunks yet.</span>
              </div>
            )}
            {!chunksLoading && chunksData && chunksData.chunks.length > 0 && (
              <>
                <p className="text-xs text-gray-400">{chunksData.total} chunk{chunksData.total !== 1 ? 's' : ''}</p>
                {chunksData.chunks.map(chunk => (
                  <div
                    key={chunk._id}
                    className="rounded-lg border border-gray-200 bg-white p-4"
                  >
                    <div className="mb-2 flex items-center gap-3">
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-mono text-gray-500">
                        #{chunk.position}
                      </span>
                      <VisibilityBadge visibility={chunk.visibility} />
                      {chunk.qdrantPointId && (
                        <span className="font-mono text-xs text-gray-300 truncate max-w-48" title={chunk.qdrantPointId}>
                          {chunk.qdrantPointId}
                        </span>
                      )}
                    </div>
                    <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">{chunk.text}</p>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {showDeleteDialog && (
        <DeleteConfirmDialog
          title={doc.title}
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setShowDeleteDialog(false)}
          isPending={deleteMutation.isPending}
        />
      )}

      {showVisibilityDialog && (
        <VisibilityDialog
          current={doc.visibility}
          onConfirm={vis => visibilityMutation.mutate(vis)}
          onCancel={() => setShowVisibilityDialog(false)}
          isPending={visibilityMutation.isPending}
        />
      )}
    </div>
  );
}

function VisibilityDialog({
  current,
  onConfirm,
  onCancel,
  isPending,
}: {
  current: Visibility;
  onConfirm: (vis: Visibility) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [selected, setSelected] = useState<Visibility>(current);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-base font-semibold text-gray-900">Change visibility</h2>
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
            disabled={isPending || selected === current}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
