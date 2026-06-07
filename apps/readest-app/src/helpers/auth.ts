import { User } from '@supabase/supabase-js';
import { supabase } from '@/utils/supabase';

/**
 * Sign the user out and clear every persisted auth artifact.
 *
 * Called when switching to a different backend (e.g. the user changes
 * `customServer.serverUrl` in Settings). The existing session is tied to
 * the old Supabase project — its access token is meaningless against any
 * other server, and leaving it in `localStorage` would have the next
 * Supabase singleton (after the reload that follows) silently surface a
 * stale "signed in" state for ~half a second before the token fails its
 * first real call.
 *
 * The server-side revoke is best-effort: the old server may already be
 * unreachable by the time the user clicks Save (different network, taken
 * down, DNS changed). Whichever way that call goes, the local wipe still
 * runs so the next boot starts from a clean signed-out state.
 */
export async function wipeAuthCredentials(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch {
    // Old server unreachable — keep going.
  }
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    // Supabase persists the session under `sb-<project-ref>-auth-token`.
    // The next client created against a different project ref must not see
    // a stale entry from the previous one, so wipe every match. Iterate
    // first, then remove — mutating during the index walk shifts keys and
    // makes us skip entries.
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && /^sb-.*-auth-token$/.test(key)) {
        toRemove.push(key);
      }
    }
    for (const key of toRemove) {
      localStorage.removeItem(key);
    }
  } catch {
    // Storage exceptions (private mode, quota, etc.) — the in-memory
    // AuthContext will still drop its user/token on reload.
  }
}

interface UseAuthCallbackOptions {
  accessToken?: string | null;
  refreshToken?: string | null;
  login: (accessToken: string, user: User) => void;
  navigate: (path: string) => void;
  type?: string | null;
  next?: string;
  error?: string | null;
  errorCode?: string | null;
  errorDescription?: string | null;
}

export function handleAuthCallback({
  accessToken,
  refreshToken,
  login,
  navigate,
  type,
  next = '/',
  error,
}: UseAuthCallbackOptions) {
  async function finalizeSession() {
    if (error) {
      navigate('/auth/error');
      return;
    }

    if (!accessToken || !refreshToken) {
      navigate('/library');
      return;
    }

    const { error: err } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (err) {
      console.error('Error setting session:', err);
      navigate('/auth/error');
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      login(accessToken, user);
      if (type === 'recovery') {
        navigate('/auth/recovery');
        return;
      }
      navigate(next);
    } else {
      console.error('Error fetching user data');
      navigate('/auth/error');
    }
  }

  finalizeSession();
}
