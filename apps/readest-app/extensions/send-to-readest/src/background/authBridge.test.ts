import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  installChromeMock,
  uninstallChromeMock,
  type ChromeMock,
} from '../__test-utils__/chromeMock';
import {
  AUTH_BRIDGE_JS,
  AUTH_BRIDGE_SCRIPT_ID,
  installAuthBridgeStorageWatcher,
  syncAuthBridgeRegistration,
} from './authBridge';

interface ScriptingExt {
  registerContentScripts: ReturnType<typeof vi.fn>;
  unregisterContentScripts: ReturnType<typeof vi.fn>;
}

interface StorageOnChangedExt {
  addListener: ReturnType<typeof vi.fn>;
}

let chromeMock: ChromeMock;
let scripting: ScriptingExt;
let storageOnChanged: StorageOnChangedExt;

beforeEach(() => {
  chromeMock = installChromeMock();
  // Extend the shared mock with the APIs authBridge.ts needs that the
  // default mock doesn't ship by default.
  scripting = {
    registerContentScripts: vi.fn(async () => undefined),
    unregisterContentScripts: vi.fn(async () => undefined),
  };
  Object.assign(chromeMock.scripting, scripting);

  storageOnChanged = { addListener: vi.fn() };
  (chromeMock.storage as unknown as { onChanged: StorageOnChangedExt }).onChanged =
    storageOnChanged;
});

afterEach(() => {
  uninstallChromeMock();
});

describe('syncAuthBridgeRegistration', () => {
  test('registers only the defaults when readestApiBase is unset', async () => {
    await syncAuthBridgeRegistration();

    expect(scripting.unregisterContentScripts).toHaveBeenCalledWith({
      ids: [AUTH_BRIDGE_SCRIPT_ID],
    });
    expect(scripting.registerContentScripts).toHaveBeenCalledTimes(1);
    const [registrations] = scripting.registerContentScripts.mock.calls[0]!;
    expect(registrations).toEqual([
      {
        id: AUTH_BRIDGE_SCRIPT_ID,
        matches: [
          'https://web.readest.com/*',
          'https://*.readest.com/*',
          'http://localhost:3000/*',
        ],
        js: [AUTH_BRIDGE_JS],
        runAt: 'document_idle',
        world: 'ISOLATED',
        persistAcrossSessions: true,
      },
    ]);
  });

  test('adds a match pattern for the custom server when configured', async () => {
    await chromeMock.storage.local.set({ readestApiBase: 'https://my-readest.example.com' });
    await syncAuthBridgeRegistration();

    const [registrations] = scripting.registerContentScripts.mock.calls[0]!;
    expect(registrations[0].matches).toContain('https://my-readest.example.com/*');
    // Defaults still present so zero-config readest.com tabs keep working.
    expect(registrations[0].matches).toContain('https://web.readest.com/*');
  });

  test('does not duplicate a custom base that is already a readest.com host', async () => {
    await chromeMock.storage.local.set({ readestApiBase: 'https://web.readest.com' });
    await syncAuthBridgeRegistration();

    const [registrations] = scripting.registerContentScripts.mock.calls[0]!;
    expect(registrations[0].matches).toEqual([
      'https://web.readest.com/*',
      'https://*.readest.com/*',
      'http://localhost:3000/*',
    ]);
  });

  test('unregisters before registering (idempotent on repeat calls)', async () => {
    await chromeMock.storage.local.set({ readestApiBase: 'https://a.example.com' });
    await syncAuthBridgeRegistration();
    await chromeMock.storage.local.set({ readestApiBase: 'https://b.example.com' });
    await syncAuthBridgeRegistration();

    expect(scripting.unregisterContentScripts).toHaveBeenCalledTimes(2);
    expect(scripting.registerContentScripts).toHaveBeenCalledTimes(2);
    const second = scripting.registerContentScripts.mock.calls[1]![0];
    expect(second[0].matches).toContain('https://b.example.com/*');
    expect(second[0].matches).not.toContain('https://a.example.com/*');
  });

  test('survives a malformed readestApiBase (falls back to defaults)', async () => {
    await chromeMock.storage.local.set({ readestApiBase: 'not a url' });
    await syncAuthBridgeRegistration();

    const [registrations] = scripting.registerContentScripts.mock.calls[0]!;
    // Malformed override is treated as if unset — defaults only, no custom entry.
    expect(registrations[0].matches).toEqual([
      'https://web.readest.com/*',
      'https://*.readest.com/*',
      'http://localhost:3000/*',
    ]);
  });

  test('re-injects auth-bridge into already-open matching tabs', async () => {
    await chromeMock.storage.local.set({ readestApiBase: 'https://my-readest.example.com' });
    chromeMock.tabs.query.mockResolvedValueOnce([
      { id: 11, url: 'https://my-readest.example.com/library' },
      { id: 22, url: 'https://web.readest.com/' },
    ] as unknown as chrome.tabs.Tab[]);

    await syncAuthBridgeRegistration();

    expect(chromeMock.scripting.executeScript).toHaveBeenCalledTimes(2);
    const targets = chromeMock.scripting.executeScript.mock.calls.map(
      (c) => (c[0] as { target: { tabId: number } }).target.tabId,
    );
    expect(targets.sort()).toEqual([11, 22]);
  });

  test('swallows executeScript errors for restricted tabs', async () => {
    chromeMock.tabs.query.mockResolvedValueOnce([
      { id: 1, url: 'chrome://extensions' },
    ] as unknown as chrome.tabs.Tab[]);
    chromeMock.scripting.executeScript.mockRejectedValueOnce(
      new Error('Cannot access a chrome:// URL'),
    );

    await expect(syncAuthBridgeRegistration()).resolves.not.toThrow();
  });
});

describe('installAuthBridgeStorageWatcher', () => {
  test('re-syncs registration when readestApiBase changes', async () => {
    installAuthBridgeStorageWatcher();
    expect(storageOnChanged.addListener).toHaveBeenCalledOnce();

    // Reset the register spy so we only observe the watcher-triggered call.
    scripting.registerContentScripts.mockClear();

    const listener = storageOnChanged.addListener.mock.calls[0]![0] as (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => void;

    await chromeMock.storage.local.set({ readestApiBase: 'https://my-readest.example.com' });
    listener(
      { readestApiBase: { oldValue: undefined, newValue: 'https://my-readest.example.com' } },
      'local',
    );
    // The listener kicks off an async syncAuthBridgeRegistration — wait a tick.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(scripting.registerContentScripts).toHaveBeenCalledTimes(1);
    const [registrations] = scripting.registerContentScripts.mock.calls[0]!;
    expect(registrations[0].matches).toContain('https://my-readest.example.com/*');
  });

  test('ignores changes in storage areas other than local', async () => {
    installAuthBridgeStorageWatcher();
    scripting.registerContentScripts.mockClear();

    const listener = storageOnChanged.addListener.mock.calls[0]![0] as (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => void;
    listener({ readestApiBase: { newValue: 'x' } }, 'sync');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(scripting.registerContentScripts).not.toHaveBeenCalled();
  });

  test('ignores changes to unrelated keys', async () => {
    installAuthBridgeStorageWatcher();
    scripting.registerContentScripts.mockClear();

    const listener = storageOnChanged.addListener.mock.calls[0]![0] as (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => void;
    listener({ readestAccessToken: { newValue: 'tok' } }, 'local');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(scripting.registerContentScripts).not.toHaveBeenCalled();
  });
});
