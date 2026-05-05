import { useEffect, useRef, useState } from 'react';
import { fetchDraft, submitFeedback } from './api.js';
import type { DraftResponse } from './api.js';

interface Config {
  apiUrl: string;
  apiKey: string;
}

export default function App() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [draft, setDraft] = useState<DraftResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [inserted, setInserted] = useState(false);
  const [thumb, setThumb] = useState<'up' | 'down' | null>(null);
  const [citationsOpen, setCitationsOpen] = useState(false);
  const configRef = useRef<Config>({ apiUrl: '', apiKey: '' });
  const clientRef = useRef<ZAFClientInstance | null>(null);

  useEffect(() => {
    let alive = true;

    async function init() {
      const client = ZAFClient.init();
      clientRef.current = client;

      const meta = await client.metadata();
      const apiUrl = (meta.settings.api_url ?? 'http://localhost:3000').replace(/\/$/, '');
      const apiKey = meta.settings.api_key ?? '';
      configRef.current = { apiUrl, apiKey };

      const data = await client.get(['ticket.id', 'ticket.subject', 'ticket.description']);
      const ticketId = String(data['ticket.id'] ?? '');
      const subject = String(data['ticket.subject'] ?? '');
      const body = String(data['ticket.description'] ?? '');
      const query = [subject, body].filter(Boolean).join('\n\n');

      const result = await fetchDraft({ apiUrl, apiKey, query, ticketId: ticketId || undefined });
      if (!alive) return;

      setDraft(result);
      setStatus('ready');

      client.on('ticket.submit.start', async () => {
        if (!result.draftId) return;
        try {
          const commentData = await client.get('ticket.comment.text');
          const sentText = String(commentData['ticket.comment.text'] ?? '');
          if (!sentText || sentText === result.text) return;
          await submitFeedback({
            apiUrl,
            apiKey,
            draftId: result.draftId,
            type: 'edit',
            payload: { originalText: result.text, sentText },
          });
        } catch {
          // non-fatal
        }
      });
    }

    init().catch((err: unknown) => {
      if (!alive) return;
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load draft');
      setStatus('error');
    });

    return () => { alive = false; };
  }, []);

  async function handleInsert() {
    if (!draft || !clientRef.current) return;
    await clientRef.current.invoke('ticket.comment.appendText', draft.text);
    setInserted(true);
  }

  async function handleThumb(value: 'up' | 'down') {
    if (!draft?.draftId || thumb !== null) return;
    const { apiUrl, apiKey } = configRef.current;
    await submitFeedback({ apiUrl, apiKey, draftId: draft.draftId, type: 'thumbs', payload: { value } });
    setThumb(value);
  }

  if (status === 'loading') {
    return (
      <div className="state-view">
        <div className="spinner" />
        <p>Generating draft…</p>
      </div>
    );
  }

  if (status === 'error') {
    return <div className="state-view error">{errorMsg}</div>;
  }

  if (!draft) return null;

  const confidencePct = Math.round(draft.confidence * 100);

  return (
    <div className="app">
      <div className="header">
        <span className={`badge badge-${draft.route}`}>
          {draft.route === 'auto' ? 'Auto-resolve' : 'Draft'}
        </span>
        <span className="confidence">{confidencePct}% confidence</span>
      </div>

      <div className="draft-text">{draft.text}</div>

      {draft.citations.length > 0 && (
        <div className="citations">
          <button
            className="citations-toggle"
            onClick={() => setCitationsOpen(o => !o)}
          >
            {draft.citations.length} source{draft.citations.length !== 1 ? 's' : ''}{' '}
            {citationsOpen ? '▲' : '▼'}
          </button>
          {citationsOpen && (
            <ul className="citations-list">
              {draft.citations.map((c, i) => (
                <li key={i} className="citation">
                  <span className="citation-score">{Math.round(c.score * 100)}%</span>
                  <span className="citation-snippet">{c.snippet}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="actions">
        <button
          className={`btn-insert${inserted ? ' inserted' : ''}`}
          onClick={() => void handleInsert()}
          disabled={inserted}
        >
          {inserted ? 'Inserted ✓' : 'Insert into reply'}
        </button>
        <div className="thumbs">
          <button
            className={`btn-thumb${thumb === 'up' ? ' active' : ''}`}
            onClick={() => void handleThumb('up')}
            title="Good answer"
            aria-label="Thumbs up"
          >
            👍
          </button>
          <button
            className={`btn-thumb${thumb === 'down' ? ' active' : ''}`}
            onClick={() => void handleThumb('down')}
            title="Poor answer"
            aria-label="Thumbs down"
          >
            👎
          </button>
        </div>
      </div>
    </div>
  );
}
