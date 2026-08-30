import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPajaRuntime } from '../scripts/build-paja-runtime.mjs';

const openerPointer =
  'naddr1qvzqqqyf8ypzqyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3qy28wumn8ghj7un9d3shjtnyv9kh2uewd9hsq9tgdaehgety94hx7amgv4ex2tt0wpjkuetjz7nr0g';

test('builds the real static Paja runtime with the opener pinned as its boot target', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'envelope-paja-'));

  const result = await buildPajaRuntime({
    outputDir,
    openerPointer,
    builtAt: new Date('2026-08-06T00:00:00.000Z'),
  });

  const indexHtml = await readFile(join(outputDir, 'index.html'), 'utf8');
  const config = JSON.parse(await readFile(join(outputDir, '__kehto/config.json'), 'utf8'));
  const pajaHost = await readFile(join(outputDir, '__kehto/browser-host.js'), 'utf8');
  const envelopeHost = await readFile(join(outputDir, '__kehto/envelope-host.js'), 'utf8');
  const serviceWorker = await readFile(join(outputDir, 'sw.js'), 'utf8');

  assert.deepEqual(result, {
    outputDir,
    openerPointer,
    mode: 'runtime-pointer',
  });
  assert.equal(config.target.mode, 'runtime-pointer');
  assert.equal(config.target.pointer.value, openerPointer);
  assert.match(indexHtml, /id="kehto-paja-config"/);
  assert.match(indexHtml, /\.\/__kehto\/browser-host\.js/);
  assert.match(indexHtml, /\.\/__kehto\/envelope-host\.js/);
  assert.match(indexHtml, /navigator\.serviceWorker\.register\('\.\/sw\.js'\)/);
  assert.ok((await stat(join(outputDir, '__kehto/browser-host.js'))).size > 100_000);
  assert.match(pajaHost, /intent\.invoke/);
  assert.match(pajaHost, /resolvePajaPointer/);
  assert.match(pajaHost, /envelope:paja:pointer-events:v1/);
  assert.match(pajaHost, /navigator\.onLine/);
  assert.match(pajaHost, /resolveNapplet/);
  assert.match(pajaHost, /normalizeEnvelopeResourceUrl/);
  assert.match(pajaHost, /blossom\.primal\.net/);
  assert.match(envelopeHost, /window\.location\.hash/);
  assert.match(envelopeHost, /opener\.fragment/);
  assert.doesNotMatch(envelopeHost, /decodeFragment|decodeEncryptedFragment/);
  assert.match(serviceWorker, /__kehto\/browser-host\.js/);
  assert.match(serviceWorker, /__kehto\/config\.json/);
  assert.match(serviceWorker, /__kehto\/envelope-host\.js/);
});

test('refuses to build a runtime without a NIP-19 opener pointer', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'envelope-paja-invalid-'));

  await assert.rejects(
    () => buildPajaRuntime({ outputDir, openerPointer: 'https://example.com/opener' }),
    /opener pointer.*naddr or nevent/i,
  );
});
