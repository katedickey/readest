import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

// Hoisted mocks — defined before the route module is imported.

const validateUserMock = vi.fn();
vi.mock('@/utils/access', () => ({
  validateUserAndToken: (...args: unknown[]) => validateUserMock(...args),
  getStoragePlanData: vi.fn(() => ({ usage: 0, quota: 1024 * 1024 * 1024 })),
  STORAGE_QUOTA_GRACE_BYTES: 0,
}));

const corsMock = vi.fn(async () => undefined);
vi.mock('@/utils/cors', () => ({
  corsAllMethods: vi.fn(),
  runMiddleware: corsMock,
}));

const getUploadSignedUrlMock = vi.fn();
const getDownloadSignedUrlMock = vi.fn();
vi.mock('@/utils/object', () => ({
  getUploadSignedUrl: (...args: unknown[]) => getUploadSignedUrlMock(...args),
  getDownloadSignedUrl: (...args: unknown[]) => getDownloadSignedUrlMock(...args),
}));

// The temp branch never touches Supabase (file inserts happen only on the
// non-temp path), so a minimal stub is fine.
vi.mock('@/utils/supabase', () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ limit: () => ({ single: async () => ({}) }) }) }),
      }),
    }),
  }),
}));

interface MockRes {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  _status: number;
  _body: Record<string, unknown> | undefined;
}

function makeRes(): MockRes {
  const res: MockRes = {
    status: vi.fn(),
    json: vi.fn(),
    _status: 0,
    _body: undefined,
  };
  res.status.mockImplementation((code: number) => {
    res._status = code;
    return res as unknown as NextApiResponse;
  });
  res.json.mockImplementation((body: Record<string, unknown>) => {
    res._body = body;
    return res as unknown as NextApiResponse;
  });
  return res;
}

function makeReq(body: Record<string, unknown>): NextApiRequest {
  return {
    method: 'POST',
    headers: { authorization: 'Bearer fake' },
    body,
  } as unknown as NextApiRequest;
}

const env = process.env as Record<string, string | undefined>;
const originalEnv = { ...env };

beforeEach(() => {
  validateUserMock.mockResolvedValue({ user: { id: 'user-abcdef12' }, token: 'tok' });
  getUploadSignedUrlMock.mockResolvedValue('https://signed.example/put');
  // The route extracts the pathname from this URL and pastes it under the
  // configured public base. The bucket-name segment is then stripped.
  getDownloadSignedUrlMock.mockResolvedValue(
    'https://internal.example/temp-bucket/temp/img/foo.png',
  );
  env['TEMP_STORAGE_PUBLIC_BUCKET_NAME'] = 'temp-bucket';
});

afterEach(() => {
  Object.keys(env).forEach((k) => delete env[k]);
  Object.assign(env, originalEnv);
  vi.resetModules();
  vi.clearAllMocks();
});

describe('POST /api/storage/upload (temp branch) — public URL host', () => {
  test('uses PUBLIC_STORAGE_BASE_URL with the bucket stripped (CDN-alias / Garage vhost endpoint)', async () => {
    env['PUBLIC_STORAGE_BASE_URL'] = 'https://temp-bucket.web.my-readest.example.com';
    delete env['S3_PUBLIC_ENDPOINT'];
    const { default: handler } = await import('@/pages/api/storage/upload');

    const res = makeRes();
    await handler(
      makeReq({ fileName: 'cover.png', fileSize: 1024, temp: true }),
      res as unknown as NextApiResponse,
    );

    expect(res._status).toBe(200);
    const body = res._body as { downloadUrl?: string };
    // Configured base already maps the bucket root to /, so the bucket
    // segment is stripped from the path.
    expect(body.downloadUrl).toBe(
      'https://temp-bucket.web.my-readest.example.com/temp/img/foo.png',
    );
  });

  test('PUBLIC_STORAGE_BASE_URL wins over S3_PUBLIC_ENDPOINT', async () => {
    env['PUBLIC_STORAGE_BASE_URL'] = 'https://cdn.my-readest.example.com';
    env['S3_PUBLIC_ENDPOINT'] = 'https://s3.my-readest.example.com';
    const { default: handler } = await import('@/pages/api/storage/upload');

    const res = makeRes();
    await handler(
      makeReq({ fileName: 'cover.png', fileSize: 1024, temp: true }),
      res as unknown as NextApiResponse,
    );

    const body = res._body as { downloadUrl?: string };
    expect(body.downloadUrl).toBe('https://cdn.my-readest.example.com/temp/img/foo.png');
  });

  test('strips a trailing slash from PUBLIC_STORAGE_BASE_URL', async () => {
    env['PUBLIC_STORAGE_BASE_URL'] = 'https://cdn.my-readest.example.com/';
    const { default: handler } = await import('@/pages/api/storage/upload');

    const res = makeRes();
    await handler(
      makeReq({ fileName: 'cover.png', fileSize: 1024, temp: true }),
      res as unknown as NextApiResponse,
    );

    const body = res._body as { downloadUrl?: string };
    expect(body.downloadUrl).toBe('https://cdn.my-readest.example.com/temp/img/foo.png');
  });

  test('falls back to S3_PUBLIC_ENDPOINT with bucket kept (path-style S3/MinIO)', async () => {
    delete env['PUBLIC_STORAGE_BASE_URL'];
    env['S3_PUBLIC_ENDPOINT'] = 'https://s3.my-readest.example.com';
    const { default: handler } = await import('@/pages/api/storage/upload');

    const res = makeRes();
    await handler(
      makeReq({ fileName: 'cover.png', fileSize: 1024, temp: true }),
      res as unknown as NextApiResponse,
    );

    const body = res._body as { downloadUrl?: string };
    // Path-style: bucket segment stays in the path.
    expect(body.downloadUrl).toBe('https://s3.my-readest.example.com/temp-bucket/temp/img/foo.png');
  });

  test('falls back to the official CDN host (bucket stripped) when neither env is set', async () => {
    delete env['PUBLIC_STORAGE_BASE_URL'];
    delete env['S3_PUBLIC_ENDPOINT'];
    const { default: handler } = await import('@/pages/api/storage/upload');

    const res = makeRes();
    await handler(
      makeReq({ fileName: 'cover.png', fileSize: 1024, temp: true }),
      res as unknown as NextApiResponse,
    );

    expect(res._status).toBe(200);
    const body = res._body as { downloadUrl?: string };
    expect(body.downloadUrl).toBe('https://storage.readest.com/temp/img/foo.png');
  });
});
