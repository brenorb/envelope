/**
 * Envelope's first share-link format.
 *
 * The fragment is data only. It is never used as HTML, JavaScript, or a URL
 * to navigate to without passing through a resolver-owned boundary.
 */

export const FRAGMENT_PREFIX = 'nw1.';
export const ENCRYPTED_FRAGMENT_PREFIX = 'nwe1.';
export const MAX_FRAGMENT_LENGTH = 8_192;
export const MAX_STATE_BYTES = 4_096;
export const MAX_POINTER_LENGTH = 512;
const PBKDF2_ITERATIONS = 120_000;

const NIP19_POINTER = /^(?:naddr|nevent)1[023456789acdefghjklmnpqrstuvwxyz]+$/;

/**
 * @typedef {{ archetype: string, action?: string, convention: string, payload?: unknown, behavior?: {focus?: boolean, newWindow?: boolean, reuse?: boolean} }} LaunchIntent
 * @typedef {{ version: 1, pointer: string, state?: unknown, intent?: LaunchIntent }} LaunchRequest
 */

/**
 * Build the self-contained decoder used by the published opener napplet.
 * Keeping every dependency inside this factory lets the napplet artifact embed
 * the exact same decoder without importing code across its opaque iframe.
 *
 * @param {typeof globalThis} runtime
 */
export function createFragmentDecoder(runtime = globalThis) {
  const publicPrefix = 'nw1.';
  const encryptedPrefix = 'nwe1.';
  const maxFragmentLength = 8_192;
  const maxStateBytes = 4_096;
  const maxPointerLength = 512;
  const iterations = 120_000;
  const pointerPattern = /^(?:naddr|nevent)1[023456789acdefghjklmnpqrstuvwxyz]+$/;

  function decodeFragmentValue(hash = '') {
    if (typeof hash !== 'string') throw new Error('fragment must be a string');
    const raw = hash.startsWith('#') ? hash.slice(1) : hash;
    if (raw === '') return null;
    if (raw.startsWith(encryptedPrefix)) throw new Error('encrypted fragment requires a password');
    if (raw.length > maxFragmentLength) throw new Error(`invalid fragment: maximum is ${maxFragmentLength} characters`);
    if (!raw.startsWith(publicPrefix)) throw new Error('unsupported fragment version');
    try {
      const decoded = JSON.parse(decodeBase64Url(raw.slice(publicPrefix.length)));
      validatePayload(decoded);
      return {
        version: 1,
        pointer: decoded.pointer,
        ...(Object.hasOwn(decoded, 'state') ? { state: decoded.state } : { state: undefined }),
        ...(Object.hasOwn(decoded, 'intent') ? { intent: normalizeIntentValue(decoded.intent) } : {}),
      };
    } catch (error) {
      if (error instanceof Error && /pointer|state|version|payload|intent/.test(error.message)) throw error;
      throw new Error('invalid fragment payload');
    }
  }

  function isEncryptedFragmentValue(hash = '') {
    return typeof hash === 'string'
      && (hash.startsWith(`#${encryptedPrefix}`) || hash.startsWith(encryptedPrefix));
  }

  async function decodeEncryptedFragmentValue(hash, password) {
    if (typeof hash !== 'string') throw new Error('fragment must be a string');
    const raw = hash.startsWith('#') ? hash.slice(1) : hash;
    if (!raw.startsWith(encryptedPrefix)) throw new Error('not an encrypted fragment');
    if (raw.length > maxFragmentLength) throw new Error('invalid encrypted fragment');
    validatePassword(password);
    const parts = raw.slice(encryptedPrefix.length).split('.');
    if (parts.length !== 3) throw new Error('invalid encrypted fragment or password');
    try {
      const salt = decodeBase64UrlBytes(parts[0]);
      const iv = decodeBase64UrlBytes(parts[1]);
      const ciphertext = decodeBase64UrlBytes(parts[2]);
      if (salt.byteLength !== 16 || iv.byteLength !== 12 || ciphertext.byteLength < 17) {
        throw new Error('invalid encrypted fragment');
      }
      const key = await derivePasswordKey(password, salt);
      const plaintext = await getCrypto().subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
      const decoded = JSON.parse(new runtime.TextDecoder().decode(plaintext));
      validatePayload(decoded);
      return {
        version: 1,
        pointer: decoded.pointer,
        ...(Object.hasOwn(decoded, 'state') ? { state: decoded.state } : { state: undefined }),
        ...(Object.hasOwn(decoded, 'intent') ? { intent: normalizeIntentValue(decoded.intent) } : {}),
      };
    } catch {
      throw new Error('invalid encrypted fragment or password');
    }
  }

  function validatePayload(value) {
    if (!isPlainObjectValue(value) || value.v !== 1) throw new Error('invalid fragment payload version');
    validatePointer(value.pointer);
    if (Object.hasOwn(value, 'state')) {
      const stateJson = stringifyJsonValue(value.state);
      if (new runtime.TextEncoder().encode(stateJson).byteLength > maxStateBytes) {
        throw new Error(`launch state is too large; maximum is ${maxStateBytes} bytes`);
      }
    }
    if (Object.hasOwn(value, 'intent')) normalizeIntentValue(value.intent);
  }

  function normalizeIntentValue(value) {
    if (!isPlainObjectValue(value)) throw new Error('launch intent must be an object');
    const archetype = validateIntentSlug(value.archetype, 'archetype');
    const convention = value.convention;
    if (
      typeof convention !== 'string'
      || convention.length > 256
      || !/^napplet:[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/.test(convention)
    ) throw new Error('launch intent convention must be a bounded napplet convention');
    const intent = { archetype, convention };
    if (Object.hasOwn(value, 'action')) intent.action = validateIntentSlug(value.action, 'action');
    if (Object.hasOwn(value, 'payload')) intent.payload = cloneJsonValue(value.payload, 'intent payload');
    if (Object.hasOwn(value, 'behavior')) intent.behavior = normalizeIntentBehavior(value.behavior);
    const serialized = stringifyJsonValue(intent);
    if (new runtime.TextEncoder().encode(serialized).byteLength > maxStateBytes) {
      throw new Error(`launch intent is too large; maximum is ${maxStateBytes} bytes`);
    }
    return intent;
  }

  function validateIntentSlug(value, field) {
    if (typeof value !== 'string' || value.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
      throw new Error(`launch intent ${field} must be a lowercase slug`);
    }
    return value;
  }

  function normalizeIntentBehavior(value) {
    if (!isPlainObjectValue(value)) throw new Error('launch intent behavior must be an object');
    const behavior = {};
    for (const field of ['focus', 'newWindow', 'reuse']) {
      if (!Object.hasOwn(value, field)) continue;
      if (typeof value[field] !== 'boolean') throw new Error(`launch intent behavior ${field} must be boolean`);
      behavior[field] = value[field];
    }
    if (Object.keys(value).some((field) => !['focus', 'newWindow', 'reuse'].includes(field))) {
      throw new Error('launch intent behavior contains an unsupported field');
    }
    return behavior;
  }

  function cloneJsonValue(value, label) {
    const serialized = stringifyJsonValue(value);
    if (new runtime.TextEncoder().encode(serialized).byteLength > maxStateBytes) {
      throw new Error(`${label} is too large; maximum is ${maxStateBytes} bytes`);
    }
    return JSON.parse(serialized);
  }

  function validatePointer(pointer) {
    if (typeof pointer !== 'string' || pointer.length === 0 || pointer.length > maxPointerLength) {
      throw new Error('pointer must be a bounded naddr or nevent string');
    }
    if (!pointerPattern.test(pointer)) throw new Error('pointer must be an naddr or nevent NIP-19 string');
  }

  function validatePassword(password) {
    if (typeof password !== 'string' || password.length < 8) throw new Error('password must be at least 8 characters');
  }

  function getCrypto() {
    if (!runtime.crypto?.subtle) throw new Error('Web Crypto API is unavailable');
    return runtime.crypto;
  }

  async function derivePasswordKey(password, salt) {
    const webCrypto = getCrypto();
    const material = await webCrypto.subtle.importKey(
      'raw',
      new runtime.TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveKey'],
    );
    return webCrypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    );
  }

  function decodeBase64Url(value) {
    const bytes = decodeBase64UrlBytes(value);
    return new runtime.TextDecoder().decode(bytes);
  }

  function decodeBase64UrlBytes(value) {
    if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) throw new Error('invalid base64url');
    const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
    const binary = runtime.atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }

  function isPlainObjectValue(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function stringifyJsonValue(value) {
    let result;
    try {
      result = JSON.stringify(value);
    } catch {
      throw new Error('launch state must be JSON-compatible');
    }
    if (result === undefined) throw new Error('launch state must be JSON-compatible');
    return result;
  }

  return Object.freeze({
    decodeFragment: decodeFragmentValue,
    isEncryptedFragment: isEncryptedFragmentValue,
    decodeEncryptedFragment: decodeEncryptedFragmentValue,
  });
}

const fragmentDecoder = createFragmentDecoder();

/**
 * Encode a NIP-19 napplet pointer and JSON-compatible launch state.
 *
 * @param {{pointer: string, state?: unknown, intent?: LaunchIntent}} input
 * @returns {string} A hash beginning with `#nw1.`.
 */
export function encodeFragment({ pointer, state, intent } = {}) {
  assertPointer(pointer);
  const encoded = toBase64Url(JSON.stringify(createPayload(pointer, state, intent)));
  const fragment = `#${FRAGMENT_PREFIX}${encoded}`;
  if (fragment.length > MAX_FRAGMENT_LENGTH) {
    throw new Error(`fragment is too large; maximum is ${MAX_FRAGMENT_LENGTH} characters`);
  }
  return fragment;
}

/**
 * Encode a password-protected launch envelope. The password is not included
 * in the link; it must be shared out of band.
 *
 * @param {{pointer: string, state?: unknown, intent?: LaunchIntent}} input
 * @param {string} password
 * @returns {Promise<string>}
 */
export async function encodeEncryptedFragment({ pointer, state, intent } = {}, password) {
  assertPassword(password);
  const payload = new TextEncoder().encode(JSON.stringify(createPayload(pointer, state, intent)));
  const webCrypto = getWebCrypto();
  const salt = new Uint8Array(16);
  const iv = new Uint8Array(12);
  webCrypto.getRandomValues(salt);
  webCrypto.getRandomValues(iv);
  const key = await deriveKey(password, salt, ['encrypt']);
  const ciphertext = new Uint8Array(await webCrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, payload));
  const fragment = `#${ENCRYPTED_FRAGMENT_PREFIX}${toBase64UrlBytes(salt)}.${toBase64UrlBytes(iv)}.${toBase64UrlBytes(ciphertext)}`;
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
  return fragmentDecoder.decodeFragment(hash);
}

/** @param {string} hash @returns {boolean} */
export function isEncryptedFragment(hash = '') {
  return fragmentDecoder.isEncryptedFragment(hash);
}

/**
 * Decode a password-protected `#nwe1.` envelope.
 *
 * @param {string} hash
 * @param {string} password
 * @returns {Promise<LaunchRequest>}
 */
export async function decodeEncryptedFragment(hash, password) {
  return fragmentDecoder.decodeEncryptedFragment(hash, password);
}

/**
 * Validate the decoded request received from the opener trust boundary.
 * This validates data shape only; it never accepts or decodes a URL fragment.
 *
 * @param {unknown} value
 * @returns {LaunchRequest}
 */
export function validateLaunchRequest(value) {
  if (!isPlainObject(value)) throw new Error('launch request must be an object');
  assertPointer(value.pointer);
  const request = { version: 1, pointer: value.pointer };
  if (Object.hasOwn(value, 'state') && value.state !== undefined) {
    const stateJson = stringifyJson(value.state);
    if (byteLength(stateJson) > MAX_STATE_BYTES) {
      throw new Error(`launch state is too large; maximum is ${MAX_STATE_BYTES} bytes`);
    }
    request.state = JSON.parse(stateJson);
  }
  if (Object.hasOwn(value, 'intent') && value.intent !== undefined) {
    request.intent = normalizeIntent(value.intent);
  }
  return request;
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

function createPayload(pointer, state, intent) {
  assertPointer(pointer);
  const payload = { v: 1, pointer };
  if (state !== undefined) {
    const stateJson = stringifyJson(state);
    if (byteLength(stateJson) > MAX_STATE_BYTES) {
      throw new Error(`launch state is too large; maximum is ${MAX_STATE_BYTES} bytes`);
    }
    payload.state = JSON.parse(stateJson);
  }
  if (intent !== undefined) payload.intent = normalizeIntent(intent);
  return payload;
}

function normalizeIntent(value) {
  if (!isPlainObject(value)) throw new Error('launch intent must be an object');
  const archetype = assertIntentSlug(value.archetype, 'archetype');
  const convention = value.convention;
  if (
    typeof convention !== 'string'
    || convention.length > 256
    || !/^napplet:[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/.test(convention)
  ) throw new Error('launch intent convention must be a bounded napplet convention');
  const intent = { archetype, convention };
  if (Object.hasOwn(value, 'action')) intent.action = assertIntentSlug(value.action, 'action');
  if (Object.hasOwn(value, 'payload')) intent.payload = cloneJson(value.payload, 'intent payload');
  if (Object.hasOwn(value, 'behavior')) intent.behavior = normalizeIntentBehavior(value.behavior);
  if (byteLength(stringifyJson(intent)) > MAX_STATE_BYTES) {
    throw new Error(`launch intent is too large; maximum is ${MAX_STATE_BYTES} bytes`);
  }
  return intent;
}

function assertIntentSlug(value, field) {
  if (typeof value !== 'string' || value.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw new Error(`launch intent ${field} must be a lowercase slug`);
  }
  return value;
}

function normalizeIntentBehavior(value) {
  if (!isPlainObject(value)) throw new Error('launch intent behavior must be an object');
  const behavior = {};
  for (const field of ['focus', 'newWindow', 'reuse']) {
    if (!Object.hasOwn(value, field)) continue;
    if (typeof value[field] !== 'boolean') throw new Error(`launch intent behavior ${field} must be boolean`);
    behavior[field] = value[field];
  }
  if (Object.keys(value).some((field) => !['focus', 'newWindow', 'reuse'].includes(field))) {
    throw new Error('launch intent behavior contains an unsupported field');
  }
  return behavior;
}

function cloneJson(value, label) {
  const serialized = stringifyJson(value);
  if (byteLength(serialized) > MAX_STATE_BYTES) {
    throw new Error(`${label} is too large; maximum is ${MAX_STATE_BYTES} bytes`);
  }
  return JSON.parse(serialized);
}

function assertPassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('password must be at least 8 characters');
  }
}

function getWebCrypto() {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto API is unavailable');
  return globalThis.crypto;
}

async function deriveKey(password, salt, usages) {
  const webCrypto = getWebCrypto();
  const material = await webCrypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return webCrypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    usages,
  );
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

function toBase64UrlBytes(bytes) {
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

function fromBase64UrlBytes(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) throw new Error('invalid base64url');
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
