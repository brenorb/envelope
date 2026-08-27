import test from 'node:test';
import assert from 'node:assert/strict';
import { createOfflineFirstResolver } from '../src/offline-cache.js';

const pointer = 'naddr1qqxnzd3h9kummnw3e4kzmr0d3sk6t';
const target = {
  verified: true,
  indexHtml: '<!doctype html><h1>Cached napplet</h1>',
  identity: { dTag: 'demo', aggregateHash: 'a'.repeat(64) },
  title: 'Cached demo',
};

test('persists a verified target and reopens it without the live resolver', async () => {
  const cacheStorage = createFakeCacheStorage();
  let liveCalls = 0;
  const first = createOfflineFirstResolver({
    cacheStorage,
    resolve: async () => {
      liveCalls += 1;
      return target;
    },
  });

  assert.deepEqual(await first.resolve(pointer), target);
  assert.equal(liveCalls, 1);

  const offline = createOfflineFirstResolver({
    cacheStorage,
    resolve: async () => { throw new Error('network should not be used'); },
  });
  assert.deepEqual(await offline.resolveOffline(pointer), target);
  assert.deepEqual(await offline.resolve(pointer), target);
});

test('prefetch stores a target for a later offline launch', async () => {
  const cacheStorage = createFakeCacheStorage();
  const resolver = createOfflineFirstResolver({ cacheStorage, resolve: async () => target });

  await resolver.prefetch(pointer);

  const offline = createOfflineFirstResolver({
    cacheStorage,
    resolve: async () => { throw new Error('network should not be used'); },
  });
  assert.deepEqual(await offline.resolveOffline(pointer), target);
});

test('ignores a corrupted cache record and reports an offline miss', async () => {
  const cacheStorage = createFakeCacheStorage();
  const resolver = createOfflineFirstResolver({ cacheStorage, resolve: async () => target });
  await resolver.prefetch(pointer);
  await cacheStorage.cache.put(
    cacheStorage.keyFor(pointer),
    new Response(JSON.stringify({ schema: 1, pointer, target: { verified: true, indexHtml: '<p>tampered</p>' } })),
  );

  await assert.rejects(
    () => resolver.resolveOffline(pointer),
    /no cached verified napplet/i,
  );
});

function createFakeCacheStorage() {
  const records = new Map();
  const cache = {
    async match(key) { return records.get(key); },
    async put(key, response) { records.set(key, response); },
  };
  const storage = {
    cache,
    keyFor(pointerValue) {
      return `https://envelope.invalid/__envelope-cache/${encodeURIComponent(pointerValue)}`;
    },
    async open() { return cache; },
  };
  return storage;
}
