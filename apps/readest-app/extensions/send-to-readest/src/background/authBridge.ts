/**
 * Auth-bridge content script registration.
 *
 * The content script (`content/auth-bridge.js`) mirrors the user's Supabase
 * session token out of a Readest page's `localStorage` into the extension's
 * `chrome.storage.local` so the SW can authenticate to `/api/send/inbox/file`.
 *
 * It used to be declared statically in `manifest.content_scripts` against
 * a hard-coded list of readest.com hosts. That broke for self-hosters whose
 * Readest instance lives at a different domain — they could configure
 * `readestApiBase` via the options page, sign in successfully, but the bridge
 * never ran on their host so the popup stayed "signed out".
 *
 * Now: we register the same script dynamically from the SW, against the
 * default readest.com hosts AND the user-configured base. We re-register on
 * `chrome.storage.onChanged.readestApiBase` so a save in the options page
 * takes effect without an extension reload. After re-registering we also
 * re-inject into any already-open matching tabs so the user doesn't have to
 * refresh the page they just signed in on.
 *
 * Idempotent — safe to call repeatedly.
 */

import { getReadestBase } from '../lib/baseUrl';

export const AUTH_BRIDGE_SCRIPT_ID = 'auth-bridge';
export const AUTH_BRIDGE_JS = 'content/auth-bridge.js';

/**
 * Match patterns the bridge should always run against. Kept here (not in
 * manifest) so the zero-config readest.com flow stays working even after we
 * move registration out of the manifest. `http://localhost:3000/*` covers
 * the readest-app dev server.
 */
const DEFAULT_MATCHES = [
  'https://web.readest.com/*',
  'https://*.readest.com/*',
  'http://localhost:3000/*',
];

/** Build the full match list for the current `readestApiBase` setting. */
async function resolveMatches(): Promise<string[]> {
  const base = await getReadestBase();
  let custom: string | null = null;
  try {
    const url = new URL(base);
    // Skip if the configured base is already covered by the defaults — no
    // point registering the same matcher twice.
    if (url.host === 'web.readest.com' || url.host.endsWith('.readest.com')) {
      custom = null;
    } else if (url.host === 'localhost:3000' && url.protocol === 'http:') {
      custom = null;
    } else {
      custom = `${url.protocol}//${url.host}/*`;
    }
  } catch {
    // Malformed override — fall back to defaults only.
  }
  return custom ? [...DEFAULT_MATCHES, custom] : DEFAULT_MATCHES;
}

/**
 * Register (or re-register) the auth-bridge content script with the
 * currently-configured set of match patterns. After registering, walk any
 * already-open tabs whose URL matches one of the patterns and inject the
 * script there too — Chrome only auto-injects on future navigations to a
 * registered match, so without this the user would have to reload the page
 * they're currently signed in on.
 */
export async function syncAuthBridgeRegistration(): Promise<void> {
  if (!chrome?.scripting?.registerContentScripts) return;

  const matches = await resolveMatches();

  // Unregister-first lets us swap the matches list without RegistrationError.
  // The catch swallows "Nonexistent script ID" on first run.
  await chrome.scripting
    .unregisterContentScripts({ ids: [AUTH_BRIDGE_SCRIPT_ID] })
    .catch(() => undefined);

  try {
    await chrome.scripting.registerContentScripts([
      {
        id: AUTH_BRIDGE_SCRIPT_ID,
        matches,
        js: [AUTH_BRIDGE_JS],
        runAt: 'document_idle',
        // ISOLATED so we never touch the page's JS realm — we only read
        // the page's localStorage, which is shared between worlds.
        world: 'ISOLATED',
        persistAcrossSessions: true,
      },
    ]);
  } catch (err) {
    console.warn('[send-to-readest/sw] failed to register auth-bridge', err);
    return;
  }

  await reinjectIntoOpenTabs(matches);
}

/**
 * Inject the bridge into any already-open tabs whose URL matches one of the
 * `matches` patterns. Best-effort — failures (closed tab, restricted URL,
 * permission missing) are swallowed since the static registration above
 * still covers the next navigation.
 */
async function reinjectIntoOpenTabs(matches: string[]): Promise<void> {
  if (!chrome?.tabs?.query || !chrome?.scripting?.executeScript) return;
  let tabs: chrome.tabs.Tab[];
  try {
    tabs = await chrome.tabs.query({ url: matches });
  } catch {
    // chrome.tabs.query rejects when url patterns require permissions the
    // extension hasn't been granted; nothing to inject in that case.
    return;
  }
  await Promise.all(
    tabs.map(async (tab) => {
      if (typeof tab.id !== 'number') return;
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: false },
          files: [AUTH_BRIDGE_JS],
          world: 'ISOLATED',
        });
      } catch {
        // Restricted page (chrome://, edge://), tab closed mid-call, etc.
      }
    }),
  );
}

/**
 * Wire `chrome.storage.onChanged` so a save in the options page (or any
 * other write to `readestApiBase`) re-syncs the registration without an
 * extension restart.
 */
export function installAuthBridgeStorageWatcher(): void {
  if (!chrome?.storage?.onChanged?.addListener) return;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (!('readestApiBase' in changes)) return;
    void syncAuthBridgeRegistration();
  });
}
