# Hosted Nowhere

An nsite-hosted opener shell for content-addressed Nostr napplets.

The first slice turns a link fragment into a verified-target launch request:

```text
https://your-nsite.example/#nw1.<base64url(JSON)> 
```

See [research/architecture.md](research/architecture.md) for the protocol
research, security boundary, and implementation roadmap.

See [docs/integration.md](docs/integration.md) for wiring the real Paja
resolver and deploying the shell as an nsite.

## Development

```bash
npm test
npm run check
```

The browser shell is intentionally dependency-light. The resolver is an
injection point: production should connect it to Paja/Kehto's NIP-5D resolver,
while tests and the demo use a deterministic in-memory resolver.

## Current scope

- versioned `#nw1.` fragment codec;
- bounded JSON state and NIP-19 pointer validation;
- resolver-driven target loading;
- opaque sandboxed iframe with post-load launch state;
- bundled Paja/NIP-5D resolver and Kehto NAP-SHELL bridge;
- built-in opener napplet that hands the fragment launch request to the target;
- explicit loading, empty, and error states;
- tests for malformed links, tampering, iframe policy, and state delivery.

The nsite deployer and full Paja/NIP-5D adapter are deliberately next steps;
they are documented rather than hidden behind a fake network implementation.
