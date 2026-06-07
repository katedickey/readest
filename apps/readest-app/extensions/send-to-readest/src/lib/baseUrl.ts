/**
 * Resolve the Readest server base URL used by the upload endpoint, the login
 * link in the popup, and the user-facing "sign in at X" message in the
 * service worker. Reads `readestApiBase` from `chrome.storage.local` so a
 * self-hoster can point the extension at their own server via the options
 * page (or programmatically: `chrome.storage.local.set({ readestApiBase: ... })`).
 *
 * Defaults to the official site when unset, malformed, or `chrome.storage`
 * is unavailable in the current context.
 */

export const DEFAULT_READEST_BASE = 'https://web.readest.com';

/**
 * Returns the configured server base URL with any trailing slashes stripped.
 * Always safe to await — never throws.
 */
export async function getReadestBase(): Promise<string> {
  try {
    if (chrome?.storage?.local) {
      const stored = (await chrome.storage.local.get('readestApiBase')) as {
        readestApiBase?: unknown;
      };
      const base = stored.readestApiBase;
      if (typeof base === 'string' && /^https?:\/\//.test(base)) {
        return base.replace(/\/+$/, '');
      }
    }
  } catch {
    // chrome.storage might be unavailable (e.g. offscreen page during its
    // first few ms of life) — fall through to the default.
  }
  return DEFAULT_READEST_BASE;
}

/**
 * Convenience: hostname portion of {@link getReadestBase}. Used in user-facing
 * messages like "Sign in at <host> first" so the prompt matches whichever
 * server the user has configured.
 */
export async function getReadestHost(): Promise<string> {
  const base = await getReadestBase();
  try {
    return new URL(base).host;
  } catch {
    return new URL(DEFAULT_READEST_BASE).host;
  }
}
