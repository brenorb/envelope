import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { encodeFragment } from '../src/fragment.js';

const baseUrl = process.env.ENVELOPE_URL ?? 'http://127.0.0.1:4173';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});

try {
  const page = await browser.newPage();
  await page.addInitScript(() => {
    globalThis.envelopePaja = {
      resolvePointer: async () => {
        if (sessionStorage.getItem('envelope-disable-live') === '1') {
          throw new Error('live resolver intentionally disabled');
        }
        return {
          indexHtml: `<!doctype html>
            <html><head></head><body>
              <h1 id="target">Resolved target</h1>
              <script>
                addEventListener('message', (event) => {
                  if (event.data?.type === 'opener.init') {
                    document.body.dataset.state = JSON.stringify(event.data.state);
                  }
                });
              <\/script>
            </body></html>`,
          dTag: 'demo',
          aggregateHash: 'a'.repeat(64),
          manifest: { title: 'Demo' },
          relays: [],
          blossomServers: [],
        };
      },
    };
  });

  const pointer = 'naddr1qqxnzd3h9kummnw3e4kzmr0d3sk6t';
  const url = `${baseUrl}/${encodeFragment({ pointer, state: { view: 'timeline' } })}`;
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('#status')?.textContent === 'Target is ready.');

  const frameHandle = await page.locator('iframe').elementHandle();
  assert.ok(frameHandle, 'target iframe should be mounted');
  const frame = await frameHandle.contentFrame();
  assert.ok(frame, 'target iframe should have a document');
  assert.equal(await page.locator('iframe').getAttribute('sandbox'), 'allow-scripts');
  assert.equal(await frame.locator('#target').textContent(), 'Resolved target');
  assert.equal(await frame.evaluate(() => document.body.dataset.state), '{"view":"timeline"}');
  assert.ok(await frame.locator('meta[http-equiv="Content-Security-Policy"]').count());
  assert.equal(await page.evaluate(() => typeof globalThis.envelopeOffline?.prefetch), 'function');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));

  const replayHash = encodeFragment({ pointer, state: { view: 'offline-replay' } });
  await page.evaluate((hash) => {
    sessionStorage.setItem('envelope-disable-live', '1');
    window.location.hash = hash.slice(1);
  }, replayHash);
  await page.waitForFunction(() => document.querySelector('#status')?.textContent === 'Target is ready.');
  await page.frameLocator('iframe').locator('#target').waitFor();
  assert.equal(
    await page.frameLocator('iframe').locator('body').getAttribute('data-state'),
    '{"view":"offline-replay"}',
  );

  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.context().setOffline(true);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#status')?.textContent === 'Target is ready.');
  await page.frameLocator('iframe').locator('#target').waitFor();
  assert.equal(
    await page.frameLocator('iframe').locator('body').getAttribute('data-state'),
    '{"view":"offline-replay"}',
  );

  console.log('browser smoke: opener -> verified target -> state delivery -> offline shell replay passed');
} finally {
  await browser.close();
}
