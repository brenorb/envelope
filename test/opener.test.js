import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpener } from '../src/opener.js';
import { encodeFragment } from '../src/fragment.js';

const pointer = 'naddr1qqxnzd3h9kummnw3e4kzmr0d3sk6t';

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
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('loads resolved HTML in an opaque sandbox and delivers state after load', async () => {
  const container = new FakeElement('main');
  const status = new FakeElement('p');
  const window = makeWindow(encodeFragment({ pointer, state: { view: 'timeline' } }));
  const opener = createOpener({
    window,
    document: new FakeDocument(),
    container,
    status,
    resolver: { resolve: async () => ({ verified: true, indexHtml: '<!doctype html><h1>Target</h1>', identity: 'dtag@hash' }) },
  });

  await opener.start();
  assert.equal(container.children.length, 1);
  const iframe = container.children[0];
  assert.deepEqual(iframe.sandbox.values, ['allow-scripts']);
  assert.equal(iframe.attributes.get('sandbox'), 'allow-scripts');
  assert.equal(iframe.srcdoc, '<!doctype html><h1>Target</h1>');
  assert.equal(status.textContent, 'Target is ready.');

  iframe.dispatch('load');
  assert.deepEqual(iframe.contentWindow.messages, [{
    message: {
      type: 'opener.init',
      version: 1,
      pointer,
      state: { view: 'timeline' },
    },
    targetOrigin: '*',
  }]);
});

test('shows an explicit error and never mounts unverified resolver output', async () => {
  const container = new FakeElement('main');
  const status = new FakeElement('p');
  const window = makeWindow(encodeFragment({ pointer }));
  const opener = createOpener({
    window,
    document: new FakeDocument(),
    container,
    status,
    resolver: { resolve: async () => ({ indexHtml: '<script>bad()</script>' }) },
  });

  await opener.start();
  assert.equal(container.children.length, 0);
  assert.match(status.textContent, /could not open/i);
  assert.equal(status.attributes.get('data-state'), 'error');
});

test('ignores a stale resolver result after the hash changes', async () => {
  const container = new FakeElement('main');
  const status = new FakeElement('p');
  const nextPointer = 'nevent1qqs0d3h9kummnw3e4kzmr0d3sk6t';
  const first = encodeFragment({ pointer, state: { page: 'old' } });
  const second = encodeFragment({ pointer: nextPointer, state: { page: 'new' } });
  const window = makeWindow(first);
  let resolveFirst;
  const resolver = {
    resolve: (value) => value === pointer
      ? new Promise((resolve) => { resolveFirst = resolve; })
      : Promise.resolve({ verified: true, indexHtml: '<h1>New</h1>', identity: 'new' }),
  };
  const opener = createOpener({ window, document: new FakeDocument(), container, status, resolver });

  const firstLoad = opener.start();
  window.location.hash = second;
  await opener.load();
  resolveFirst({ verified: true, indexHtml: '<h1>Old</h1>', identity: 'old' });
  await firstLoad;
  await flush();

  assert.equal(container.children[0].srcdoc, '<h1>New</h1>');
});

test('empty links render the opener landing state without resolving', async () => {
  const container = new FakeElement('main');
  const status = new FakeElement('p');
  let calls = 0;
  const window = makeWindow('#');
  const opener = createOpener({
    window,
    document: new FakeDocument(),
    container,
    status,
    resolver: { resolve: async () => { calls += 1; } },
  });

  await opener.start();
  assert.equal(calls, 0);
  assert.equal(container.children.length, 0);
  assert.match(status.textContent, /choose a napplet/i);
});
