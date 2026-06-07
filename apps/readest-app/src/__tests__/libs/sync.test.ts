import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/utils/access', () => ({
  getAccessToken: vi.fn(async () => 'fake-token'),
}));

// The base URL is resolved through environment.ts so that custom-server
// overrides set after module load are honoured by SyncClient.
vi.mock('@/services/environment', () => {
  let override: string | undefined;
  return {
    getAPIBaseUrl: () => override ?? 'https://default.example/api',
    __setOverride: (url: string | undefined) => {
      override = url;
    },
  };
});

import { SyncClient } from '@/libs/sync';
import * as env from '@/services/environment';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  (env as unknown as { __setOverride: (u: string | undefined) => void }).__setOverride(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SyncClient endpoint resolution', () => {
  test('pullChanges uses the current API base URL, not the value captured at import', async () => {
    // Apply a custom-server override AFTER the module is already loaded.
    // This mimics the real boot order: sync.ts is imported during page boot,
    // long before settings load and call setBaseUrlOverride.
    (env as unknown as { __setOverride: (u: string) => void }).__setOverride(
      'https://self-hosted.example/api',
    );

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ books: null, configs: null, notes: null }), { status: 200 }),
    );

    const client = new SyncClient();
    await client.pullChanges(0);

    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url.startsWith('https://self-hosted.example/api/sync')).toBe(true);
  });

  test('pushChanges uses the current API base URL', async () => {
    (env as unknown as { __setOverride: (u: string) => void }).__setOverride(
      'https://self-hosted.example/api',
    );

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ books: null, configs: null, notes: null }), { status: 200 }),
    );

    const client = new SyncClient();
    await client.pushChanges({});

    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url).toBe('https://self-hosted.example/api/sync');
  });
});
