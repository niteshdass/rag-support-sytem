import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDocument } from '../api/documents';
import type { Citation } from '../api/activity';
import VisibilityBadge from './VisibilityBadge';

interface Props {
  citation: Citation;
}

function scoreColor(score: number) {
  if (score > 0.85) return 'bg-green-100 text-green-700';
  if (score >= 0.5) return 'bg-yellow-100 text-yellow-700';
  return 'bg-red-100 text-red-700';
}

export default function CitationCard({ citation }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex max-w-xs items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-700 hover:border-indigo-300 hover:text-indigo-700 transition-colors"
        title={citation.snippet}
      >
        <span className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-xs font-medium ${scoreColor(citation.score)}`}>
          {(citation.score * 100).toFixed(0)}%
        </span>
        <span className="truncate max-w-[140px]">{citation.snippet}</span>
      </button>

      {open && (
        <DocModal
          documentId={citation.documentId}
          snippet={citation.snippet}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function DocModal({
  documentId,
  snippet,
  onClose,
}: {
  documentId: string;
  snippet: string;
  onClose: () => void;
}) {
  const { data: doc, isLoading, isError } = useQuery({
    queryKey: ['document', documentId],
    queryFn: () => getDocument(documentId),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 flex w-full max-w-lg flex-col rounded-lg bg-white shadow-xl max-h-[80vh]">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0 flex-1">
            {isLoading && <div className="h-5 w-48 animate-pulse rounded bg-gray-100" />}
            {isError && <p className="text-sm text-red-500">Failed to load document.</p>}
            {doc && (
              <>
                <h2 className="break-words text-sm font-semibold text-gray-900">{doc.title}</h2>
                <div className="mt-1 flex items-center gap-2">
                  <VisibilityBadge visibility={doc.visibility} />
                  {doc.url && (
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noreferrer"
                      className="max-w-xs truncate text-xs text-indigo-500 hover:underline"
                    >
                      {doc.url}
                    </a>
                  )}
                </div>
              </>
            )}
          </div>
          <button onClick={onClose} className="shrink-0 text-gray-400 hover:text-gray-600">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Snippet */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Matched excerpt</p>
          <p className="rounded-md border border-yellow-100 bg-yellow-50 p-3 text-sm leading-relaxed text-gray-800">
            {snippet}
          </p>
        </div>

        {/* Footer */}
        {doc && (
          <div className="border-t border-gray-100 px-5 py-3">
            <a
              href={`/documents/${documentId}`}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
            >
              View full document →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
