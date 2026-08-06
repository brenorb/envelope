import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { nip19, verifyEvent } from 'nostr-tools';
import { buildPajaRuntime } from '../scripts/build-paja-runtime.mjs';
import { buildNapplets } from '../scripts/build-napplets.mjs';

const root = resolve(import.meta.dirname, '..');

async function json(path) {
  return JSON.parse(await readFile(resolve(root, path), 'utf8'));
}

function pathHashes(event) {
  return new Map(event.tags.filter((tag) => tag[0] === 'path').map((tag) => [tag[1], tag[2]]));
}

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

function assertPointerMatches(pointer, event) {
  const decoded = nip19.decode(pointer);
  assert.equal(decoded.type, 'naddr');
  assert.equal(decoded.data.kind, event.kind);
  assert.equal(decoded.data.pubkey, event.pubkey);
  assert.equal(decoded.data.identifier, event.tags.find((tag) => tag[0] === 'd')?.[1]);
}

test('archived signed deployment events match reproducibly built bytes', async () => {
  const deployment = await json('config/deployment.json');
  const siteEvent = await json('evidence/deployment/site-event.json');
  const openerEvent = await json('evidence/deployment/opener-event.json');
  const targetEvent = await json('evidence/deployment/example-target-event.json');

  for (const event of [siteEvent, openerEvent, targetEvent]) assert.equal(verifyEvent(event), true);
  assert.equal(siteEvent.id, deployment.siteEventId);
  assert.equal(openerEvent.id, deployment.openerEventId);
  assert.equal(targetEvent.id, deployment.exampleTargetEventId);
  assertPointerMatches(deployment.siteNaddr, siteEvent);
  assertPointerMatches(deployment.openerPointer, openerEvent);
  assertPointerMatches(deployment.exampleTargetPointer, targetEvent);

  const runtimeDir = await mkdtemp(join(tmpdir(), 'napplet-nowhere-deployment-runtime-'));
  await buildPajaRuntime({
    outputDir: runtimeDir,
    openerPointer: deployment.openerPointer,
    builtAt: new Date(deployment.runtimeBuiltAt),
  });
  for (const [path, expected] of pathHashes(siteEvent)) {
    assert.equal(await sha256(resolve(runtimeDir, path.slice(1))), expected, path);
  }

  const nappletDir = await mkdtemp(join(tmpdir(), 'napplet-nowhere-deployment-napplets-'));
  await buildNapplets(nappletDir);
  assert.equal(await sha256(resolve(nappletDir, 'opener/index.html')), pathHashes(openerEvent).get('/index.html'));
  assert.equal(await sha256(resolve(nappletDir, 'example-target/index.html')), pathHashes(targetEvent).get('/index.html'));
});
