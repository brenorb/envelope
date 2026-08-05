# Integrating the real Paja runtime

The checked-in shell is static and bundles a browser-compatible NIP-5D
resolver. It also uses Kehto's official shell bridge for the NAP-SHELL
handshake. A host can override pointer resolution with
`globalThis.hostedNowherePaja.resolvePointer`, but that is optional.

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

For a normal build, configure relay and Blossom hints before `main.js` runs:

```html
<script>
  globalThis.hostedNowhereConfig = {
    relays: ['wss://your-relay.example'],
    blossomServers: ['https://your-blossom.example'],
    domains: ['shell']
  };
</script>
```

The resolver must return Paja's verified result, including `indexHtml`,
`dTag`, and `aggregateHash`. The adapter then marks the target as verified for
the opener. It must not be replaced with a fetch of arbitrary HTML from a URL
in the fragment.

## Building the nsite

Build the static output with `npm run build`, then deploy `dist/` with `nsyte`.
For SPA fallback behavior, use the nsyte fallback option:

```bash
nsyte deploy dist --fallback=/index.html
```

The nsite manifest is only the delivery layer; the target napplet remains a
separate NIP-5D artifact resolved by Paja primitives.

Before production deployment:

- bundle and pin the exact Paja/Kehto and `@napplet/*` versions used;
- configure the relay and Blossom allowlists in the host;
- use verified NIP-5D manifests and content-addressed blobs;
- add a Cache Storage artifact cache if repeat offline launches matter;
- choose an encrypted fragment version if state is sensitive;
- test on the actual nsite gateway and with a cold browser cache.

The current official bridge advertises only `shell` by default. Relay,
identity, intent, and other NAP services must be wired to real host backends
before adding those domains to `hostedNowhereConfig.domains`; the runtime never
advertises a capability merely because a target requests it.
