import test from 'node:test';
import assert from 'node:assert/strict';
import { installEnvelopeHost } from '../src/paja-envelope-host.js';

const openerPointer = 'naddr1qqxnzd3h9kummnw3e4kzmr0d3sk6t';
const targetPointer = 'nevent1qqs0d3h9kummnw3e4kzmr0d3sk6t';

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('authenticates the opener and exposes only verified target intent contracts', async () => {
  const listeners = new Map();
  const openerMessages = [];
  const openerWindow = { postMessage: (message) => openerMessages.push(message) };
  const targetWindow = { postMessage() {} };
  const openerTab = {
    pointerValue: openerPointer,
    status: 'ready',
    frame: { contentWindow: openerWindow },
  };
  const targetTab = {
    pointerValue: targetPointer,
    status: 'ready',
    frame: { contentWindow: targetWindow },
    resolvedTarget: {
      dTag: 'cashu-wallet',
      aggregateHash: 'a'.repeat(64),
      manifest: {
        archetypes: [{ slug: 'cashu-wallet', convention: 'napplet:cashu-wallet/open' }],
      },
    },
  };
  const paja = {
    tabs: [openerTab],
    async loadPointer(pointer) {
      assert.equal(pointer, targetPointer);
      this.tabs.push(targetTab);
    },
  };
  let reloads = 0;
  const fakeWindow = {
    __KEHTO_PAJA__: paja,
    location: { hash: '#opaque-link-state', reload: () => { reloads += 1; } },
    addEventListener: (type, listener) => listeners.set(type, listener),
    setTimeout,
  };
  const fakeDocument = {
    getElementById: () => ({
      textContent: JSON.stringify({ target: { pointer: { value: openerPointer } } }),
    }),
  };
  globalThis.window = fakeWindow;
  globalThis.document = fakeDocument;

  try {
    await installEnvelopeHost();
    assert.deepEqual(openerMessages, [{
      type: 'opener.fragment',
      version: 1,
      fragment: '#opaque-link-state',
    }]);

    listeners.get('message')({
      source: {},
      data: { type: 'opener.open', version: 1, requestId: 'forged', pointer: targetPointer },
    });
    listeners.get('message')({
      source: openerWindow,
      data: { type: 'opener.open', version: 1, requestId: 'launch-1', pointer: targetPointer },
    });
    await flush();

    assert.deepEqual(openerMessages.at(-1), {
      type: 'opener.target.ready',
      version: 1,
      requestId: 'launch-1',
      pointer: targetPointer,
      contracts: [{ archetype: 'cashu-wallet', convention: 'napplet:cashu-wallet/open' }],
    });
    assert.equal(paja.tabs.length, 2, 'the forged request must not load a target');

    listeners.get('hashchange')();
    assert.equal(reloads, 1, 'a new fragment must reset the in-memory intent catalog');
  } finally {
    delete globalThis.window;
    delete globalThis.document;
  }
});
