import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { encodeFragment } from '../src/fragment.js';

const deployment = JSON.parse(await readFile(resolve('config/deployment.json'), 'utf8'));
const expectedState = {
  message: 'Hosted Nowhere works',
  view: 'proof',
  count: 21,
};
const launchUrl = `${deployment.siteUrl}${encodeFragment({
  pointer: deployment.exampleTargetPointer,
  state: expectedState,
})}`;
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});
const totalTimeout = setTimeout(() => {
  process.stderr.write('live e2e: exceeded 150 second total timeout\n');
  process.exitCode = 1;
  void browser.close();
}, 150_000);

function progress(message) {
  process.stderr.write(`live e2e: ${message}\n`);
}

async function waitForTarget(page) {
  await page.waitForFunction(
    (pointer) => window.__KEHTO_PAJA__?.tabs?.some(
      (tab) => tab.pointerValue === pointer && tab.status === 'ready',
    ),
    deployment.exampleTargetPointer,
    { timeout: 45_000 },
  );
  const target = page.frameLocator('iframe[title="Napplet runtime target: Hosted Nowhere example target"]');
  await target.locator('#launch-state').waitFor({ timeout: 15_000 });
  await assertExactState(target);
}

async function assertExactState(target) {
  const rendered = await target.locator('#launch-state').textContent();
  const retained = await target.locator('body').evaluate(() => globalThis.__HOSTED_NOWHERE_TARGET_STATE__);
  assert.deepEqual(JSON.parse(rendered), expectedState);
  assert.deepEqual(retained, expectedState);
}

try {
  progress('creating isolated browser context');
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', (error) => progress(`page error: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') progress(`console error: ${message.text()}`);
  });
  progress('loading public nsite link');
  await page.goto(launchUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  progress('waiting for online target intent');
  await waitForTarget(page);
  progress('online target received exact state');
  assert.equal(await page.evaluate(() => window.__KEHTO_PAJA__.config.target.mode), 'runtime-pointer');
  assert.equal(
    await page.evaluate(() => window.__KEHTO_PAJA__.config.target.pointer.value),
    deployment.openerPointer,
  );

  progress('waiting for service worker');
  await page.evaluate(() => Promise.race([
    navigator.serviceWorker.ready.then(() => true),
    new Promise((_, reject) => setTimeout(() => reject(new Error('service worker did not become ready')), 20_000)),
  ]));
  if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) {
    progress('reloading once to obtain service-worker control');
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 45_000 });
    await waitForTarget(page);
  }
  assert.equal(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), true);

  progress('disabling browser network and reloading');
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 45_000 });
  await waitForTarget(page);
  progress('offline target received exact state');

  process.stdout.write(`${JSON.stringify({
    launchUrl,
    online: 'passed',
    offlineReload: 'passed',
    state: expectedState,
  }, null, 2)}\n`);
} finally {
  clearTimeout(totalTimeout);
  await browser.close();
}
