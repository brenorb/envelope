/**
 * Adapt Kehto/Paja's verified pointer resolver to Envelope's narrow
 * opener contract.
 *
 * The upstream resolver is injected so this package does not copy a moving
 * draft NIP-5D implementation. In production it should be Paja's
 * `resolvePajaPointer` (or an equivalent resolver with the same guarantees).
 */

/**
 * @param {(pointer: string) => Promise<{
 *   indexHtml: string,
 *   dTag: string,
 *   aggregateHash: string,
 *   manifest?: { title?: string }
 * }>} resolvePajaPointer
 */
export function createPajaResolver(resolvePajaPointer) {
  if (typeof resolvePajaPointer !== 'function') {
    throw new Error('a Paja pointer resolver is required');
  }

  return {
    async resolve(pointer) {
      const resolved = await resolvePajaPointer(pointer);
      if (!resolved || typeof resolved.indexHtml !== 'string') {
        throw new Error('Paja resolver returned no target HTML');
      }
      if (typeof resolved.dTag !== 'string' || typeof resolved.aggregateHash !== 'string') {
        throw new Error('Paja resolver returned no verified identity');
      }
      return {
        verified: true,
        indexHtml: resolved.indexHtml,
        identity: {
          dTag: resolved.dTag,
          aggregateHash: resolved.aggregateHash,
        },
        ...(typeof resolved.manifest?.title === 'string' ? { title: resolved.manifest.title } : {}),
      };
    },
  };
}

/**
 * Create the browser resolver used by the deployable shell. If no resolver is
 * supplied, it uses the local browser-compatible Paja/NIP-5D implementation.
 *
 * @param {{resolve?: Function, relays?: string[], blossomServers?: string[], maxWaitMs?: number}} [options]
 */
export function createBrowserPajaResolver(options = {}) {
  const resolve = options.resolve ?? ((pointer) => resolvePajaPointerImpl(pointer, options));
  return createPajaResolver(async (pointer) => {
    const resolved = await resolve(pointer);
    const origins = [...(resolved.relays ?? []), ...(resolved.blossomServers ?? [])]
      .map(toOrigin)
      .filter(Boolean);
    return {
      ...resolved,
      indexHtml: injectPajaRuntimeCsp(resolved.indexHtml, origins),
    };
  });
}

/**
 * Inject the conservative CSP used for verified runtime-pointer `srcdoc`.
 * The target remains sandboxed separately by the opener host.
 */
export function injectPajaRuntimeCsp(html, origins = []) {
  const allowed = [...new Set(origins)].sort();
  const connectSrc = allowed.length > 0 ? `connect-src ${allowed.join(' ')}` : "connect-src 'none'";
  const value = [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    'img-src data: blob:',
    'font-src data:',
    connectSrc,
    "worker-src 'none'",
    "child-src 'none'",
    "frame-src 'none'",
    "media-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'self'",
  ].join('; ');
  const meta = `<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(value)}">`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (open) => `${open}${meta}`);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (open) => `${open}<head>${meta}</head>`);
  return `${meta}${html}`;
}

function toOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

function escapeAttribute(value) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}
import { resolvePajaPointer as resolvePajaPointerImpl } from './paja-pointer-resolver.js';
