import { env } from '../config/env.js';

const EMAIL_RE = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g;
// Matches US-style and international phone numbers (loose heuristic).
// (?<!\d) / (?!\d) guards prevent matching mid-number digit runs.
const PHONE_RE =
  /(?<!\d)(\+\d{1,3}[\s\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}(?!\d)/g;

export function redactSync(text: string): string {
  return text.replace(EMAIL_RE, '[REDACTED_EMAIL]').replace(PHONE_RE, '[REDACTED_PHONE]');
}

export async function redact(text: string): Promise<string> {
  const url = env.REDACT_URL;
  if (!url) return redactSync(text);

  try {
    const res = await fetch(`${url}/redact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`presidio sidecar returned ${res.status}`);
    const data = (await res.json()) as { redacted: string };
    return data.redacted;
  } catch {
    return redactSync(text);
  }
}

export async function redactRecord(
  obj: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    result[k] = typeof v === 'string' ? await redact(v) : v;
  }
  return result;
}
