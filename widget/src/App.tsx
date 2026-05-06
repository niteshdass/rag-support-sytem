import { useState, useEffect, useRef, type KeyboardEvent, type CSSProperties } from 'react';

interface Citation {
  documentId: string;
  chunkId: string;
  score: number;
  snippet: string;
  title?: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
}

export function App() {
  const params = new URLSearchParams(window.location.search);
  const apiKey = params.get('apiKey') ?? '';
  const apiUrl = params.get('apiUrl') ?? '';

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [escalated, setEscalated] = useState(false);
  const [initError, setInitError] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${apiUrl}/chat/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    })
      .then(r => {
        if (!r.ok) throw new Error('session init failed');
        return r.json() as Promise<{ sessionId: string }>;
      })
      .then(data => setSessionId(data.sessionId))
      .catch(() => setInitError(true));
  }, [apiUrl, apiKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function sendMessage() {
    if (!sessionId || !input.trim() || loading || escalated) return;
    const text = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setLoading(true);

    try {
      const r = await fetch(`${apiUrl}/chat/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ sessionId, message: text }),
      });
      const data = await r.json() as {
        text: string;
        citations: Citation[];
        confidence: number;
        route: string;
      };
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: data.text, citations: data.citations ?? [] },
      ]);
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Something went wrong. Please try again.' },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function escalate() {
    if (!sessionId || escalated) return;
    try {
      await fetch(`${apiUrl}/chat/escalate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ sessionId }),
      });
    } finally {
      setEscalated(true);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  if (initError) {
    return (
      <div style={s.error}>
        <p>Could not connect to support. Please refresh and try again.</p>
      </div>
    );
  }

  const inputDisabled = !sessionId || escalated;

  return (
    <div style={s.root}>
      <div style={s.header}>
        <span style={s.headerTitle}>Support Chat</span>
        {!escalated && messages.length > 0 && (
          <button style={s.escalateBtn} onClick={() => void escalate()}>
            This didn't help
          </button>
        )}
      </div>

      <div style={s.messages}>
        {messages.length === 0 && !loading && (
          <p style={s.empty}>Hi! How can I help you today?</p>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={msg.role === 'user' ? s.userBubble : s.aiBubble}>
            <p style={s.msgText}>{msg.content}</p>
            {msg.citations && msg.citations.length > 0 && (
              <div style={s.citations}>
                {msg.citations.map((c, ci) => (
                  <span key={ci} title={c.snippet} style={s.citationBadge}>
                    ?{ci + 1}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div style={s.aiBubble}>
            <span style={s.typing}>···</span>
          </div>
        )}

        {escalated && (
          <div style={s.escalatedBanner}>
            A human agent has been notified and will follow up shortly.
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div style={s.inputArea}>
        <textarea
          style={s.textarea}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={escalated ? 'Escalated to a human agent' : 'Type your question...'}
          disabled={inputDisabled}
          rows={2}
        />
        <button
          style={{
            ...s.sendBtn,
            opacity: inputDisabled || !input.trim() || loading ? 0.5 : 1,
          }}
          onClick={() => void sendMessage()}
          disabled={inputDisabled || !input.trim() || loading}
        >
          Send
        </button>
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: '14px',
    color: '#1a1a1a',
    background: '#fff',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    background: '#1d4ed8',
    color: '#fff',
    flexShrink: 0,
  },
  headerTitle: {
    fontWeight: 600,
    fontSize: '15px',
  },
  escalateBtn: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.55)',
    color: '#fff',
    borderRadius: '4px',
    padding: '4px 10px',
    fontSize: '12px',
    cursor: 'pointer',
  },
  messages: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  empty: {
    color: '#6b7280',
    textAlign: 'center',
    marginTop: '32px',
  },
  userBubble: {
    alignSelf: 'flex-end',
    background: '#1d4ed8',
    color: '#fff',
    borderRadius: '12px 12px 2px 12px',
    padding: '10px 14px',
    maxWidth: '80%',
  },
  aiBubble: {
    alignSelf: 'flex-start',
    background: '#f3f4f6',
    color: '#1a1a1a',
    borderRadius: '12px 12px 12px 2px',
    padding: '10px 14px',
    maxWidth: '85%',
  },
  msgText: {
    lineHeight: 1.55,
    whiteSpace: 'pre-wrap',
  },
  citations: {
    marginTop: '6px',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
  },
  citationBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#dbeafe',
    color: '#1d4ed8',
    borderRadius: '50%',
    width: '20px',
    height: '20px',
    fontSize: '10px',
    fontWeight: 700,
    cursor: 'help',
    userSelect: 'none',
  },
  typing: {
    color: '#9ca3af',
    letterSpacing: '3px',
    fontSize: '18px',
  },
  escalatedBanner: {
    background: '#fef9c3',
    border: '1px solid #fde047',
    borderRadius: '8px',
    padding: '10px 14px',
    color: '#713f12',
    fontSize: '13px',
    textAlign: 'center',
  },
  inputArea: {
    display: 'flex',
    gap: '8px',
    padding: '12px',
    borderTop: '1px solid #e5e7eb',
    flexShrink: 0,
  },
  textarea: {
    flex: 1,
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    padding: '8px 12px',
    fontSize: '14px',
    resize: 'none',
    fontFamily: 'inherit',
    outline: 'none',
  },
  sendBtn: {
    background: '#1d4ed8',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '8px 16px',
    cursor: 'pointer',
    fontWeight: 500,
    fontSize: '14px',
    alignSelf: 'flex-end',
    transition: 'opacity 0.1s',
  },
  error: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    padding: '20px',
    color: '#dc2626',
    textAlign: 'center',
  },
};
