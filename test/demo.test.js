import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodeFragment } from '../src/fragment.js';
import { buildDemo } from '../scripts/build-demo.mjs';
import {
  BUILDINGS_POINTER,
  ENVELOPE_EXAMPLE_POINTER,
} from '../src/demo.js';

test('builds ten stateful QR launch links for live napplets', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'envelope-demo-'));
  const { launches } = await buildDemo({
    outputDir,
    siteUrl: 'https://envelope.example/',
  });

  assert.equal(launches.length, 10);
  assert.deepEqual(launches.slice(0, 2).map(({ nappletId }) => nappletId), [
    'buildings',
    'buildings',
  ]);
  assert.deepEqual(launches.slice(0, 2).map(({ targetPointer }) => targetPointer), [
    BUILDINGS_POINTER,
    BUILDINGS_POINTER,
  ]);
  assert.equal(launches.filter(({ nappletId }) => nappletId === 'envelope-example').length, 8);
  assert.equal(launches[2].targetPointer, ENVELOPE_EXAMPLE_POINTER);
  assert.equal(launches[2].state.message, 'Welcome to Envelope.');
  for (const launch of launches) {
    const decoded = decodeFragment(new URL(launch.url).hash);
    assert.equal(decoded.pointer, launch.targetPointer);
    assert.deepEqual(decoded.state, launch.state);
    assert.deepEqual(decoded.intent, launch.intent);
    assert.match(await readFile(join(outputDir, 'qr', `${launch.id}.svg`), 'utf8'), /^<svg[\s\S]*viewBox=/);
  }
  assert.match(await readFile(join(outputDir, 'index.html'), 'utf8'), /Envelope/);
});
