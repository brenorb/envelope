# Hosted Nowhere: research notes and architecture

Status: working design for the first implementation, 2026-08-05.

## The protocol boundary

The idea combines three layers that should stay separate:

1. **nsite** is the delivery format for the opener shell. NIP-5A describes
   static files as Blossom blobs addressed by SHA-256 and a signed Nostr
   manifest that maps paths to those hashes. The current nsite draft uses
   kinds `15128` for a root site and `35128` for a named site.
2. **napplet** is the target application format. The current Kehto reference
   implementation follows draft NIP-5D and uses kinds `5129`, `15129`, and
   `35129`. Its manifest is also content-addressed, but it is intentionally a
   different protocol from an nsite manifest.
3. **Paja/Kehto** is a browser host runtime. It resolves an `naddr` or
   `nevent`, verifies the signed manifest, verifies the NIP-5A aggregate and
   every Blossom blob, then assembles `/index.html` into an opaque-origin
   iframe. The iframe receives the runtime's NAP-SHELL environment and uses
   `postMessage` for NAP traffic.

The first implementation therefore does not pretend to be an nsite gateway or
to replace Paja. It implements the static opener shell and a resolver boundary
that can be backed by Paja's verified resolution pipeline.

## What the link contains

The original Hosted Nowhere implementation is a useful reference, but its
fragment is not a drop-in format for this project. Its codec serializes a tool,
applies dictionary substitutions, uses raw DEFLATE, and base64url-encodes the
result. Password encryption is an optional outer layer; the renderer treats an
encrypted fragment like any other fragment it cannot decode until the user
supplies the password. This project uses a separate `nw1` launch envelope so a
pointer can select an independently published napplet. A future version can
reuse the original compression and encryption pipeline around this envelope,
but must use a new version marker and explicit key/passphrase UX.

The fragment is intentionally a versioned, URL-safe envelope:

```text
https://example.invalid/#nw1.<base64url(JSON)> 
```

The decoded JSON is:

```json
{
  "v": 1,
  "pointer": "naddr1... or nevent1...",
  "state": { "any": "JSON value" }
}
```

The fragment is never sent in the HTTP request, which makes it a good place for
portable launch state. It is **not encrypted** in this version: anyone holding
the link can decode it, and browser history, clipboard managers, referrers, or
screenshots may expose it. A future encrypted state format must be designed as
a separate version instead of quietly changing the meaning of `nw1`.

The envelope is deliberately small and bounded. It carries a pointer and JSON
state, not executable HTML, JavaScript, private keys, relay credentials, or
signatures. The target's bytes come from the resolver and must be verified
before they reach an iframe.

## Launch flow

```text
URL hash
   |
   v
decode + validate nw1 envelope
   |
   v
resolver(pointer)
   |  (Paja adapter: relay -> manifest -> signature/aggregate/blob checks)
   v
verified { indexHtml, identity, metadata }
   |
   v
iframe sandbox="allow-scripts" + srcdoc
   |
   v
postMessage({ type: "opener.init", pointer, state })
```

The opener never grants `allow-same-origin`, never injects `window.nostr`, and
never renders unverified resolver output. The state message is a small
compatibility seam for the first slice. A production Paja adapter should map
it to the selected NAP-INTENT convention and runtime-attested NAP-INC event,
rather than treating a generic window message as a NAP protocol message.

## What “offline” means here

The nsite opener shell itself is static and can be served from a local cache.
The first launch of a target normally needs relay and Blossom access unless the
target artifact is already in a verified local cache. Paja's documented cache
strategy uses Cache Storage for verified blobs and aggregate records; cached
bytes remain untrusted until their hashes are checked again.

That gives us a useful progression:

- **MVP:** static shell, hash envelope, bundled Paja/NIP-5D resolver, signed
  manifest/blob verification, Kehto NAP-SHELL bridge, built-in opener napplet,
  sandboxed target, and state delivery.
- **Next:** real relay/outbox/identity/intent service backends, an installed
  napplet catalog, multiple runtime windows, and stronger offline prefetch UX.
- **Later:** NAP-INTENT/NAP-INC integration, installed target catalog, multiple
  windows/tabs, encrypted fragment state, and nsite deployment tooling.

## Security and compatibility invariants

- Decode only the version and JSON types the shell understands.
- Bound fragment length and state size before parsing or rendering.
- Treat pointers as data; do not interpolate them into HTML or JavaScript.
- Accept target HTML only from a resolver that promises verification.
- Sandbox target frames with `allow-scripts` only; no `allow-same-origin`.
- Send launch state after the target's `load` event so an applet can install its
  listener first.
- Use `postMessage(..., "*")` only because an opaque sandbox has no stable
  origin; authenticate the source window on the receiver side.
- Preserve an explicit error state instead of falling back to arbitrary HTML.
- Do not call the link “private” or “fully offline” when the fragment is plain
  JSON or the target has not been cached.

## Sources

- [NIP-5A: Static Websites (nsites)](https://nips.nostr.com/5a)
- [nsite.run overview](https://nsite.run/)
- [kehto/web runtime reference](https://github.com/kehto/web)
- [Kehto Runtime Protocol Reference](https://github.com/kehto/web/blob/main/RUNTIME-SPEC.md)
- [Kehto Paja package](https://github.com/kehto/web/tree/main/packages/paja)
- [Paja runtime resolver](https://github.com/kehto/web/blob/main/packages/paja/src/runtime-resolver.ts)
- [NIP-5D source reference](https://github.com/nostr-protocol/nips/pull/2303)
- [NAP registry](https://github.com/napplet/naps)
- [Original Hosted Nowhere implementation](https://github.com/5t34k/nowhere)
- [Hosted Nowhere technical architecture](https://hostednowhere.com/how-it-works)

The NIP-5D and NAP documents are drafts. This project should pin any future
adapter to a reviewed commit and keep protocol-specific code behind the
resolver interface.
