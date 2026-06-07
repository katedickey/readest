/**
 * Options page: lets the user point the extension at a self-hosted Readest
 * server. Persists `readestApiBase` in `chrome.storage.local`; the SW upload
 * path, popup login link, and "sign in at <host>" message all read from
 * `lib/baseUrl.ts` so a save here propagates without any extension restart.
 */

import { DEFAULT_READEST_BASE } from '../lib/baseUrl';
import { localizeDom, translate as _ } from '../lib/i18n';

localizeDom();

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id) as T | null;
  if (!el) throw new Error(`#${id} missing`);
  return el;
};

const input = $<HTMLInputElement>('server-url');
const saveBtn = $<HTMLButtonElement>('save');
const resetBtn = $<HTMLButtonElement>('reset');
const statusEl = $('status');

function setStatus(message: string, kind?: 'ok' | 'err'): void {
  statusEl.textContent = message;
  statusEl.className = `status ${kind ?? ''}`.trim();
}

/** Trim, drop trailing slashes, and reject anything that isn't a plausible
 *  http(s) URL. Empty input is treated as "clear the setting". */
function normalize(raw: string): { ok: true; value: string } | { ok: 'clear' } | { ok: false } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: 'clear' };
  if (!/^https?:\/\//i.test(trimmed)) return { ok: false };
  try {
    // Round-trip through URL to weed out garbage like "https://"
    new URL(trimmed);
  } catch {
    return { ok: false };
  }
  return { ok: true, value: trimmed.replace(/\/+$/, '') };
}

async function load(): Promise<void> {
  try {
    const stored = (await chrome.storage.local.get('readestApiBase')) as {
      readestApiBase?: unknown;
    };
    const base = stored.readestApiBase;
    input.value = typeof base === 'string' ? base : '';
    input.placeholder = DEFAULT_READEST_BASE;
  } catch (err) {
    setStatus(_('Could not load settings: {reason}', { reason: String(err) }), 'err');
  }
}

saveBtn.addEventListener('click', async () => {
  const result = normalize(input.value);
  if (result.ok === false) {
    setStatus(_('Server URL must start with http:// or https://'), 'err');
    return;
  }
  try {
    if (result.ok === 'clear') {
      await chrome.storage.local.remove('readestApiBase');
      input.value = '';
      setStatus(_('Cleared — using default ({default}).', { default: DEFAULT_READEST_BASE }), 'ok');
    } else {
      await chrome.storage.local.set({ readestApiBase: result.value });
      input.value = result.value;
      setStatus(_('Saved.'), 'ok');
    }
  } catch (err) {
    setStatus(_('Could not save: {reason}', { reason: String(err) }), 'err');
  }
});

resetBtn.addEventListener('click', async () => {
  try {
    await chrome.storage.local.remove('readestApiBase');
    input.value = '';
    setStatus(_('Cleared — using default ({default}).', { default: DEFAULT_READEST_BASE }), 'ok');
  } catch (err) {
    setStatus(_('Could not reset: {reason}', { reason: String(err) }), 'err');
  }
});

void load();
