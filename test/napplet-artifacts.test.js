import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseNappletManifest } from '@kehto/nip/5d';
import { buildNapplets } from '../scripts/build-napplets.mjs';
import { createExampleTargetController, EXAMPLE_TARGET_HTML } from '../src/example-target-napplet.js';

test('builds canonical opener and target NIP-5D release blueprints', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'napplet-nowhere-artifacts-'));
  const { releases } = await buildNapplets(outputDir);

  const opener = parseNappletManifest({ kind: 35_129, tags: releases.opener.tags });
  const target = parseNappletManifest({ kind: 35_129, tags: releases['example-target'].tags });
  const openerHtml = await readFile(join(outputDir, 'opener/index.html'), 'utf8');
  const targetHtml = await readFile(join(outputDir, 'example-target/index.html'), 'utf8');

  assert.equal(opener.dTag, 'hosted-nowhere-opener');
  assert.deepEqual(opener.requires, ['intent']);
  assert.deepEqual(opener.archetypes, []);
  assert.equal(target.dTag, 'hosted-nowhere-example');
  assert.deepEqual(target.requires, ['inc']);
  assert.deepEqual(target.archetypes, [{
    slug: 'hosted-nowhere',
    convention: 'napplet:hosted-nowhere/open',
  }]);
  assert.match(openerHtml, /opener\.target\.ready/);
  assert.match(targetHtml, /napplet:hosted-nowhere\/open/);
  assert.match(releases.opener.sha256, /^[a-f0-9]{64}$/);
  assert.match(releases['example-target'].aggregateHash, /^[a-f0-9]{64}$/);
});

test('the example target renders the exact NAP-INC payload', () => {
  let onIntent;
  const output = { textContent: '' };
  const status = { textContent: '', dataset: {} };
  const runtime = {
    document: { querySelector: (selector) => selector === '#launch-state' ? output : status },
    napplet: { inc: { on: (topic, listener) => { onIntent = { topic, listener }; } } },
  };

  createExampleTargetController(runtime).start();
  const state = { view: 'proof', nested: { exact: true }, count: 21 };
  onIntent.listener({ topic: onIntent.topic, sender: 'hosted-nowhere-opener', payload: state });

  assert.equal(onIntent.topic, 'napplet:hosted-nowhere/open');
  assert.equal(output.textContent, JSON.stringify(state, null, 2));
  assert.deepEqual(runtime.__HOSTED_NOWHERE_TARGET_STATE__, state);
  assert.equal(status.dataset.state, 'ready');
  const script = EXAMPLE_TARGET_HTML.match(/<script>([\s\S]+)<\/script>/)?.[1];
  assert.doesNotThrow(() => new Function(script));
});
