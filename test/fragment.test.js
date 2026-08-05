import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_FRAGMENT_LENGTH,
  decodeFragment,
  decodeEncryptedFragment,
  encodeFragment,
  encodeEncryptedFragment,
} from '../src/fragment.js';

const pointer = 'naddr1qqxnzd3h9kummnw3e4kzmr0d3sk6t';

test('round trips a pointer and JSON state through the URL fragment', () => {
  const fragment = encodeFragment({ pointer, state: { view: 'cards', selected: 2 } });

  assert.match(fragment, /^#nw1\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeFragment(fragment), {
    version: 1,
    pointer,
    state: { view: 'cards', selected: 2 },
  });
});

test('accepts a raw hash value as well as a full URL fragment', () => {
  const fragment = encodeFragment({ pointer });

  assert.deepEqual(decodeFragment(fragment.slice(1)), {
    version: 1,
    pointer,
    state: undefined,
  });
});

test('does not treat an empty hash as a launch request', () => {
  assert.equal(decodeFragment(''), null);
  assert.equal(decodeFragment('#'), null);
});

test('rejects unsupported versions and malformed payloads', () => {
  assert.throws(() => decodeFragment('#nw2.bad'), /unsupported fragment version/i);
  assert.throws(() => decodeFragment('#nw1.not-base64!'), /invalid fragment/i);
  assert.throws(() => decodeFragment('#nw1.' + 'A'.repeat(200)), /invalid fragment/i);
});

test('rejects non-NIP-19 pointers and oversized fragments', () => {
  assert.throws(() => encodeFragment({ pointer: 'https://example.com/app' }), /naddr or nevent/i);
  assert.throws(() => encodeFragment({ pointer: 'naddr1ac', state: 'x'.repeat(10_000) }), /large/i);
  assert.ok(MAX_FRAGMENT_LENGTH < 10_000);
});

test('does not execute values that look like JSON or JavaScript', () => {
  const input = { pointer, state: { html: '<script>alert(1)</script>' } };
  const decoded = decodeFragment(encodeFragment(input));

  assert.equal(decoded.state.html, input.state.html);
});

test('round trips an encrypted launch envelope with a password', async () => {
  const fragment = await encodeEncryptedFragment({
    pointer,
    state: { private: 'not visible in the link payload' },
  }, 'correct horse battery staple');

  assert.match(fragment, /^#nwe1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(await decodeEncryptedFragment(fragment, 'correct horse battery staple'), {
    version: 1,
    pointer,
    state: { private: 'not visible in the link payload' },
  });
  assert.throws(() => decodeFragment(fragment), /encrypted|password/i);
});

test('rejects an encrypted envelope with the wrong password', async () => {
  const fragment = await encodeEncryptedFragment({ pointer, state: { secret: true } }, 'a sufficiently long password');

  await assert.rejects(
    () => decodeEncryptedFragment(fragment, 'another sufficiently long password'),
    /invalid encrypted fragment or password/i,
  );
});
