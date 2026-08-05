import test from 'node:test';
import assert from 'node:assert/strict';
import { computeAggregateHash } from '@kehto/nip/5a';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { naddrEncode } from 'nostr-tools/nip19';
import { bytesToHex } from '@noble/hashes/utils.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { createPajaResolver, createBrowserPajaResolver } from '../src/paja-resolver.js';
import { resolvePajaPointer } from '../src/paja-pointer-resolver.js';

const pointer = 'naddr1qqxnzd3h9kummnw3e4kzmr0d3sk6t';

test('adapts a verified Paja resolution to the opener target contract', async () => {
  const calls = [];
  const resolver = createPajaResolver(async (value) => {
    calls.push(value);
    return {
      indexHtml: '<h1>Verified</h1>',
      dTag: 'notes',
      aggregateHash: 'a'.repeat(64),
      manifest: { title: 'Notes' },
    };
  });

  assert.deepEqual(await resolver.resolve(pointer), {
    verified: true,
    indexHtml: '<h1>Verified</h1>',
    identity: { dTag: 'notes', aggregateHash: 'a'.repeat(64) },
    title: 'Notes',
  });
  assert.deepEqual(calls, [pointer]);
});

test('fails closed when the upstream resolver does not return a verified artifact', async () => {
  const resolver = createPajaResolver(async () => ({ indexHtml: '<h1>Unverified</h1>' }));

  await assert.rejects(() => resolver.resolve(pointer), /verified identity/i);
});

test('resolves and verifies a signed NIP-5D manifest and Blossom blob', async () => {
  const secretKey = generateSecretKey();
  const author = getPublicKey(secretKey);
  const indexHtml = '<!doctype html><h1>Verified napplet</h1>';
  const indexHash = bytesToHex(sha256(new TextEncoder().encode(indexHtml)));
  const pathEntries = [{ path: '/index.html', sha256: indexHash }];
  const aggregateHash = computeAggregateHash(pathEntries);
  const event = finalizeEvent({
    kind: 35129,
    content: '',
    tags: [
      ['d', 'demo'],
      ['path', '/index.html', indexHash],
      ['x', aggregateHash, 'aggregate'],
      ['server', 'https://blossom.test'],
      ['title', 'Verified demo'],
    ],
    created_at: 1,
  }, secretKey);
  const pointer = naddrEncode({ identifier: 'demo', pubkey: author, kind: 35129, relays: ['wss://relay.test'] });
  const pool = { querySync: async () => [event] };
  const fetcher = async (url) => {
    assert.equal(url, `https://blossom.test/${indexHash}`);
    return new Response(new TextEncoder().encode(indexHtml), { status: 200 });
  };

  const resolved = await resolvePajaPointer(pointer, { pool, fetcher });

  assert.equal(resolved.indexHtml, indexHtml);
  assert.equal(resolved.dTag, 'demo');
  assert.equal(resolved.aggregateHash, aggregateHash);
  assert.equal(resolved.manifest.title, 'Verified demo');
});

test('the browser Paja resolver preserves verified identity and adds a runtime CSP', async () => {
  const browserResolver = createBrowserPajaResolver({
    resolve: async () => ({
      indexHtml: '<html><head></head><body>ok</body></html>',
      dTag: 'demo',
      aggregateHash: 'b'.repeat(64),
      manifest: { title: 'Demo' },
      blossomServers: ['https://blossom.test'],
      relays: ['wss://relay.test'],
    }),
  });

  const resolved = await browserResolver.resolve(pointer);
  assert.equal(resolved.verified, true);
  assert.match(resolved.indexHtml, /Content-Security-Policy/);
  assert.deepEqual(resolved.identity, { dTag: 'demo', aggregateHash: 'b'.repeat(64) });
});
