import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Unit test: schedulePeriodicSync / cancelPeriodicSync
// We mock Agenda so the test doesn't need a running MongoDB.
// ---------------------------------------------------------------------------

const mockEvery = vi.fn().mockResolvedValue(undefined);
const mockCancel = vi.fn().mockResolvedValue(2);

vi.mock('agenda', () => {
  const MockAgenda = vi.fn().mockImplementation(() => ({
    every: mockEvery,
    cancel: mockCancel,
    create: vi.fn().mockReturnValue({ save: vi.fn().mockResolvedValue(undefined) }),
    define: vi.fn(),
    on: vi.fn(),
    once: vi.fn().mockImplementation((_event: string, cb: () => void) => {
      if (_event === 'ready') setTimeout(cb, 0);
    }),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  }));
  return { default: MockAgenda };
});

vi.mock('../../src/config/env.js', () => ({
  env: { MONGODB_URI: 'mongodb://localhost:27017/test' },
}));

vi.mock('../../src/jobs/ingestDocument.js', () => ({ defineIngestDocument: vi.fn() }));
vi.mock('../../src/jobs/syncSource.js', () => ({ defineSyncSource: vi.fn() }));
vi.mock('../../src/jobs/generateDraft.js', () => ({ defineGenerateDraft: vi.fn() }));
vi.mock('../../src/observability/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), child: vi.fn().mockReturnThis() },
}));

// Import after mocks are set up
import { schedulePeriodicSync, cancelPeriodicSync } from '../../src/jobs/index.js';

describe('schedulePeriodicSync', () => {
  beforeEach(() => {
    mockEvery.mockClear();
    mockCancel.mockClear();
  });

  it('calls agenda.every with sourceId and default interval', async () => {
    await schedulePeriodicSync('source-123');

    expect(mockEvery).toHaveBeenCalledWith(
      'every 6 hours',
      'sync-source',
      { sourceId: 'source-123' },
      expect.objectContaining({ skipImmediate: true }),
    );
  });

  it('uses custom syncCron when provided', async () => {
    await schedulePeriodicSync('source-456', '0 * * * *');

    expect(mockEvery).toHaveBeenCalledWith(
      '0 * * * *',
      'sync-source',
      { sourceId: 'source-456' },
      expect.objectContaining({ skipImmediate: true }),
    );
  });
});

describe('cancelPeriodicSync', () => {
  beforeEach(() => {
    mockEvery.mockClear();
    mockCancel.mockClear();
  });

  it('calls agenda.cancel with correct query', async () => {
    await cancelPeriodicSync('source-789');

    expect(mockCancel).toHaveBeenCalledWith({
      name: 'sync-source',
      data: { sourceId: 'source-789' },
    });
  });
});
