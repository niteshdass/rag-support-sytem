import { Langfuse } from 'langfuse';
import { env } from '../config/env.js';
import { logger } from './logger.js';

let _client: Langfuse | null = null;
let _enabled = false;

function init(): void {
  const { LANGFUSE_HOST, LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY } = env;
  if (!LANGFUSE_HOST || !LANGFUSE_PUBLIC_KEY || !LANGFUSE_SECRET_KEY) {
    logger.info('langfuse: env vars not set, tracing disabled');
    return;
  }
  _client = new Langfuse({
    baseUrl: LANGFUSE_HOST,
    publicKey: LANGFUSE_PUBLIC_KEY,
    secretKey: LANGFUSE_SECRET_KEY,
    flushAt: 20,
    flushInterval: 10_000,
  });
  _enabled = true;
  logger.info({ host: LANGFUSE_HOST }, 'langfuse: tracing enabled');
}

init();

export interface LangfuseTrace {
  span(name: string, input?: Record<string, unknown>): LangfuseSpan;
  end(output?: Record<string, unknown>): void;
}

export interface LangfuseSpan {
  end(output?: Record<string, unknown>): void;
}

class NoopSpan implements LangfuseSpan {
  end(_output?: Record<string, unknown>): void {}
}

class NoopTrace implements LangfuseTrace {
  span(_name: string, _input?: Record<string, unknown>): LangfuseSpan {
    return new NoopSpan();
  }
  end(_output?: Record<string, unknown>): void {}
}

class RealSpan implements LangfuseSpan {
  constructor(private readonly inner: ReturnType<ReturnType<Langfuse['trace']>['span']>) {}
  end(output?: Record<string, unknown>): void {
    this.inner.end({ output });
  }
}

class RealTrace implements LangfuseTrace {
  constructor(private readonly inner: ReturnType<Langfuse['trace']>) {}

  span(name: string, input?: Record<string, unknown>): LangfuseSpan {
    return new RealSpan(this.inner.span({ name, input }));
  }

  end(output?: Record<string, unknown>): void {
    this.inner.update({ output });
  }
}

export interface StartTraceOptions {
  traceId: string;
  name: string;
  tenantId: string;
  audience: string;
  input?: Record<string, unknown>;
}

export function startTrace(opts: StartTraceOptions): LangfuseTrace {
  if (!_enabled || !_client) return new NoopTrace();

  const trace = _client.trace({
    id: opts.traceId,
    name: opts.name,
    metadata: { tenantId: opts.tenantId, audience: opts.audience },
    input: opts.input,
  });

  return new RealTrace(trace);
}

export async function flushTracing(): Promise<void> {
  if (_client) await _client.flushAsync();
}
