import { createOpener } from './opener.js';
import { createPajaResolver } from './paja-resolver.js';

const stage = document.querySelector('#stage');
const status = document.querySelector('#status');

// A deployed nsite can provide the real Paja bundle as an adapter without
// changing the fragment codec or opener lifecycle. Keeping this explicit also
// prevents the shell from silently trusting an arbitrary URL as napplet HTML.
const paja = globalThis.hostedNowherePaja;
const resolver = paja?.resolvePointer
  ? createPajaResolver(paja.resolvePointer)
  : {
      resolve: async () => {
        throw new Error('No Paja resolver has been installed in this build.');
      },
    };

const opener = createOpener({
  window,
  document,
  container: stage,
  status,
  resolver,
  onError: (error) => console.error('[hosted-nowhere]', error),
});

void opener.start();
