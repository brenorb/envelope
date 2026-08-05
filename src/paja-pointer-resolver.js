import { SimplePool } from 'nostr-tools/pool';
import { decode } from 'nostr-tools/nip19';
import {
  fetchBlob,
  isNappletManifestKind,
  NAPPLET_KIND_NAMED,
  NAPPLET_KINDS,
  openNappletArtifactCache,
  resolveNapplet,
} from '@kehto/nip/5d';

/** Current Paja/NIP-5D napplet manifest kinds. */
export const PAJA_NAPPLET_MANIFEST_KINDS = NAPPLET_KINDS;

/**
 * Decode the pointer types accepted by Paja's runtime-pointer mode.
 *
 * @param {string} value
 */
export function decodePajaPointer(value) {
  const trimmed = value.trim();
  const decoded = decode(trimmed);
  if (decoded.type === 'naddr') {
    return {
      type: 'naddr',
      value: trimmed,
      identifier: decoded.data.identifier,
      pubkey: decoded.data.pubkey,
      kind: decoded.data.kind,
      relays: [...(decoded.data.relays ?? [])],
    };
  }
  if (decoded.type === 'nevent') {
    return {
      type: 'nevent',
      value: trimmed,
      id: decoded.data.id,
      ...(decoded.data.author ? { author: decoded.data.author } : {}),
      ...(decoded.data.kind ? { kind: decoded.data.kind } : {}),
      relays: [...(decoded.data.relays ?? [])],
    };
  }
  throw new Error(`Expected naddr or nevent pointer, got ${decoded.type}.`);
}

/**
 * Resolve a NIP-19 pointer through Nostr relays and verify the NIP-5D
 * content-addressed artifact through Kehto's published resolver primitives.
 *
 * @param {string} value
 * @param {{pool?: object, fetcher?: Function, relays?: string[], blossomServers?: string[], maxWaitMs?: number}} [options]
 */
export async function resolvePajaPointer(value, options = {}) {
  const pointer = decodePajaPointer(value);
  const relays = uniqueRelayUrls([...pointer.relays, ...(options.relays ?? [])]);
  if (relays.length === 0) {
    throw new Error('Pointer has no relay hints or enabled configured live relays.');
  }

  const pool = options.pool ?? new SimplePool();
  const ownsPool = options.pool === undefined;
  try {
    const events = await pool.querySync(relays, pointerFilter(pointer), {
      maxWait: normalizeMaxWaitMs(options.maxWaitMs),
      label: 'hosted-nowhere-paja',
    });
    const event = events
      .filter((candidate) => matchesPointer(pointer, candidate))
      .sort((a, b) => b.created_at - a.created_at)[0];
    if (!event) {
      throw new Error(`No verified NIP-5D manifest matched the ${pointer.type} pointer.`);
    }
    if (!isNappletManifestKind(event.kind)) {
      throw new Error(`Pointer resolved kind ${event.kind}; expected ${NAPPLET_KINDS.join(', ')}.`);
    }

    const blossomServers = [...(options.blossomServers ?? [])];
    const resolved = await resolveNapplet({
      event,
      cache: await openNappletArtifactCache({ requireStorageEstimate: false }),
      fetchBlob: (sha256Hex, servers) => fetchBlob(
        [...servers, ...blossomServers],
        sha256Hex,
        async (url) => {
          const response = await (options.fetcher ?? fetch)(url);
          if (!response.ok) throw new Error(`[paja-runtime] blob ${url}: ${response.status}`);
          return new Uint8Array(await response.arrayBuffer());
        },
      ),
    });
    return {
      pointer,
      event,
      relays,
      blossomServers,
      dTag: resolved.dTag,
      aggregateHash: resolved.aggregateHash,
      indexHtml: resolved.indexHtml,
      manifest: resolved.manifest,
    };
  } finally {
    if (ownsPool) {
      pool.close?.(relays);
      pool.destroy?.();
    }
  }
}

function pointerFilter(pointer) {
  if (pointer.type === 'naddr') {
    if (pointer.kind !== NAPPLET_KIND_NAMED) {
      throw new Error(`naddr kind ${pointer.kind} is not a named NIP-5D napplet manifest kind.`);
    }
    return { kinds: [NAPPLET_KIND_NAMED], authors: [pointer.pubkey], '#d': [pointer.identifier], limit: 1 };
  }
  return {
    ids: [pointer.id],
    ...(pointer.kind ? { kinds: [pointer.kind] } : {}),
    ...(pointer.author ? { authors: [pointer.author] } : {}),
    limit: 1,
  };
}

function matchesPointer(pointer, event) {
  if (pointer.type === 'nevent') {
    return event.id === pointer.id
      && (!pointer.author || event.pubkey === pointer.author)
      && (!pointer.kind || event.kind === pointer.kind);
  }
  return event.kind === pointer.kind
    && event.pubkey === pointer.pubkey
    && event.tags.some((tag) => tag[0] === 'd' && tag[1] === pointer.identifier);
}

function uniqueRelayUrls(values) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const raw = value.trim();
    try {
      const url = new URL(raw);
      if (url.protocol !== 'wss:' && url.protocol !== 'ws:') continue;
      url.hash = '';
      url.search = '';
      const normalized = url.href.replace(/\/$/, '');
      if (!seen.has(normalized)) {
        seen.add(normalized);
        out.push(normalized);
      }
    } catch {
      // Ignore malformed relay hints; a pointer with no valid relays fails below.
    }
  }
  return out;
}

function normalizeMaxWaitMs(value) {
  if (value === undefined) return 5_000;
  if (!Number.isFinite(value) || value <= 0) throw new Error('Pointer relay deadline must be positive.');
  return Math.floor(value);
}
