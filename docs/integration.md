# Integrating the real Paja runtime

The checked-in shell is intentionally static. It looks for a host-provided
`globalThis.hostedNowherePaja.resolvePointer` function and adapts that function
with `createPajaResolver`.

```js
import { resolvePajaPointer } from '@kehto/paja';

globalThis.hostedNowherePaja = {
  resolvePointer: (pointer) => resolvePajaPointer(pointer, {
    // Configure relay and Blossom policy in the host, not in the fragment.
    relays: ['wss://your-relay.example'],
    blossomServers: ['https://your-blossom.example'],
  }),
};
```

The resolver must return Paja's verified result, including `indexHtml`,
`dTag`, and `aggregateHash`. The adapter then marks the target as verified for
the opener. It must not be replaced with a fetch of arbitrary HTML from a URL
in the fragment.

## Building the nsite

Build or copy the static output (`index.html` and `src/`) into the directory
deployed by `nsyte`. The nsite manifest is only the delivery layer; the target
napplet remains a separate NIP-5D artifact resolved by Paja.

Before production deployment:

- bundle and pin the exact Paja/Kehto and `@napplet/*` versions used;
- configure the relay and Blossom allowlists in the host;
- use verified NIP-5D manifests and content-addressed blobs;
- add a Cache Storage artifact cache if repeat offline launches matter;
- choose an encrypted fragment version if state is sensitive;
- test on the actual nsite gateway and with a cold browser cache.

The shell's current `main.js` intentionally shows a clear error when no Paja
adapter is installed. That is safer than silently turning the link into an
unverified remote-HTML loader.
