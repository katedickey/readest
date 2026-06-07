import { READEST_WEB_BASE_URL, SHARE_BASE_URL, SHARE_TOKEN_LENGTH } from '@/services/constants';
import { useSettingsStore } from '@/store/settingsStore';

export interface ShareDeepLink {
  token: string;
  // Reserved for future query params (e.g., recipient locale, share variant).
  // Currently no params are emitted, but parseShareDeepLink preserves the
  // shape so callers don't need to be updated when more arrive.
}

const TOKEN_RE = new RegExp(`^[A-Za-z0-9]{${SHARE_TOKEN_LENGTH}}$`);

const isValidToken = (raw: unknown): raw is string => typeof raw === 'string' && TOKEN_RE.test(raw);

/**
 * Custom-server-aware base URL for outbound + inbound share URLs. When the
 * user has configured a custom server in Settings → Custom Server, share
 * links should round-trip through that server so a self-hosted instance
 * does not silently emit URLs that point at the official site.
 *
 * Returns null when no custom server is set, or when the store hasn't been
 * hydrated yet (early-boot calls fall back to the official base).
 */
const getCustomServerBase = (): string | null => {
  try {
    const url = useSettingsStore.getState().settings?.customServer?.serverUrl;
    if (typeof url === 'string' && url.length > 0) {
      return url.replace(/\/+$/, '');
    }
  } catch {
    // Store may not be hydrated yet in unusual boot orders.
  }
  return null;
};

// Canonical share URL embedded in the dialog, share sheet, and any "copy link"
// affordance. Points at the user's custom server when one is configured;
// otherwise the public web target.
export const buildShareUrl = (token: string): string => {
  const customBase = getCustomServerBase();
  if (customBase) return `${customBase}/s/${token}`;
  return `${SHARE_BASE_URL}/${token}`;
};

// Parses both the custom-scheme and HTTPS forms used by the deeplink ingress.
//   readest://share/{token}
//   https://web.readest.com/s/{token}
// Returns null on invalid input so callers can fall through to other parsers.
export const parseShareDeepLink = (url: string): ShareDeepLink | null => {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol === 'readest:') {
    // For readest://share/{token} the host portion holds the path segment
    // before the slash. Use pathname for the token; url.host == 'share'.
    if (parsed.host !== 'share') return null;
    const token = parsed.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
    return isValidToken(token) ? { token } : null;
  }
  if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
    if (!isWebReadestHost(parsed.host)) return null;
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length !== 2 || segments[0] !== 's') return null;
    const token = segments[1]!;
    return isValidToken(token) ? { token } : null;
  }
  return null;
};

const isWebReadestHost = (host: string): boolean => {
  // Matches the production host, any preview domain Readest may serve from,
  // and — when set — the user's configured custom-server host so self-hosted
  // share URLs round-trip into the native app. Conservative: third-party hosts
  // are still rejected unless they exactly match the configured custom server.
  if (host === new URL(READEST_WEB_BASE_URL).host) return true;
  if (host.endsWith('.readest.com')) return true;
  const customBase = getCustomServerBase();
  if (customBase) {
    try {
      if (host === new URL(customBase).host) return true;
    } catch {
      // Malformed customServer.serverUrl — treat as unset.
    }
  }
  return false;
};
