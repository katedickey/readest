import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  installChromeMock,
  uninstallChromeMock,
  type ChromeMock,
} from '../__test-utils__/chromeMock';
import { DEFAULT_READEST_BASE, getReadestBase, getReadestHost } from './baseUrl';

let chromeMock: ChromeMock;

beforeEach(() => {
  chromeMock = installChromeMock();
});

afterEach(() => {
  uninstallChromeMock();
});

describe('getReadestBase', () => {
  test('defaults to the production base when no override is set', async () => {
    expect(await getReadestBase()).toBe(DEFAULT_READEST_BASE);
  });

  test('returns readestApiBase from chrome.storage.local', async () => {
    await chromeMock.storage.local.set({ readestApiBase: 'https://my-readest.example.com' });
    expect(await getReadestBase()).toBe('https://my-readest.example.com');
  });

  test('strips trailing slashes', async () => {
    await chromeMock.storage.local.set({ readestApiBase: 'https://my-readest.example.com///' });
    expect(await getReadestBase()).toBe('https://my-readest.example.com');
  });

  test('ignores non-http(s) overrides', async () => {
    await chromeMock.storage.local.set({ readestApiBase: 'javascript:alert(1)' });
    expect(await getReadestBase()).toBe(DEFAULT_READEST_BASE);
  });

  test('returns default when chrome.storage is unavailable (offscreen race)', async () => {
    const real = chromeMock.storage;
    (chromeMock as unknown as { storage: undefined }).storage = undefined;
    try {
      expect(await getReadestBase()).toBe(DEFAULT_READEST_BASE);
    } finally {
      (chromeMock as unknown as { storage: typeof real }).storage = real;
    }
  });
});

describe('getReadestHost', () => {
  test('returns the default host when no override is set', async () => {
    expect(await getReadestHost()).toBe('web.readest.com');
  });

  test('returns the host portion of a configured override', async () => {
    await chromeMock.storage.local.set({ readestApiBase: 'https://my-readest.example.com:8443' });
    expect(await getReadestHost()).toBe('my-readest.example.com:8443');
  });
});
