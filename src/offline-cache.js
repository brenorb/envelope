const CACHE_SCHEMA = 1;
const DEFAULT_CACHE_NAME = 'hosted-nowhere:verified-targets:v1';
const DEFAULT_CACHE_ORIGIN = 'https://hosted-nowhere.invalid';
const MAX_CACHED_HTML_BYTES = 10 * 1024 * 1024;

/**
 * Add a same-origin Cache Storage layer around a verified target resolver.
 *
 * Cache records contain only the resolver's verified target contract and a
 * SHA-256 checksum of the exact HTML that will be mounted. Cache Storage is a
 * performance/offline layer, not a substitute for the live resolver: a cache
 * miss still requires the resolver to verify the NIP-5D artifact.
 *
 * @param {{resolve: (pointer: string) => Promise<ResolvedTarget>, cacheStorage?: CacheStorageLike, cacheName?: string, baseUrl?: string}} options
 */
export function createOfflineFirstResolver({ resolve, cacheStorage = globalThis.caches, cacheName = DEFAULT_CACHE_NAME, baseUrl = defaultBaseUrl() } = {}) {
  if (typeof resolve !== 'function') throw new Error('a live target resolver is required');
  if (typeof cacheName !== 'string' || cacheName.length === 0) throw new Error('cacheName must be a non-empty string');

  let cachePromise;

  async function resolveTarget(pointer) {
    const cached = await readCachedTarget(pointer);
    if (cached) return cached;
    return loadAndCache(pointer);
  }

  async function resolveOffline(pointer) {
    const cached = await readCachedTarget(pointer);
    if (!cached) throw new Error(`no cached verified napplet for pointer: ${pointer}`);
    return cached;
  }

  async function prefetch(pointer) {
    return loadAndCache(pointer);
  }

  async function clear(pointer) {
    const cache = await openCache();
    await cache?.delete?.(cacheKey(pointer));
  }

  async function loadAndCache(pointer) {
    const target = await resolve(pointer);
    assertVerifiedTarget(target);
    try {
      const cache = await openCache();
      if (cache) await cache.put(cacheKey(pointer), new Response(await serializeRecord(pointer, target), {
        headers: { 'content-type': 'application/json' },
      }));
    } catch {
      // A private browsing context or a full quota must not prevent an online
      // launch. The live resolver has already completed verification.
    }
    return target;
  }

  async function readCachedTarget(pointer) {
    try {
      const cache = await openCache();
      const response = await cache?.match(cacheKey(pointer));
      if (!response) return undefined;
      const readable = typeof response.clone === 'function' ? response.clone() : response;
      const record = await readable.json();
      if (!await isValidRecord(record, pointer)) return undefined;
      return record.target;
    } catch {
      return undefined;
    }
  }

  async function openCache() {
    if (!cacheStorage?.open) return undefined;
    cachePromise ??= Promise.resolve(cacheStorage.open(cacheName)).catch(() => undefined);
    return cachePromise;
  }

  function cacheKey(pointer) {
    if (typeof pointer !== 'string' || pointer.length === 0) throw new Error('pointer must be a non-empty string');
    return new URL(`/__hosted-nowhere-cache/${encodeURIComponent(pointer)}`, baseUrl).toString();
  }

  return { resolve: resolveTarget, resolveOffline, prefetch, clear };
}

async function serializeRecord(pointer, target) {
  const cachedTarget = {
    verified: true,
    indexHtml: target.indexHtml,
    ...(target.identity === undefined ? {} : { identity: target.identity }),
    ...(typeof target.title === 'string' ? { title: target.title } : {}),
  };
  return JSON.stringify({
    schema: CACHE_SCHEMA,
    pointer,
    htmlSha256: await sha256Hex(cachedTarget.indexHtml),
    target: cachedTarget,
  });
}

async function isValidRecord(record, pointer) {
  if (!record || record.schema !== CACHE_SCHEMA || record.pointer !== pointer || typeof record.htmlSha256 !== 'string') return false;
  try {
    assertVerifiedTarget(record.target);
    return record.htmlSha256 === await sha256Hex(record.target.indexHtml);
  } catch {
    return false;
  }
}

function assertVerifiedTarget(target) {
  if (!target || target.verified !== true || typeof target.indexHtml !== 'string') {
    throw new Error('resolver returned unverified or malformed target bytes');
  }
  if (new TextEncoder().encode(target.indexHtml).byteLength > MAX_CACHED_HTML_BYTES) {
    throw new Error(`target HTML is too large; maximum is ${MAX_CACHED_HTML_BYTES} bytes`);
  }
}

async function sha256Hex(value) {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto API is unavailable');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function defaultBaseUrl() {
  return globalThis.location?.origin ?? DEFAULT_CACHE_ORIGIN;
}

/** @typedef {{open: (name: string) => Promise<CacheLike> | CacheLike}} CacheStorageLike */
/** @typedef {{match: (request: string) => Promise<ResponseLike | undefined> | ResponseLike | undefined, put: (request: string, response: Response) => Promise<void> | void, delete?: (request: string) => Promise<boolean> | boolean}} CacheLike */
/** @typedef {{json: () => Promise<any>, clone?: () => ResponseLike}} ResponseLike */
/** @typedef {{verified: true, indexHtml: string, identity?: unknown, title?: string}} ResolvedTarget */
