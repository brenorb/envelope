import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodeFragment } from '../src/fragment.js';
import { buildDemo } from '../scripts/build-demo.mjs';

const pointer = 'naddr1qqxnzd3h9kummnw3e4kzmr0d3sk6t';

test('builds three stateful QR launch links for live napplets', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'envelope-demo-'));
  const { launches } = await buildDemo({
    outputDir,
    siteUrl: 'https://envelope.example/',
    pointer,
  });

  assert.equal(launches.length, 3);
  assert.deepEqual(launches.map(({ nappletId }) => nappletId), [
    'envelope-example',
    'buildings',
    'buildings',
  ]);
  for (const launch of launches) {
    const decoded = decodeFragment(new URL(launch.url).hash);
    assert.equal(decoded.pointer, launch.targetPointer);
    assert.deepEqual(decoded.state, launch.state);
    assert.deepEqual(decoded.intent, launch.intent);
    assert.match(await readFile(join(outputDir, 'qr', `${launch.id}.svg`), 'utf8'), /^<svg[\s\S]*viewBox=/);
  }
  assert.match(await readFile(join(outputDir, 'index.html'), 'utf8'), /Envelope/);
});
