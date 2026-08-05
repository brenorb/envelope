# Hosted Nowhere

An nsite-hosted opener shell for content-addressed Nostr napplets.

The first slice turns a link fragment into a verified-target launch request:

```text
https://your-nsite.example/#nw1.<base64url(JSON)> 
```

For state that should not be readable from the URL, the shell also accepts a
password-protected envelope:

```text
https://your-nsite.example/#nwe1.<salt>.<iv>.<ciphertext>
```

The encrypted form uses AES-GCM with a PBKDF2-derived key. The password is not
stored in the link; the opener asks for it locally.

See [research/architecture.md](research/architecture.md) for the protocol
research, security boundary, and implementation roadmap.

See [docs/integration.md](docs/integration.md) for wiring the real Paja
resolver and deploying the shell as an nsite.

The single source of truth for the six-point implementation contract is
[outputs/napplet-nowhere-status/implementation-status.xlsx](outputs/napplet-nowhere-status/implementation-status.xlsx).
It records the proof required before any item can be marked complete.

## Development

```bash
npm test
npm run check
```

The browser shell is intentionally dependency-light. The resolver is an
injection point: production should connect it to Paja/Kehto's NIP-5D resolver,
while tests and the demo use a deterministic in-memory resolver.

## Current scope

- versioned `#nw1.` public and `#nwe1.` encrypted fragment codecs;
- bounded JSON state and NIP-19 pointer validation;
- resolver-driven target loading;
- opaque sandboxed iframe with post-load launch state;
- bundled Paja/NIP-5D resolver and Kehto NAP-SHELL bridge;
- built-in opener bootstrap that hands the host-decoded launch request to the
  target (tracked as an interim implementation, not the final opener napplet);
- Cache Storage reuse for verified targets after the first online launch;
- service-worker caching for reloading the static shell without its gateway;
- explicit loading, empty, and error states;
- tests for malformed links, tampering, iframe policy, encryption, and state
  delivery.
