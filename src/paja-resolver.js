/**
 * Adapt Kehto/Paja's verified pointer resolver to Hosted Nowhere's narrow
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
