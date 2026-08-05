import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpener } from '../src/opener.js';
import { encodeEncryptedFragment, encodeFragment } from '../src/fragment.js';

const pointer = 'naddr1qqxnzd3h9kummnw3e4kzmr0d3sk6t';
const bootstrapHtml = '<!doctype html><h1>Opener napplet</h1>';

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.listeners = new Map();
    this.attributes = new Map();
    this.textContent = '';
    this.srcdoc = '';
    this.contentWindow = {
      messages: [],
      postMessage: (message, targetOrigin) => this.contentWindow.messages.push({ message, targetOrigin }),
    };
    this.sandbox = { values: [], add: (value) => this.sandbox.values.push(value) };
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    this.children = children;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  dispatch(type) {
    this.listeners.get(type)?.({ currentTarget: this, type });
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }
}

class FakeDocument {
  createElement(tagName) {
    return new FakeElement(tagName);
  }
}

function makeWindow(hash) {
  const listeners = new Map();
  return {
    location: { hash },
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type) => listeners.delete(type),
    dispatch: (type) => listeners.get(type)?.(),
    dispatchMessage: (data, source) => listeners.get('message')?.({ data, source }),
  };
}

function makeHarness(hash, resolver = { resolve: async () => ({ verified: true, indexHtml: '<h1>Target</h1>' }) }) {
  const container = new FakeElement('main');
  const status = new FakeElement('p');
  const window = makeWindow(hash);
  const opener = createOpener({
    window,
    document: new FakeDocument(),
    container,
    status,
    resolver,
    bootstrapHtml,
  });
  return { container, status, window, opener };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('the host forwards the untouched fragment and resolves only the opener-parsed request', async () => {
  const fragment = encodeFragment({ pointer, state: { view: 'timeline' } });
  const resolved = [];
  const harness = makeHarness(fragment, {
    resolve: async (value) => {
      resolved.push(value);
      return { verified: true, indexHtml: '<h1>Target</h1>', identity: 'dtag@hash' };
    },
  });

  await harness.opener.start();
  const openerFrame = harness.container.children[0];
  assert.equal(openerFrame.srcdoc, bootstrapHtml);
  assert.deepEqual(resolved, [], 'the host must not decode or resolve the fragment');

  openerFrame.dispatch('load');
  assert.deepEqual(openerFrame.contentWindow.messages, [{
    message: { type: 'opener.fragment', version: 1, fragment },
    targetOrigin: '*',
  }]);

  harness.window.dispatchMessage({
    type: 'opener.open',
    version: 1,
    pointer,
    state: { view: 'timeline' },
  }, openerFrame.contentWindow);
  await flush();

  assert.deepEqual(resolved, [pointer]);
  const targetFrame = harness.container.children[0];
  assert.equal(targetFrame.srcdoc, '<h1>Target</h1>');
  assert.deepEqual(targetFrame.sandbox.values, ['allow-scripts']);
  targetFrame.dispatch('load');
  assert.deepEqual(targetFrame.contentWindow.messages, [{
    message: {
      type: 'opener.init',
      version: 1,
      pointer,
      state: { view: 'timeline' },
    },
    targetOrigin: '*',
  }]);
});

test('the host transports malformed fragments without parsing them', async () => {
  const fragment = '#not-a-hosted-nowhere-payload';
  const harness = makeHarness(fragment);

  await harness.opener.start();
  const openerFrame = harness.container.children[0];
  openerFrame.dispatch('load');

  assert.equal(openerFrame.srcdoc, bootstrapHtml);
  assert.equal(harness.status.attributes.get('data-state'), 'ready');
  assert.equal(openerFrame.contentWindow.messages[0].message.fragment, fragment);
});

test('the host transports encrypted fragments without requesting or receiving the password', async () => {
  const fragment = await encodeEncryptedFragment(
    { pointer, state: { view: 'private' } },
    'correct horse battery staple',
  );
  const harness = makeHarness(fragment);

  await harness.opener.start();
  const openerFrame = harness.container.children[0];
  openerFrame.dispatch('load');

  assert.equal(openerFrame.contentWindow.messages[0].message.fragment, fragment);
  assert.doesNotMatch(harness.opener.start.toString(), /password/i);
});

test('the default opener napplet opens even when the fragment is empty', async () => {
  const harness = makeHarness('#');

  await harness.opener.start();
  const openerFrame = harness.container.children[0];
  openerFrame.dispatch('load');

  assert.equal(openerFrame.srcdoc, bootstrapHtml);
  assert.equal(openerFrame.contentWindow.messages[0].message.fragment, '#');
});

test('the host answers the shell handshake once and ignores untrusted opener messages', async () => {
  const harness = makeHarness(encodeFragment({ pointer }));
  await harness.opener.start();
  const openerFrame = harness.container.children[0];

  harness.window.dispatchMessage({ type: 'shell.ready' }, {});
  harness.window.dispatchMessage({ type: 'opener.open', pointer }, {});
  harness.window.dispatchMessage({ type: 'shell.ready' }, openerFrame.contentWindow);
  harness.window.dispatchMessage({ type: 'shell.ready' }, openerFrame.contentWindow);

  assert.deepEqual(openerFrame.contentWindow.messages, [{
    message: {
      type: 'shell.init',
      capabilities: { domains: ['shell', 'opener'] },
      services: [],
    },
    targetOrigin: '*',
  }]);
  assert.equal(harness.container.children[0], openerFrame);
});

test('a stale opener request cannot replace the target selected by the current fragment', async () => {
  const nextPointer = 'nevent1qqs0d3h9kummnw3e4kzmr0d3sk6t';
  let resolveFirst;
  const resolver = {
    resolve: (value) => value === pointer
      ? new Promise((resolve) => { resolveFirst = resolve; })
      : Promise.resolve({ verified: true, indexHtml: '<h1>New</h1>', identity: 'new' }),
  };
  const harness = makeHarness(encodeFragment({ pointer }), resolver);

  await harness.opener.start();
  const firstOpenerFrame = harness.container.children[0];
  harness.window.dispatchMessage({ type: 'opener.open', pointer }, firstOpenerFrame.contentWindow);

  harness.window.location.hash = encodeFragment({ pointer: nextPointer });
  await harness.opener.load();
  const nextOpenerFrame = harness.container.children[0];
  harness.window.dispatchMessage({ type: 'opener.open', pointer: nextPointer }, nextOpenerFrame.contentWindow);
  await flush();

  resolveFirst({ verified: true, indexHtml: '<h1>Old</h1>', identity: 'old' });
  await flush();
  assert.equal(harness.container.children[0].srcdoc, '<h1>New</h1>');
});

test('the host rejects malformed opener output before invoking the resolver', async () => {
  let calls = 0;
  const harness = makeHarness(encodeFragment({ pointer }), {
    resolve: async () => { calls += 1; },
  });
  await harness.opener.start();
  const openerFrame = harness.container.children[0];

  harness.window.dispatchMessage({
    type: 'opener.open',
    version: 1,
    pointer: 'https://attacker.example/app',
  }, openerFrame.contentWindow);
  await flush();

  assert.equal(calls, 0);
  assert.equal(harness.status.attributes.get('data-state'), 'error');
});
