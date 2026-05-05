declare global {
  const ZAFClient: {
    init(): ZAFClientInstance;
  };
}

interface ZAFClientInstance {
  get(path: string | string[]): Promise<Record<string, unknown>>;
  invoke(path: string, ...args: unknown[]): Promise<unknown>;
  on(event: string, handler: (...args: unknown[]) => unknown): void;
  metadata(): Promise<{ settings: Record<string, string> }>;
}

export {};
