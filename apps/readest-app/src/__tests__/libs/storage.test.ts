import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/utils/access', () => ({
  getAccessToken: vi.fn(async () => 'fake-token'),
  getUserID: vi.fn(async () => 'fake-user'),
}));

vi.mock('@/services/environment', () => {
  let override: string | undefined;
  return {
    getAPIBaseUrl: () => override ?? 'https://default.example/api',
    isWebAppPlatform: () => true,
    __setOverride: (url: string | undefined) => {
      override = url;
    },
  };
});

// Stub the transfer helpers — the test only cares about which URL the
// JSON metadata request is sent to.
vi.mock('@/utils/transfer', () => ({
  webUpload: vi.fn(async () => undefined),
  tauriUpload: vi.fn(async () => undefined),
  webDownload: vi.fn(async () => ({ headers: {}, blob: new Blob() })),
  tauriDownload: vi.fn(async () => undefined),
}));

import { uploadFile } from '@/libs/storage';
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

describe('storage.uploadFile endpoint resolution', () => {
  test('uses the current API base URL, not the value captured at import', async () => {
    (env as unknown as { __setOverride: (u: string) => void }).__setOverride(
      'https://self-hosted.example/api',
    );

    // fetchWithAuth wraps fetch; the upload request returns a signed URL.
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ uploadUrl: 'https://signed.example/put' }), { status: 200 }),
    );

    const file = new File(['hello'], 'book.epub', { type: 'application/epub+zip' });
    await uploadFile(file, '/tmp/book.epub');

    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url).toBe('https://self-hosted.example/api/storage/upload');
  });
});
