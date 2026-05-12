import { useCallback, useEffect, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { getDocument, uploadDocument, type Status, type Visibility } from '../api/documents';

const MAX_SIZE = 50 * 1024 * 1024;

const ACCEPTED_MIME: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'text/plain': ['.txt'],
  'text/markdown': ['.md'],
  'text/x-markdown': ['.md'],
  'text/html': ['.html', '.htm'],
  'application/xhtml+xml': ['.xhtml'],
  'text/csv': ['.csv'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel': ['.xls'],
};

const VISIBILITY_OPTIONS: { value: Visibility; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'customer-facing', label: 'Customer-facing' },
  { value: 'internal', label: 'Internal' },
];

type UploadStatus = 'pending' | 'uploading' | 'processing' | 'ready' | 'failed';

// Only serializable data in state — File objects live in fileMapRef
interface FileEntry {
  id: string;
  fileName: string;
  fileSize: number;
  status: UploadStatus;
  error?: string;
  documentId?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusPill({ status }: { status: UploadStatus }) {
  const styles: Record<UploadStatus, string> = {
    pending: 'bg-gray-100 text-gray-600',
    uploading: 'bg-blue-100 text-blue-700',
    processing: 'bg-yellow-100 text-yellow-700',
    ready: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {status === 'processing' && (
        <svg className="mr-1 h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      )}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export default function Upload() {
  const [visibility, setVisibility] = useState<Visibility>('customer-facing');
  const [tagsInput, setTagsInput] = useState('');
  const [entries, setEntries] = useState<FileEntry[]>([]);

  // File objects are NOT in state — they can't survive structured clone (HMR)
  const fileMapRef = useRef<Map<string, File>>(new Map());
  const pollingRefs = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  const updateEntry = useCallback((id: string, patch: Partial<FileEntry>) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);

  const startPolling = useCallback(
    (id: string, documentId: string) => {
      const interval = setInterval(async () => {
        try {
          const doc = await getDocument(documentId);
          const docStatus = doc.status as Status;
          if (docStatus !== 'processing') {
            clearInterval(interval);
            pollingRefs.current.delete(id);
            fileMapRef.current.delete(id);
            updateEntry(id, {
              status: docStatus === 'ready' ? 'ready' : 'failed',
              error: docStatus === 'failed' ? (doc.processingError ?? 'Processing failed') : undefined,
            });
          }
        } catch {
          clearInterval(interval);
          pollingRefs.current.delete(id);
          fileMapRef.current.delete(id);
          updateEntry(id, { status: 'failed', error: 'Status check failed' });
        }
      }, 2000);
      pollingRefs.current.set(id, interval);
    },
    [updateEntry],
  );

  useEffect(() => {
    return () => {
      for (const interval of pollingRefs.current.values()) {
        clearInterval(interval);
      }
    };
  }, []);

  const processFile = useCallback(
    async (id: string, file: File) => {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      try {
        const { documentId } = await uploadDocument(file, visibility, tags);
        updateEntry(id, { status: 'processing', documentId });
        startPolling(id, documentId);
      } catch (err) {
        fileMapRef.current.delete(id);
        updateEntry(id, {
          status: 'failed',
          error: err instanceof Error ? err.message : 'Upload failed',
        });
      }
    },
    [tagsInput, visibility, updateEntry, startPolling],
  );

  const onDrop = useCallback(
    (accepted: File[], rejected: import('react-dropzone').FileRejection[]) => {
      const newEntries: FileEntry[] = [];

      for (const file of accepted) {
        const id = crypto.randomUUID();
        fileMapRef.current.set(id, file);
        newEntries.push({ id, fileName: file.name, fileSize: file.size, status: 'pending' });
      }

      for (const { file, errors } of rejected) {
        const id = crypto.randomUUID();
        newEntries.push({
          id,
          fileName: file.name,
          fileSize: file.size,
          status: 'failed',
          error:
            errors[0]?.code === 'file-too-large'
              ? `File exceeds 50 MB limit (${formatBytes(file.size)})`
              : errors[0]?.message ?? 'Unsupported file type',
        });
      }

      setEntries((prev) => [...prev, ...newEntries]);
    },
    [],
  );

  const handleUpload = useCallback(() => {
    const pending = entries.filter((e) => e.status === 'pending');
    setEntries((prev) =>
      prev.map((e) => (e.status === 'pending' ? { ...e, status: 'uploading' } : e)),
    );
    for (const entry of pending) {
      const file = fileMapRef.current.get(entry.id);
      if (file) void processFile(entry.id, file);
    }
  }, [entries, processFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_MIME,
    maxSize: MAX_SIZE,
    multiple: true,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Upload documents</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          PDF, DOCX, TXT, MD, HTML, CSV, XLSX — max 50 MB each
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="visibility-select">
            Visibility
          </label>
          <select
            id="visibility-select"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as Visibility)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {VISIBILITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="tags-input">
            Tags <span className="text-muted-foreground font-normal">(comma-separated)</span>
          </label>
          <input
            id="tags-input"
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="e.g. billing, onboarding"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div
        {...getRootProps()}
        className={[
          'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-14 text-center transition-colors',
          isDragActive
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50 hover:bg-muted/30',
        ].join(' ')}
      >
        <input {...getInputProps()} />
        <svg
          className="mb-3 h-10 w-10 text-muted-foreground"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
          />
        </svg>
        <p className="text-sm font-medium">
          {isDragActive ? 'Drop files here' : 'Drop files here or click to browse'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          PDF, DOCX, TXT, MD, HTML, CSV, XLSX
        </p>
      </div>

      {entries.length > 0 && (
        <div className="rounded-lg border border-border">
          <div className="divide-y divide-border">
            {entries.map((entry) => (
              <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{entry.fileName}</p>
                  {entry.error ? (
                    <p className="mt-0.5 text-xs text-destructive">{entry.error}</p>
                  ) : (
                    <p className="mt-0.5 text-xs text-muted-foreground">{formatBytes(entry.fileSize)}</p>
                  )}
                </div>
                <StatusPill status={entry.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {entries.some((e) => e.status === 'pending') && (
        <div className="flex justify-end">
          <button
            onClick={handleUpload}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            Save {entries.filter((e) => e.status === 'pending').length} file{entries.filter((e) => e.status === 'pending').length !== 1 ? 's' : ''} to Documents
          </button>
        </div>
      )}
    </div>
  );
}
