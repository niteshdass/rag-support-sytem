import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteSource, listSources, syncSource, type Source, type SourceStatus, type SourceType } from '../api/sources';

// ─── icons ───────────────────────────────────────────────────────────────────

function UploadIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  );
}

function PasteIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  );
}

function ConnectorIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
    </svg>
  );
}

function typeIcon(type: SourceType) {
  if (type === 'upload') return <UploadIcon />;
  if (type === 'paste') return <PasteIcon />;
  if (type === 'crawl') return <GlobeIcon />;
  return <ConnectorIcon />;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<SourceStatus, { label: string; className: string }> = {
  active:   { label: 'Active',   className: 'bg-green-100 text-green-800' },
  syncing:  { label: 'Syncing',  className: 'bg-blue-100 text-blue-800' },
  error:    { label: 'Error',    className: 'bg-red-100 text-red-800' },
  disabled: { label: 'Disabled', className: 'bg-gray-100 text-gray-500' },
};

function SourceStatusBadge({ status }: { status: SourceStatus }) {
  const { label, className } = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

function subtypeLabel(type: SourceType, subtype: string): string {
  const map: Record<string, string> = {
    manual:      'Manual upload',
    text:        'Pasted text',
    zendesk:     'Zendesk',
    notion:      'Notion',
    intercom:    'Intercom',
    confluence:  'Confluence',
    github:      'GitHub',
    googleDrive: 'Google Drive',
    slack:       'Slack',
    url:         'Web crawl',
  };
  return map[subtype] ?? `${type} / ${subtype}`;
}

function typeIconBg(type: SourceType): string {
  if (type === 'upload') return 'bg-indigo-100 text-indigo-600';
  if (type === 'paste')  return 'bg-purple-100 text-purple-600';
  if (type === 'crawl')  return 'bg-teal-100 text-teal-600';
  return 'bg-orange-100 text-orange-600';
}

function fmtDate(iso?: string): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── add-source modal ─────────────────────────────────────────────────────────

type SourceOption = {
  type: SourceType;
  subtype: string;
  label: string;
  description: string;
  enabled: boolean;
};

const SOURCE_OPTIONS: SourceOption[] = [
  { type: 'upload',    subtype: 'manual',      label: 'Manual upload',  description: 'PDF, DOCX, TXT, MD, HTML, CSV',              enabled: true },
  { type: 'paste',     subtype: 'text',        label: 'Pasted text',    description: 'Paste any text snippet directly',            enabled: true },
  { type: 'crawl',     subtype: 'url',         label: 'Web crawl',      description: 'Crawl a public help-center URL',             enabled: false },
  { type: 'connector', subtype: 'zendesk',     label: 'Zendesk',        description: 'Help center articles, tickets & macros',     enabled: false },
  { type: 'connector', subtype: 'notion',      label: 'Notion',         description: 'Pages and databases',                        enabled: false },
  { type: 'connector', subtype: 'intercom',    label: 'Intercom',       description: 'Articles and conversations',                 enabled: false },
  { type: 'connector', subtype: 'confluence',  label: 'Confluence',     description: 'Pages and spaces',                          enabled: false },
  { type: 'connector', subtype: 'github',      label: 'GitHub',         description: 'Issues, wikis and READMEs',                  enabled: false },
  { type: 'connector', subtype: 'googleDrive', label: 'Google Drive',   description: 'Folders and shared drives',                  enabled: false },
  { type: 'connector', subtype: 'slack',       label: 'Slack',          description: 'Selected channels',                          enabled: false },
];

function AddSourceModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();

  function handleSelect(opt: SourceOption) {
    if (!opt.enabled) return;
    onClose();
    if (opt.type === 'upload') navigate('/upload');
    else if (opt.type === 'paste') navigate('/paste');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Add knowledge source</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {SOURCE_OPTIONS.map(opt => (
            <div key={`${opt.type}-${opt.subtype}`} className="relative group">
              <button
                onClick={() => handleSelect(opt)}
                disabled={!opt.enabled}
                className={`w-full rounded-lg border p-3 text-left transition-colors ${
                  opt.enabled
                    ? 'border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 cursor-pointer'
                    : 'border-gray-100 bg-gray-50 cursor-not-allowed opacity-60'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-md ${typeIconBg(opt.type)}`}>
                    {typeIcon(opt.type)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{opt.label}</p>
                    <p className="text-xs text-gray-500 truncate">{opt.description}</p>
                  </div>
                </div>
                {!opt.enabled && (
                  <span className="mt-1.5 inline-block rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-500">
                    Coming soon
                  </span>
                )}
              </button>
              {!opt.enabled && (
                <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 hidden -translate-x-1/2 rounded-md bg-gray-800 px-2.5 py-1 text-xs text-white whitespace-nowrap group-hover:block shadow-lg">
                  Connector coming soon
                  <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── delete dialog ────────────────────────────────────────────────────────────

function DeleteSourceDialog({
  source,
  onConfirm,
  onCancel,
  isPending,
}: {
  source: Source;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-base font-semibold text-gray-900">Delete source?</h2>
        <p className="mt-2 text-sm text-gray-600">
          <span className="font-medium">{subtypeLabel(source.type, source.subtype)}</span> will be
          permanently disabled and all related documents will be purged from vectors, search index,
          and cache. This cannot be undone.
        </p>
        <div className="mt-4 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          All documents from this source will be cascade-purged.
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
            onClick={onConfirm}
            disabled={isPending}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {isPending ? 'Deleting…' : 'Delete & purge'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── source card ──────────────────────────────────────────────────────────────

function SourceCard({
  source,
  onSync,
  onDelete,
  isSyncing,
}: {
  source: Source;
  onSync: () => void;
  onDelete: () => void;
  isSyncing: boolean;
}) {
  return (
    <div className="flex items-start justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${typeIconBg(source.type)}`}>
          {typeIcon(source.type)}
        </span>
        <div>
          <p className="text-sm font-semibold text-gray-900">{subtypeLabel(source.type, source.subtype)}</p>
          <p className="text-xs text-gray-500">
            Last synced: {fmtDate(source.lastSyncedAt)}
          </p>
          <div className="mt-1.5">
            <SourceStatusBadge status={source.status} />
          </div>
        </div>
      </div>
      <div className="ml-4 flex flex-shrink-0 items-center gap-2">
        <button
          onClick={onSync}
          disabled={isSyncing || source.status === 'syncing' || source.status === 'disabled'}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          {isSyncing || source.status === 'syncing' ? 'Syncing…' : 'Sync'}
        </button>
        <button
          onClick={onDelete}
          disabled={source.status === 'disabled'}
          className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function Sources() {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Source | null>(null);
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());

  const { data, isLoading, isError } = useQuery({
    queryKey: ['sources'],
    queryFn: () => listSources(),
    staleTime: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSource(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      setDeleteTarget(null);
    },
  });

  async function handleSync(source: Source) {
    setSyncingIds(prev => new Set(prev).add(source._id));
    try {
      await syncSource(source._id);
      queryClient.invalidateQueries({ queryKey: ['sources'] });
    } finally {
      setSyncingIds(prev => {
        const next = new Set(prev);
        next.delete(source._id);
        return next;
      });
    }
  }

  const sources = data?.results ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Sources</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {isLoading ? 'Loading…' : `${total} source${total !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add source
        </button>
      </div>

      {isLoading && (
        <div className="flex h-48 items-center justify-center rounded-lg border border-gray-200 bg-white">
          <span className="text-sm text-gray-500">Loading…</span>
        </div>
      )}

      {isError && (
        <div className="flex h-48 items-center justify-center rounded-lg border border-gray-200 bg-white">
          <span className="text-sm text-red-500">Failed to load sources.</span>
        </div>
      )}

      {!isLoading && !isError && sources.length === 0 && (
        <div className="flex h-48 flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white">
          <ConnectorIcon />
          <p className="mt-2 text-sm text-gray-500">No sources yet.</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="mt-3 text-sm font-medium text-indigo-600 hover:underline"
          >
            Add your first source
          </button>
        </div>
      )}

      {!isLoading && !isError && sources.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {sources.map(src => (
            <SourceCard
              key={src._id}
              source={src}
              onSync={() => handleSync(src)}
              onDelete={() => setDeleteTarget(src)}
              isSyncing={syncingIds.has(src._id)}
            />
          ))}
        </div>
      )}

      {showAddModal && <AddSourceModal onClose={() => setShowAddModal(false)} />}

      {deleteTarget && (
        <DeleteSourceDialog
          source={deleteTarget}
          onConfirm={() => deleteMutation.mutate(deleteTarget._id)}
          onCancel={() => setDeleteTarget(null)}
          isPending={deleteMutation.isPending}
        />
      )}
    </div>
  );
}
