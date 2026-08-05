/**
 * Hosted Nowhere's first share-link format.
 *
 * The fragment is data only. It is never used as HTML, JavaScript, or a URL
 * to navigate to without passing through a resolver-owned boundary.
 */

export const FRAGMENT_PREFIX = 'nw1.';
export const MAX_FRAGMENT_LENGTH = 8_192;
export const MAX_STATE_BYTES = 4_096;
export const MAX_POINTER_LENGTH = 512;

const NIP19_POINTER = /^(?:naddr|nevent)1[023456789acdefghjklmnpqrstuvwxyz]+$/;

/**
 * @typedef {{ version: 1, pointer: string, state?: unknown }} LaunchRequest
 */

/**
 * Encode a NIP-19 napplet pointer and JSON-compatible launch state.
 *
 * @param {{pointer: string, state?: unknown}} input
 * @returns {string} A hash beginning with `#nw1.`.
 */
export function encodeFragment({ pointer, state } = {}) {
  assertPointer(pointer);
  const payload = { v: 1, pointer };

  if (state !== undefined) {
    const stateJson = stringifyJson(state);
    if (byteLength(stateJson) > MAX_STATE_BYTES) {
      throw new Error(`launch state is too large; maximum is ${MAX_STATE_BYTES} bytes`);
    }
    payload.state = JSON.parse(stateJson);
  }

  const encoded = toBase64Url(JSON.stringify(payload));
  const fragment = `#${FRAGMENT_PREFIX}${encoded}`;
  if (fragment.length > MAX_FRAGMENT_LENGTH) {
    throw new Error(`fragment is too large; maximum is ${MAX_FRAGMENT_LENGTH} characters`);
  }
  return fragment;
}

/**
 * Decode a `#nw1.` fragment or its raw value.
 *
 * @param {string} hash
 * @returns {LaunchRequest|null}
 */
export function decodeFragment(hash = '') {
  if (typeof hash !== 'string') throw new Error('fragment must be a string');
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (raw === '') return null;
  if (raw.length > MAX_FRAGMENT_LENGTH) {
    throw new Error(`invalid fragment: maximum is ${MAX_FRAGMENT_LENGTH} characters`);
  }
  if (!raw.startsWith(FRAGMENT_PREFIX)) {
    throw new Error('unsupported fragment version');
  }

  const encoded = raw.slice(FRAGMENT_PREFIX.length);
  try {
    const decoded = JSON.parse(fromBase64Url(encoded));
    assertPayload(decoded);
    return {
      version: 1,
      pointer: decoded.pointer,
      ...(Object.hasOwn(decoded, 'state') ? { state: decoded.state } : { state: undefined }),
    };
  } catch (error) {
    if (error instanceof Error && /pointer|state|version|payload/.test(error.message)) {
      throw error;
    }
    throw new Error('invalid fragment payload');
  }
}

function assertPayload(value) {
  if (!isPlainObject(value) || value.v !== 1) {
    throw new Error('invalid fragment payload version');
  }
  assertPointer(value.pointer);
  if (Object.hasOwn(value, 'state')) {
    const stateJson = stringifyJson(value.state);
    if (byteLength(stateJson) > MAX_STATE_BYTES) {
      throw new Error(`launch state is too large; maximum is ${MAX_STATE_BYTES} bytes`);
    }
  }
}

function assertPointer(pointer) {
  if (typeof pointer !== 'string' || pointer.length === 0 || pointer.length > MAX_POINTER_LENGTH) {
    throw new Error('pointer must be a bounded naddr or nevent string');
  }
  if (!NIP19_POINTER.test(pointer)) {
    throw new Error('pointer must be an naddr or nevent NIP-19 string');
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringifyJson(value) {
  let result;
  try {
    result = JSON.stringify(value);
  } catch {
    throw new Error('launch state must be JSON-compatible');
  }
  if (result === undefined) throw new Error('launch state must be JSON-compatible');
  return result;
}

function byteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}

function toBase64Url(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) {
    throw new Error('invalid base64url');
  }
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
