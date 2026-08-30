import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_OPENER_HTML, createOpenerNappletController } from '../src/opener-napplet.js';

const pointer = 'naddr1qqxnzd3h9kummnw3e4kzmr0d3sk6t';

function makeHarness(decodedRequest, invokeResult = { ok: true, handled: true }) {
  const messages = [];
  const invocations = [];
  const emissions = [];
  const listeners = new Map();
  const elements = {
    '#status': { textContent: '', dataset: {} },
    '#unlock': {
      hidden: true,
      addEventListener(type, listener) { this.listener = { type, listener }; },
    },
    '#password': { value: '', focus() {}, select() {} },
  };
  const parent = { postMessage: (message) => messages.push(message) };
  const runtime = {
    parent,
    document: { querySelector: (selector) => elements[selector] },
    addEventListener: (type, listener) => listeners.set(type, listener),
    napplet: {
      inc: {
        emit: (topic, payload) => emissions.push({ topic, payload }),
      },
      intent: {
        invoke: async (request) => {
          invocations.push(request);
          return invokeResult;
        },
      },
    },
  };
  const codec = {
    decodeFragment: () => decodedRequest,
    isEncryptedFragment: () => false,
    decodeEncryptedFragment: async () => decodedRequest,
  };
  const controller = createOpenerNappletController(runtime, codec);
  controller.start();

  const dispatch = (data, source = parent) => listeners.get('message')?.({ data, source });
  return { controller, dispatch, elements, invocations, emissions, messages, parent };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('emits a self-contained opener artifact with syntactically valid JavaScript', () => {
  const script = DEFAULT_OPENER_HTML.match(/<script>([\s\S]+)<\/script>/)?.[1];

  assert.equal(typeof script, 'string');
  assert.doesNotThrow(() => new Function(script));
  assert.doesNotMatch(DEFAULT_OPENER_HTML, /src=["']/);
});

test('asks the host to install the pointer, then invokes its verified intent contract', async () => {
  const state = { view: 'timeline', selected: 2 };
  const harness = makeHarness({ version: 1, pointer, state });

  harness.dispatch({ type: 'shell.init' });
  harness.dispatch({ type: 'opener.fragment', version: 1, fragment: '#opaque' });
  const open = harness.messages.find((message) => message.type === 'opener.open');

  assert.equal(typeof open.requestId, 'string');
  assert.equal(open.pointer, pointer);
  assert.deepEqual(harness.invocations, []);

  harness.dispatch({
    type: 'opener.target.ready',
    version: 1,
    requestId: open.requestId,
    pointer,
    contracts: [{ archetype: 'envelope', convention: 'napplet:envelope/open' }],
  });
  await flush();

  assert.deepEqual(harness.invocations, [{
    archetype: 'envelope',
    action: 'open',
    convention: 'napplet:envelope/open',
    payload: state,
  }]);
  assert.equal(harness.elements['#status'].dataset.state, 'ready');
});

test('uses explicit link intent and ignores stale target-ready messages', async () => {
  const intent = {
    archetype: 'cashu-wallet',
    action: 'pay',
    convention: 'napplet:cashu-wallet/pay',
    payload: { invoice: 'cashuA...' },
    behavior: { focus: true },
  };
  const harness = makeHarness({ version: 1, pointer, intent });

  harness.dispatch({ type: 'shell.init' });
  harness.dispatch({ type: 'opener.fragment', version: 1, fragment: '#opaque' });
  const open = harness.messages.find((message) => message.type === 'opener.open');

  harness.dispatch({
    type: 'opener.target.ready',
    version: 1,
    requestId: 'stale-request',
    pointer,
    contracts: [{ archetype: 'cashu-wallet', convention: 'napplet:cashu-wallet/pay' }],
  });
  harness.dispatch({
    type: 'opener.target.ready',
    version: 1,
    requestId: open.requestId,
    pointer,
    contracts: [{ archetype: 'cashu-wallet', convention: 'napplet:cashu-wallet/pay' }],
  });
  await flush();

  assert.deepEqual(harness.invocations, [intent]);
});

test('falls back to the target convention through NAP-INC when intent is declined', async () => {
  const state = { relay: 'wss://relay.example', group: 'madeira' };
  const harness = makeHarness({
    version: 1,
    pointer,
    state,
    intent: { archetype: 'nip29-group', action: 'open', convention: 'napplet:nip29-group/open' },
  }, { ok: true, handled: false, error: 'no handler' });

  harness.dispatch({ type: 'shell.init' });
  harness.dispatch({ type: 'opener.fragment', version: 1, fragment: '#opaque' });
  const open = harness.messages.find((message) => message.type === 'opener.open');
  harness.dispatch({
    type: 'opener.target.ready',
    version: 1,
    requestId: open.requestId,
    pointer,
    contracts: [{ archetype: 'nip29-group', convention: 'napplet:nip29-group/open' }],
  });
  await flush();

  assert.deepEqual(harness.emissions, [{
    topic: 'napplet:nip29-group/open',
    payload: state,
  }]);
  assert.equal(harness.elements['#status'].dataset.state, 'ready');
});

test('refuses an explicit intent not advertised by the verified target manifest', async () => {
  const harness = makeHarness({
    version: 1,
    pointer,
    intent: { archetype: 'note', convention: 'napplet:note/open' },
  });

  harness.dispatch({ type: 'shell.init' });
  harness.dispatch({ type: 'opener.fragment', version: 1, fragment: '#opaque' });
  const open = harness.messages.find((message) => message.type === 'opener.open');
  harness.dispatch({
    type: 'opener.target.ready',
    version: 1,
    requestId: open.requestId,
    pointer,
    contracts: [{ archetype: 'profile', convention: 'napplet:profile/open' }],
  });
  await flush();

  assert.deepEqual(harness.invocations, []);
  assert.equal(harness.elements['#status'].dataset.state, 'error');
});
