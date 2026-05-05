import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { pasteDocument, type Visibility } from '../api/documents';

const VISIBILITY_OPTIONS: { value: Visibility; label: string }[] = [
  { value: 'customer-facing', label: 'Customer-facing' },
  { value: 'internal', label: 'Internal' },
  { value: 'draft', label: 'Draft' },
];

const MIN_CONTENT = 10;

export default function Paste() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('customer-facing');
  const [tagsInput, setTagsInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const contentTooShort = content.trim().length < MIN_CONTENT;
  const disabled = submitting || contentTooShort;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled) return;

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    setSubmitting(true);
    setToast(null);
    try {
      const { documentId } = await pasteDocument({
        ...(title.trim() && { title: title.trim() }),
        content: content.trim(),
        visibility,
        ...(tags.length && { tags }),
      });
      setToast({ ok: true, msg: 'Snippet added — processing…' });
      setTimeout(() => navigate(`/documents/${documentId}`), 800);
    } catch (err) {
      setToast({ ok: false, msg: err instanceof Error ? err.message : 'Failed to add snippet' });
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Paste text</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Quickly add a snippet — refund policy, FAQ answer, internal note.
        </p>
      </div>

      {toast && (
        <div
          className={[
            'rounded-md px-4 py-3 text-sm',
            toast.ok
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-destructive/10 text-destructive border border-destructive/20',
          ].join(' ')}
        >
          {toast.msg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="title-input">
            Title <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <input
            id="title-input"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. 30-day refund policy"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="content-textarea">
            Content
          </label>
          <textarea
            id="content-textarea"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={10}
            placeholder="Paste your text here…"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
          />
          {content.length > 0 && contentTooShort && (
            <p className="text-xs text-destructive">
              At least {MIN_CONTENT} characters required ({content.trim().length} so far).
            </p>
          )}
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
              Tags <span className="font-normal text-muted-foreground">(comma-separated)</span>
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

        <div className="relative">
          <button
            type="submit"
            disabled={disabled}
            title={contentTooShort ? `At least ${MIN_CONTENT} characters required` : undefined}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? 'Adding…' : 'Add to knowledge'}
          </button>
        </div>
      </form>
    </div>
  );
}
