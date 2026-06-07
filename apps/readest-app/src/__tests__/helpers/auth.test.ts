import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { User, AuthError } from '@supabase/supabase-js';

// Mock supabase before importing the module under test
const mockSetSession = vi.fn();
const mockGetUser = vi.fn();
const mockSignOut = vi.fn(async () => ({ error: null }));

vi.mock('@/utils/supabase', () => ({
  supabase: {
    auth: {
      setSession: (...args: unknown[]) => mockSetSession(...args),
      getUser: () => mockGetUser(),
      signOut: () => mockSignOut(),
    },
  },
}));

import { handleAuthCallback, wipeAuthCredentials } from '@/helpers/auth';

describe('handleAuthCallback', () => {
  let mockLogin: ReturnType<typeof vi.fn<(accessToken: string, user: User) => void>>;
  let mockNavigate: ReturnType<typeof vi.fn<(path: string) => void>>;

  const fakeUser: User = {
    id: 'user-123',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2024-01-01T00:00:00Z',
  } as User;

  beforeEach(() => {
    mockLogin = vi.fn<(accessToken: string, user: User) => void>();
    mockNavigate = vi.fn<(path: string) => void>();
    mockSetSession.mockReset();
    mockGetUser.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should navigate to /auth/error when error is present', async () => {
    handleAuthCallback({
      accessToken: 'token',
      refreshToken: 'refresh',
      login: mockLogin,
      navigate: mockNavigate,
      error: 'some_error',
    });

    // Wait for the async finalizeSession to complete
    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/auth/error');
    });

    expect(mockLogin).not.toHaveBeenCalled();
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it('should navigate to /library when accessToken is missing', async () => {
    handleAuthCallback({
      accessToken: null,
      refreshToken: 'refresh',
      login: mockLogin,
      navigate: mockNavigate,
    });

    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/library');
    });

    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('should navigate to /library when refreshToken is missing', async () => {
    handleAuthCallback({
      accessToken: 'token',
      refreshToken: null,
      login: mockLogin,
      navigate: mockNavigate,
    });

    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/library');
    });

    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('should navigate to /library when both tokens are missing', async () => {
    handleAuthCallback({
      login: mockLogin,
      navigate: mockNavigate,
    });

    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/library');
    });
  });

  it('should navigate to /auth/error when setSession fails', async () => {
    const sessionError: AuthError = {
      message: 'Invalid token',
      name: 'AuthError',
      status: 401,
    } as AuthError;

    mockSetSession.mockResolvedValue({ error: sessionError });

    handleAuthCallback({
      accessToken: 'bad-token',
      refreshToken: 'bad-refresh',
      login: mockLogin,
      navigate: mockNavigate,
    });

    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/auth/error');
    });

    expect(mockSetSession).toHaveBeenCalledWith({
      access_token: 'bad-token',
      refresh_token: 'bad-refresh',
    });
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('should login and navigate to next URL on successful auth', async () => {
    mockSetSession.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({ data: { user: fakeUser } });

    handleAuthCallback({
      accessToken: 'good-token',
      refreshToken: 'good-refresh',
      login: mockLogin,
      navigate: mockNavigate,
      next: '/reader',
    });

    await vi.waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('good-token', fakeUser);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/reader');
  });

  it('should default next to "/" when not specified', async () => {
    mockSetSession.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({ data: { user: fakeUser } });

    handleAuthCallback({
      accessToken: 'token',
      refreshToken: 'refresh',
      login: mockLogin,
      navigate: mockNavigate,
    });

    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('should navigate to /auth/recovery when type is "recovery"', async () => {
    mockSetSession.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({ data: { user: fakeUser } });

    handleAuthCallback({
      accessToken: 'token',
      refreshToken: 'refresh',
      login: mockLogin,
      navigate: mockNavigate,
      type: 'recovery',
      next: '/some-page',
    });

    await vi.waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('token', fakeUser);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/auth/recovery');
    // Should NOT navigate to next when type is recovery
    expect(mockNavigate).not.toHaveBeenCalledWith('/some-page');
  });

  it('should navigate to /auth/error when getUser returns null user', async () => {
    mockSetSession.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({ data: { user: null } });

    handleAuthCallback({
      accessToken: 'token',
      refreshToken: 'refresh',
      login: mockLogin,
      navigate: mockNavigate,
    });

    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/auth/error');
    });

    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('should not call login when user is undefined from getUser', async () => {
    mockSetSession.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({ data: { user: undefined } });

    handleAuthCallback({
      accessToken: 'token',
      refreshToken: 'refresh',
      login: mockLogin,
      navigate: mockNavigate,
    });

    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/auth/error');
    });

    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('should pass the correct session parameters to setSession', async () => {
    mockSetSession.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({ data: { user: fakeUser } });

    handleAuthCallback({
      accessToken: 'my-access-token',
      refreshToken: 'my-refresh-token',
      login: mockLogin,
      navigate: mockNavigate,
    });

    await vi.waitFor(() => {
      expect(mockSetSession).toHaveBeenCalledWith({
        access_token: 'my-access-token',
        refresh_token: 'my-refresh-token',
      });
    });
  });
});

describe('wipeAuthCredentials', () => {
  beforeEach(() => {
    localStorage.clear();
    mockSignOut.mockClear();
    mockSignOut.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('calls supabase.auth.signOut to revoke server-side', async () => {
    await wipeAuthCredentials();
    expect(mockSignOut).toHaveBeenCalledOnce();
  });

  it('removes the AuthContext keys from localStorage', async () => {
    localStorage.setItem('token', 'jwt-abc');
    localStorage.setItem('refresh_token', 'refresh-abc');
    localStorage.setItem('user', JSON.stringify({ id: 'u1' }));
    await wipeAuthCredentials();
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });

  it('removes every sb-<project-ref>-auth-token entry', async () => {
    localStorage.setItem('sb-default-auth-token', JSON.stringify({ access_token: 'a' }));
    localStorage.setItem('sb-my-readest-auth-token', JSON.stringify({ access_token: 'b' }));
    // Unrelated keys must be preserved — wipe is auth-scoped.
    localStorage.setItem('readest.customServer', '{"supabaseUrl":"https://x"}');
    localStorage.setItem('readest:lastImportFolder', '/books');

    await wipeAuthCredentials();

    expect(localStorage.getItem('sb-default-auth-token')).toBeNull();
    expect(localStorage.getItem('sb-my-readest-auth-token')).toBeNull();
    expect(localStorage.getItem('readest.customServer')).toBe('{"supabaseUrl":"https://x"}');
    expect(localStorage.getItem('readest:lastImportFolder')).toBe('/books');
  });

  it('still runs the local wipe when signOut rejects (old server unreachable)', async () => {
    localStorage.setItem('token', 'jwt-abc');
    localStorage.setItem('sb-old-auth-token', 'whatever');
    mockSignOut.mockRejectedValueOnce(new Error('network down'));

    await expect(wipeAuthCredentials()).resolves.toBeUndefined();
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('sb-old-auth-token')).toBeNull();
  });
});
