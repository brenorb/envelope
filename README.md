# Envelope

Envelope is a real nsite containing a customized static
[`@kehto/paja`](https://github.com/kehto/web/tree/main/packages/paja) runtime.
An opaque URL fragment selects a signed NIP-5D napplet and carries its launch
state or NAP-INTENT contract.

The current Envelope deployment is:

```text
https://1nywmkqmtwmbl188q8gggxw8vjp62phce9ujzga9cdgtikqd2oenvelope.nsite.lol/#nw1.<opaque-data>
```

The host is named `envelope`; nsite.lol prefixes the name with the publishing
account's vanity key. The opener pointer remains the separately published
opener artifact recorded in `config/deployment.json`.

Run `npm run test:live` to print and verify a complete example link. The test
opens the public nsite, verifies exact state delivery, disables Chromium's
network, reloads the same URL, and verifies the exact state again.

## Twenty-link QR demo

`npm run build:demo` generates [`demo/index.html`](demo/index.html), ten
scannable SVG QR codes, and [`demo/links.json`](demo/links.json). The set uses
two published napplets with explicit incoming archetype/intent contracts:

- Buildings, with two floor states.
- Envelope's message target, with eight restored message examples.

The complete launch data remains in each URL fragment. The previous message
codes were not lost as a napplet: they target the published `Envelope example
target` recorded as `exampleTargetPointer` in
[`config/deployment.json`](config/deployment.json). The old QR files were
replaced when the demo was regenerated; the eight `message-*` codes restore them
in the current demo.

Envelope also adapts the Paja resource proxy for the
`blossom:sha256:<hash>` URLs emitted by Mapplets and Mappy, resolving them
through the published Blossom server before the target app receives the bytes.

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
2. The intended Envelope deployment uses a named `envelope` nsite (kind `35128`).
3. The nsite's files are the real Paja static runtime plus a narrow Envelope
   adapter.
4. Paja boots a separately published, signed opener napplet by its `naddr`.
5. Only the opener sees and decodes the fragment. It asks the host to install
   the pointer but retains the state locally.
6. After Paja verifies and starts the selected target, the opener invokes
   NAP-INTENT. Paja delivers the state as a runtime-attested `inc.event` after
   the target's `shell.ready` handshake.

The checked-in public proof is the Envelope deployment; its coordinates and
event IDs are recorded in [`config/deployment.json`](config/deployment.json).
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
