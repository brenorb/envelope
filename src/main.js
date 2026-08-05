import { createOpener } from './opener.js';
import { createBrowserPajaResolver } from './paja-resolver.js';
import { DEFAULT_OPENER_HTML } from './opener-napplet.js';

const stage = document.querySelector('#stage');
const status = document.querySelector('#status');

// A deployed nsite can provide the real Paja bundle as an adapter without
// changing the fragment codec or opener lifecycle. Keeping this explicit also
// prevents the shell from silently trusting an arbitrary URL as napplet HTML.
const paja = globalThis.hostedNowherePaja;
const runtimeConfig = globalThis.hostedNowhereConfig ?? {};
const resolver = createBrowserPajaResolver({
  ...runtimeConfig,
  ...(paja?.resolvePointer ? { resolve: paja.resolvePointer } : {}),
});

const opener = createOpener({
  window,
  document,
  container: stage,
  status,
  resolver,
  bootstrapHtml: DEFAULT_OPENER_HTML,
  onError: (error) => console.error('[hosted-nowhere]', error),
});

void opener.start();
