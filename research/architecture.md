# Envelope: protocol research and architecture

Research and implementation baseline: 2026-08-06.

The implementation was checked against:

- `kehto/web` commit `d23797957fe7430a20f98a051627f910a305b2a9` and
  `@kehto/paja` 0.11.0;
- `napplet/naps` commit `5ac0490461ca6fec2f0d2e45b4835cf9bc08de24`;
- `nsyte` commit `61025452a45357e0d62d62887ce9316823895337` and
  CLI 0.27.2.

These protocols are still evolving. Package versions and source commits are
part of the compatibility boundary, not incidental dependencies.

## Three distinct layers

1. **nsite delivery.** NIP-5A/nsyte maps static paths to Blossom hashes in a
   signed kind-15128 root or kind-35128 named-site event.
2. **Paja runtime.** The nsite files are Paja's browser host, config, and the
   small Envelope coordinator. The config's `runtime-pointer` target is
   the opener napplet.
3. **NIP-5D napplets.** Opener and target are independent signed,
   content-addressed artifacts. Named napplets use kind 35129, distinct from
   the nsite's kind 35128.

Conflating those layers creates a false implementation: a web page that looks
like Paja is not a Paja runtime, and an nsite manifest is not a napplet
manifest.

## Actual launch sequence

```text
browser URL #nw1... or #nwe1...
  -> nsite serves static Paja runtime (fragment never leaves browser)
  -> Paja verifies and starts pinned opener naddr
  -> Envelope adapter sends raw window.location.hash to opener frame
  -> opener parses or decrypts pointer + state/intent
  -> opener sends pointer-only request to authenticated host
  -> Paja resolves signature + aggregate + every target blob hash
  -> adapter returns verified target manifest intent contracts
  -> opener calls window.napplet.intent.invoke(...)
  -> Paja selects the sole compatible installed handler
  -> Paja waits for target shell.ready
  -> Paja delivers runtime-attested inc.event with exact payload
```

The coordinator authenticates messages by `event.source` against Paja's opener
frame. The iframe remains opaque (`sandbox="allow-scripts"`, never
`allow-same-origin`). A hash change reloads the runtime, resetting Paja's
in-memory installed catalog so an older same-archetype napplet cannot create an
ambiguous handler selection.

## Fragment contract

The public form is `#nw1.<base64url(JSON)>`; the encrypted form is
`#nwe1.<salt>.<iv>.<AES-GCM ciphertext>`. The password is shared out of band
and entered only inside the opener napplet.

Decoded version-1 data contains:

```json
{
  "v": 1,
  "pointer": "naddr1... or nevent1...",
  "state": { "optional": "JSON payload" },
  "intent": {
    "archetype": "optional-explicit-role",
    "action": "open",
    "convention": "napplet:role/open",
    "payload": { "optional": "explicit payload" },
    "behavior": { "focus": true, "reuse": true }
  }
}
```

When `intent` is absent, the opener uses the first intent contract advertised
by the verified target manifest and sends `state` as its payload. When intent
is explicit, the opener requires an exact advertised archetype/convention
match. Routing slugs, conventions, behavior booleans, fragment length, and JSON
payload size are bounded before dispatch.

Plain `nw1` is encoding, not privacy. `nwe1` uses PBKDF2-SHA-256 and AES-GCM,
but encryption protects only link contents at rest; the selected napplet still
receives the decrypted payload.

## Why target loading and intent delivery are separate

Paja's intent catalog is populated only from verified installed manifests.
The coordinator first calls `loadPointer(pointer)`, which verifies and installs
the selected target. It then returns the manifest's archetype contracts to the
opener. The opener invokes NAP-INTENT without a privileged explicit handler;
in a fresh catalog the selected target is the sole compatible candidate.

Paja's browser intent controller reuses that exact verified target generation,
waits for its source-bound `shell.ready`, and sends `inc.event`. This preserves
the NAP trust model; a direct custom `postMessage(state)` would bypass it.

## Offline findings

Two independent caches are required:

- the service worker precaches the nsite document, Paja host, config, and
  Envelope adapter;
- Kehto's NIP-5D Cache Storage implementation retains verified blobs and
  recomputes hashes on reuse.

Upstream Paja 0.11.0 still queried relays for the signed manifest before using
its blob cache. Its artifact cache exposes coordinate methods, but the runtime
resolver does not use them. The custom static build therefore adds a narrow
signed-event cache around `resolvePajaPointer()`:

- cache only an event whose full `resolveNapplet()` verification succeeded;
- key it by the exact NIP-19 pointer;
- require it to still match the pointer and a NIP-5D kind;
- pass it through the normal signature, aggregate, and blob verification path
  on every reuse;
- prefer it immediately when `navigator.onLine === false`, or as fallback when
  all relays fail.

This is not trusting cached HTML. The cached signed event supplies the manifest
that lets the existing resolver re-verify cached content-addressed bytes.

The public live test proves offline behavior after one successful online open.
It does not claim a never-before-seen target can open offline, or that a
target's own external API calls become offline-capable.

## Deployment discoveries

- A URL fragment needs no nsyte SPA fallback because it is absent from the HTTP
  request. `--fallback=/index.html` only affects unknown path requests.
- Blossom content hashes do not encode MIME metadata. One server stored the
  valid service worker as `text/plain`, which Chrome rejects. Server order in
  the nsite manifest therefore matters when gateway MIME is inherited from a
  mirror.
- nsyte's secret scanner flags Paja's token parsers, Bunker URL parser, and
  generated development signer code. Every flagged region was inspected as a
  false positive before the explicit scanner bypass used for deployment.
- A named nsite (`envelope`) avoids replacing the author's existing root nsite.

## Security invariants

- The top-level runtime transports but never decodes the fragment.
- Only the opener receives the encrypted fragment or password.
- The target pointer is bounded NIP-19 data, never a URL or HTML source.
- Paja verifies event signature, NIP-5A aggregate, and every Blossom blob.
- Intent contracts come from the verified target manifest.
- State crosses into the target through NAP-INTENT/NAP-INC after readiness.
- Opaque frame sources, request IDs, and generations reject forged or stale
  messages.
- Cached events and bytes are reverified; corruption fails closed.
- No signing secret is committed or embedded in deployed assets.

## Primary sources

- [nsyte](https://github.com/sandwichfarm/nsyte)
- [Kehto Paja](https://github.com/kehto/web/tree/main/packages/paja)
- [Kehto runtime specification](https://github.com/kehto/web/blob/main/RUNTIME-SPEC.md)
- [NAP-INTENT](https://github.com/napplet/naps/blob/main/naps/NAP-INTENT.md)
- [NAP-INC](https://github.com/napplet/naps/blob/main/naps/NAP-INC.md)
- [NAP-SHELL](https://github.com/napplet/naps/blob/main/naps/NAP-SHELL.md)
- [Kehto NIP-5D implementation](https://github.com/kehto/web/tree/main/packages/nip/src/5d)
- [Original Hosted Nowhere](https://github.com/5t34k/nowhere)
