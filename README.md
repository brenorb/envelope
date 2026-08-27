# Envelope

Envelope is a real nsite containing a customized static
[`@kehto/paja`](https://github.com/kehto/web/tree/main/packages/paja) runtime.
An opaque URL fragment selects a signed NIP-5D napplet and carries its launch
state or NAP-INTENT contract.

The currently published proof uses the legacy deployment address:

```text
https://1nywmkqmtwmbl188q8gggxw8vjp62phce9ujzga9cdgtikqd2onowhere.nsite.lol/#nw1.<opaque-data>
```

Publish the Envelope artifacts and update `config/deployment.json` before
running the live proof against the renamed release.

Run `npm run test:live` to print and verify a complete example link. The test
opens the public nsite, verifies exact state delivery, disables Chromium's
network, reloads the same URL, and verifies the exact state again.

## Three-link QR demo

`npm run build:demo` generates [`demo/index.html`](demo/index.html), three
scannable SVG QR codes, and [`demo/links.json`](demo/links.json). The codes
open the published note napplet with state, or the live Buildings napplet on a
selected floor; the complete launch data remains in the URL fragment.

DJ David Clanker is published on Nostr, but its current manifest has no
archetype contract and its app does not subscribe to NAP-INC. A stateful FLX
QR therefore cannot work yet. It needs a receiver for a documented payload
such as `{ trackId, position, deck, autoplay }`, plus an
`archetype`/`napplet:dj-david-clanker/open` manifest tag before this runtime
should generate a link for it.

## Implementation contract

All six required stages are implemented and covered by automated or live proof:

1. The URL carries a bounded `#nw1.<base64url>` fragment, or an encrypted
   `#nwe1.<salt>.<iv>.<ciphertext>` fragment.
2. The Envelope deployment uses a named `envelope` nsite (kind `35128`).
3. The nsite's files are the real Paja static runtime plus a narrow Envelope
   adapter.
4. Paja boots a separately published, signed opener napplet by its `naddr`.
5. Only the opener sees and decodes the fragment. It asks the host to install
   the pointer but retains the state locally.
6. After Paja verifies and starts the selected target, the opener invokes
   NAP-INTENT. Paja delivers the state as a runtime-attested `inc.event` after
   the target's `shell.ready` handshake.

The previous deployment's coordinates and event IDs are recorded in
[`config/deployment.json`](config/deployment.json). The canonical implementation
status is [`outputs/envelope-status/implementation-status.xlsx`](outputs/envelope-status/implementation-status.xlsx).
Its signed events are archived under [`evidence/deployment/`](evidence/deployment/)
and remain valid as historical evidence.

## Development

```bash
npm install
npm test
npm run check
npm run build:napplets
npm run build
npm run test:live
```

`npm run build` emits the static nsite to `dist/` with the deployed opener
pointer pinned in Paja's config. `npm run build:napplets` emits deterministic
opener and example-target NIP-5D artifacts under `.artifacts/napplets/`.

To deploy an update:

```bash
nsyte validate
nsyte deploy dist --prompt-sec --sync
```

The checked-in nsite is named, so deployment does not replace the signing
account's root nsite.

## What `--fallback` means

`nsyte deploy dist --fallback=/index.html` maps unknown HTTP paths back to the
SPA entry document. Envelope does not need it for launch links: URL
fragments are never sent in the HTTP request, so every `/#...` link requests
the normal `/` document. The current deployment therefore has no fallback.

## Offline boundary

The first open needs relay and Blossom access. A successful open precaches the
nsite files, verified napplet blobs, and the signed pointer events. Later
reloads can run without the gateway, relays, or Blossom; signatures,
aggregates, and blob hashes are rechecked before use. This cannot make a
target's own network-dependent application features offline.

See [`research/architecture.md`](research/architecture.md) for protocol
findings and trust boundaries, and [`docs/integration.md`](docs/integration.md)
for the release and verification workflow.
