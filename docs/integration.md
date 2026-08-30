# Build, publish, and verify

## Static Paja nsite

`scripts/build-paja-runtime.mjs` follows Paja's upstream static-host layout:

```text
dist/
├── index.html
├── sw.js
└── __kehto/
    ├── browser-host.js
    ├── config.json
    └── envelope-host.js
```

The build uses `createPajaRuntimeHostConfig()` and `renderPajaHtml()` from the
installed `@kehto/paja` package. `config.json` pins the opener `naddr` from
`config/deployment.json`. `browser-host.js` remains Paja's production browser
runtime with one reviewed adaptation: it retains already verified signed
pointer events so Paja's existing blob cache can resolve them offline.

`envelope-host.js` does only coordination:

- forward the untouched top-level fragment to the authenticated opener frame;
- accept a pointer-only `opener.open` request from that frame;
- call Paja's real `loadPointer()`;
- return intent contracts copied from the verified target manifest.

It has no fragment decoder and never receives the password or decoded state.
State enters the host runtime only through the opener's ordinary NAP-INTENT
request, where Paja validates routing and delivers `inc.event` after target
readiness.

Build and validate:

```bash
npm test
npm run check
npm run build
nsyte validate
```

## Napplet releases

`npm run build:napplets` creates two single-file NIP-5D releases:

- `envelope-opener`, requiring the `intent` domain;
- `envelope-example`, requiring `inc` and advertising
  `envelope` / `napplet:envelope/open`.

For each artifact, `release.json` records the `/index.html` SHA-256, NIP-5A
aggregate, and canonical kind-35129 tags. Publish the exact bytes to every
declared Blossom server, then sign and publish the matching manifest. Do not
change an artifact after computing its release blueprint.

The current Envelope opener and example-target releases are mirrored to:

- `https://blossom.primal.net`
- `https://cdn.hzrd149.com`

and its manifests were accepted by `relay.damus.io`, `nos.lol`,
`relay.primal.net`, `nostr.mom`, and `relay.mostr.pub`. The resulting pointers
and event IDs live in `config/deployment.json`.

Exact signed events retrieved from the relays are archived in
`evidence/deployment/`. `test/deployment-evidence.test.js` verifies every
published signature and pointer coordinate.

## nsite deployment

The nsite uses `.nsite/config.json` and the named identifier `envelope`:

```bash
nsyte deploy dist --prompt-sec --sync
```

The correct-JavaScript-MIME Blossom mirror is intentionally first. During the
initial deployment, Primal classified the service-worker bytes as
`text/plain`; service-worker registration requires a JavaScript MIME type.
The bytes were valid, but the metadata was not. `cdn.hzrd149.com` serves the
same content-addressed worker as `text/javascript`.

No fallback is configured. `--fallback=/index.html` is useful for client-side
routes such as `/settings`, but `/#fragment` still requests `/`; the fragment
never reaches the gateway.

## Live proof

```bash
npm run test:live
```

The Playwright test uses an isolated Chrome context and:

1. opens the deployed nsite with a generated fragment;
2. checks Paja's `runtime-pointer` mode and pinned opener;
3. waits for the published target's exact state;
4. waits for service-worker control;
5. disables all browser networking;
6. reloads and checks the same exact state again.

Relay connection errors are expected during the deliberate offline phase. A
passing result requires the target itself to become ready and retain the exact
payload; merely loading the outer shell is insufficient.

## Updating the deployment record

After publishing new napplet manifests or an nsite manifest, update
`config/deployment.json` with the public event IDs and pointers. Rebuild once
more and run the full test suite plus `npm run test:live`. Never store an
`nsec`, bunker secret, or generated auth token in this repository.
