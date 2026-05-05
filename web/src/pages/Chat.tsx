import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { sendQuery, type Citation, type QueryResponse } from '../api/query'
import { cn } from '../lib/utils'

type Audience = 'end-user' | 'agent'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
  confidence?: number
  route?: 'auto' | 'draft'
}

function CitationList({ citations }: { citations: Citation[] }) {
  if (!citations.length) return null
  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Sources</p>
      {citations.map((c) => (
        <div key={c.chunkId} className="rounded border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-mono text-[10px] opacity-60">{c.documentId.slice(-8)}</span>
          <span className="mx-2 opacity-40">·</span>
          <span className="italic">"{c.snippet}"</span>
        </div>
      ))}
    </div>
  )
}

function ConfidenceBadge({ confidence, route }: { confidence: number; route: 'auto' | 'draft' }) {
  const pct = Math.round(confidence * 100)
  const color =
    confidence >= 0.8 ? 'text-green-600 bg-green-50 border-green-200' :
    confidence >= 0.5 ? 'text-yellow-700 bg-yellow-50 border-yellow-200' :
    'text-red-600 bg-red-50 border-red-200'
  return (
    <span className={cn('ml-2 rounded border px-1.5 py-0.5 text-[10px] font-medium', color)}>
      {pct}% · {route}
    </span>
  )
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [audience, setAudience] = useState<Audience>('agent')
  const bottomRef = useRef<HTMLDivElement>(null)

  const mutation = useMutation<QueryResponse, Error, string>({
    mutationFn: (query) =>
      sendQuery({
        query,
        audience,
        history: messages
          .filter((m) => m.role === 'user')
          .slice(-10)
          .map((m) => m.content),
      }),
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        {
          id: data.traceId,
          role: 'assistant',
          content: data.text,
          citations: data.citations,
          confidence: data.confidence,
          route: data.route,
        },
      ])
    },
    onError: (err) => {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `Error: ${err.message}`,
        },
      ])
    },
  })

  function submit() {
    const q = input.trim()
    if (!q || mutation.isPending) return
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: 'user', content: q },
    ])
    setInput('')
    mutation.mutate(q)
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, mutation.isPending])

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Chat</h1>
          <p className="text-sm text-muted-foreground">Ask anything — powered by your knowledge base</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border p-1">
          {(['agent', 'end-user'] as Audience[]).map((a) => (
            <button
              key={a}
              onClick={() => setAudience(a)}
              className={cn(
                'rounded px-3 py-1 text-xs font-medium transition-colors',
                audience === a
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {a === 'agent' ? 'Agent (internal)' : 'End-user'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto rounded-lg border bg-muted/20 p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No messages yet. Ask a question below.
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              'flex',
              m.role === 'user' ? 'justify-end' : 'justify-start',
            )}
          >
            <div
              className={cn(
                'max-w-[75%] rounded-lg px-4 py-3 text-sm',
                m.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background border shadow-sm',
              )}
            >
              {m.role === 'assistant' && m.confidence !== undefined && m.route && (
                <div className="mb-1 flex items-center">
                  <span className="text-xs font-medium text-muted-foreground">SupportPilot</span>
                  <ConfidenceBadge confidence={m.confidence} route={m.route} />
                </div>
              )}
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.citations && <CitationList citations={m.citations} />}
            </div>
          </div>
        ))}
        {mutation.isPending && (
          <div className="flex justify-start">
            <div className="rounded-lg border bg-background px-4 py-3 shadow-sm">
              <span className="text-xs text-muted-foreground">Thinking…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="mt-3 flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask a question… (Enter to send, Shift+Enter for newline)"
          rows={2}
          className="flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          onClick={submit}
          disabled={!input.trim() || mutation.isPending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 hover:bg-primary/90 transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  )
}
