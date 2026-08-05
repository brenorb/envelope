import test from 'node:test';
import assert from 'node:assert/strict';
import { createPajaResolver } from '../src/paja-resolver.js';

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
