// Generated-input check of src/fragment.js: every launch link Envelope can
// encode opens to the same request, and arbitrary corrupted links are refused
// with an Error instead of crashing or being misread.
// Usage: node .claude/skills/verify-envelope-fragment/check-fragment.mjs [CASES] [SEED]
import assert from 'node:assert/strict';
import {
  MAX_STATE_BYTES, decodeEncryptedFragment, decodeFragment, encodeEncryptedFragment,
  encodeFragment, validateLaunchRequest,
} from '../../../src/fragment.js';

const cases = Number(process.argv[2] ?? 3000);
let seed = Number(process.argv[3] ?? 1);
const rand = () => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed / 2 ** 31; };
const pick = (list) => list[Math.floor(rand() * list.length)];
const chars = ['a', 'Z', '0', ' ', '"', '\\', '/', 'é', 'ção', '😀', ' ', '#', '%', '.'];
const text = (n) => Array.from({ length: Math.floor(rand() * n) }, () => pick(chars)).join('');
const pointers = ['naddr1qqxnzd3h9kummnw3e4kzmr0d3sk6t', 'nevent1qqsqpzry9x8gf2tvdw0s3jn54khce6mua7l'];

function value(depth) {
  const r = rand();
  if (depth > 3 || r < 0.3) return pick([0, 1, -7, 3.5, 1e21, true, false, null, text(12)]);
  if (r < 0.6) return Array.from({ length: Math.floor(rand() * 4) }, () => value(depth + 1));
  return Object.fromEntries(Array.from({ length: Math.floor(rand() * 4) }, () => [text(6), value(depth + 1)]));
}

const failures = [];
const fail = (rule, detail) => { if (failures.length < 10) failures.push(`${rule}: ${detail}`); };
const big = (bytes) => ({ blob: 'x'.repeat(bytes) });

let encoded = 0;
for (let i = 0; i < cases; i += 1) {
  const request = { pointer: pick(pointers) };
  if (rand() < 0.9) request.state = rand() < 0.05 ? big(MAX_STATE_BYTES - 20 + Math.floor(rand() * 60)) : value(0);
  let hash;
  try { hash = encodeFragment(request); } catch { continue; }
  encoded += 1;
  // EncodedLinksOpen + RoundTrip: what encodeFragment makes, decodeFragment
  // reads back as the same pointer and state.
  try {
    const decoded = decodeFragment(hash);
    assert.deepEqual(decoded.pointer, request.pointer);
    assert.deepEqual(decoded.state, request.state === undefined ? undefined : JSON.parse(JSON.stringify(request.state)));
    validateLaunchRequest({ type: 'opener.open', version: 1, ...decoded });
  } catch (error) {
    fail('EncodedLinksOpen', `${JSON.stringify(request).slice(0, 80)} -> ${error.message}`);
  }
  // CorruptLinksRefused: a changed character is refused with an Error or
  // decodes to a request that passes validation; nothing else.
  const at = Math.floor(rand() * hash.length);
  const mutated = hash.slice(0, at) + pick(['A', '_', '-', '=', '.', '😀', '']) + hash.slice(at + 1);
  try {
    const decoded = decodeFragment(mutated);
    validateLaunchRequest({ type: 'opener.open', version: 1, ...decoded });
  } catch (error) {
    if (!(error instanceof Error)) fail('CorruptLinksRefused', `non-Error thrown for ${mutated.slice(0, 40)}`);
  }
}

// EncryptedRoundTrip: a few password-protected links open with the right
// password and are refused with a wrong one.
for (let i = 0; i < 5; i += 1) {
  const request = { pointer: pick(pointers), state: value(0) };
  const hash = await encodeEncryptedFragment(request, 'correct horse');
  const decoded = await decodeEncryptedFragment(hash, 'correct horse');
  try { assert.deepEqual(decoded.state, JSON.parse(JSON.stringify(request.state))); }
  catch { fail('EncryptedRoundTrip', JSON.stringify(request).slice(0, 80)); }
  await decodeEncryptedFragment(hash, 'wrong password!').then(
    () => fail('EncryptedRoundTrip', 'a wrong password opened the link'),
    () => {},
  );
}

console.log(`checked ${cases} generated links (${encoded} encodable), seed ${process.argv[3] ?? 1}`);
if (failures.length) { console.log(failures.join('\n')); process.exit(1); }
console.log('all fragment rules hold');
