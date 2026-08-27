import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { nip19, verifyEvent } from 'nostr-tools';

const root = resolve(import.meta.dirname, '..');

async function json(path) {
  return JSON.parse(await readFile(resolve(root, path), 'utf8'));
}

function assertPointerMatches(pointer, event) {
  const decoded = nip19.decode(pointer);
  assert.equal(decoded.type, 'naddr');
  assert.equal(decoded.data.kind, event.kind);
  assert.equal(decoded.data.pubkey, event.pubkey);
  assert.equal(decoded.data.identifier, event.tags.find((tag) => tag[0] === 'd')?.[1]);
}

test('archived signed deployment events remain valid after the local rename', async () => {
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
});
