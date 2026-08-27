import { createOpener } from './opener.js';
import { createBrowserPajaResolver } from './paja-resolver.js';
import { DEFAULT_OPENER_HTML } from './opener-napplet.js';
import { createKehtoShellHost } from './kehto-shell.js';
import { createOfflineFirstResolver } from './offline-cache.js';

const stage = document.querySelector('#stage');
const status = document.querySelector('#status');

// A deployed nsite can provide the real Paja bundle as an adapter without
// changing the fragment codec or opener lifecycle. Keeping this explicit also
// prevents the shell from silently trusting an arbitrary URL as napplet HTML.
const paja = globalThis.envelopePaja;
const runtimeConfig = globalThis.envelopeConfig ?? {};
const liveResolver = createBrowserPajaResolver({
  ...runtimeConfig,
  ...(paja?.resolvePointer ? { resolve: paja.resolvePointer } : {}),
});
const resolver = createOfflineFirstResolver({
  resolve: liveResolver.resolve,
  cacheStorage: runtimeConfig.cacheStorage,
  cacheName: runtimeConfig.cacheName,
  baseUrl: runtimeConfig.cacheBaseUrl,
});
globalThis.envelopeOffline = {
  prefetch: resolver.prefetch,
  resolveOffline: resolver.resolveOffline,
  clear: resolver.clear,
};
const shellHost = createKehtoShellHost({ domains: runtimeConfig.domains ?? ['shell'] });

const opener = createOpener({
  window,
  document,
  container: stage,
  status,
  resolver,
  bootstrapHtml: DEFAULT_OPENER_HTML,
  shellHost,
  onError: (error) => console.error('[envelope]', error),
});

void opener.start();
