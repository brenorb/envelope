import { createFragmentDecoder } from './fragment.js';

/**
 * Install the opener's fragment-to-intent state machine.
 *
 * This function is deliberately closure-free so its source can be embedded in
 * the signed opener artifact. The host learns only the target pointer; launch
 * state stays in this napplet and crosses into the target through NAP-INTENT.
 *
 * @param {typeof globalThis} runtime
 * @param {{decodeFragment: Function, isEncryptedFragment: Function, decodeEncryptedFragment: Function}} codec
 */
export function createOpenerNappletController(runtime, codec) {
  const parentWindow = runtime.parent;
  const status = runtime.document.querySelector('#status');
  const unlock = runtime.document.querySelector('#unlock');
  const password = runtime.document.querySelector('#password');
  let shellReady = false;
  let fragment;
  let decoding = false;
  let started = false;
  let requestSequence = 0;
  let pendingLaunch = null;

  const setStatus = (message, state) => {
    status.textContent = message;
    if (state) status.dataset.state = state;
    else delete status.dataset.state;
  };

  const reportError = (error, encrypted = false) => {
    const message = encrypted
      ? 'This encrypted link could not open. Check the password and try again.'
      : 'This link could not open safely.';
    setStatus(message, 'error');
    parentWindow.postMessage({
      type: 'opener.error',
      version: 1,
      error: error instanceof Error ? error.message : String(error),
    }, '*');
  };

  const launch = (request) => {
    pendingLaunch = null;
    if (request === null) {
      setStatus('Choose a napplet to open.', 'empty');
      return;
    }

    const requestId = `launch-${++requestSequence}`;
    pendingLaunch = { requestId, request };
    parentWindow.postMessage({
      type: 'opener.open',
      version: 1,
      requestId,
      pointer: request.pointer,
    }, '*');
    setStatus('Verifying napplet…', 'loading');
  };

  const decodePublic = () => {
    try {
      launch(codec.decodeFragment(fragment));
    } catch (error) {
      reportError(error);
    }
  };

  const consume = () => {
    if (!shellReady || fragment === undefined || decoding) return;
    pendingLaunch = null;
    unlock.hidden = true;
    if (codec.isEncryptedFragment(fragment)) {
      setStatus('Enter the password to decrypt this link.', 'locked');
      unlock.hidden = false;
      password.focus();
      return;
    }
    decodePublic();
  };

  const normalizeContracts = (contracts) => {
    if (!Array.isArray(contracts)) return [];
    return contracts.filter((contract) => (
      contract !== null
      && typeof contract === 'object'
      && typeof contract.archetype === 'string'
      && contract.archetype.length > 0
      && typeof contract.convention === 'string'
      && contract.convention.length > 0
    ));
  };

  const createIntentRequest = (request, contracts) => {
    const advertised = normalizeContracts(contracts);
    const requested = request.intent;
    const contract = requested
      ? advertised.find((candidate) => (
          candidate.archetype === requested.archetype
          && candidate.convention === requested.convention
        ))
      : advertised[0];

    if (!contract) throw new Error('the target does not advertise the requested intent contract');

    const intent = {
      archetype: contract.archetype,
      action: requested?.action ?? 'open',
      convention: contract.convention,
    };
    if (requested && Object.hasOwn(requested, 'payload')) intent.payload = requested.payload;
    else if (request.state !== undefined) intent.payload = request.state;
    if (requested?.behavior !== undefined) intent.behavior = requested.behavior;
    return intent;
  };

  const invokeTarget = async (message) => {
    const pending = pendingLaunch;
    if (
      !pending
      || message.requestId !== pending.requestId
      || message.pointer !== pending.request.pointer
    ) return;

    pendingLaunch = null;
    try {
      const intentApi = runtime.napplet?.intent;
      if (typeof intentApi?.invoke !== 'function') throw new Error('the Paja runtime did not grant NAP-INTENT');
      const intent = createIntentRequest(pending.request, message.contracts);
      const result = await intentApi.invoke(intent);
      if (result?.ok === true && result.handled === true) {
        setStatus('Napplet opened.', 'ready');
        return;
      }

      // Several published napplets advertise an archetype but implement the
      // initial open as a NAP-INC subscription. Keep NAP-INTENT as the first
      // choice, then use the exact same convention as an INC topic when the
      // target explicitly declined the intent. The opener has no target
      // knowledge here: the host still authenticates the pointer and supplies
      // only the target's verified manifest contracts.
      const inc = runtime.napplet?.inc;
      if (typeof inc?.emit !== 'function') {
        throw new Error(result?.error ?? 'the target did not handle the launch intent');
      }
      inc.emit(intent.convention, intent.payload);
      setStatus('Napplet opened.', 'ready');
    } catch (error) {
      reportError(error);
    }
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (decoding || !codec.isEncryptedFragment(fragment)) return;
    decoding = true;
    setStatus('Decrypting link…', 'loading');
    try {
      launch(await codec.decodeEncryptedFragment(fragment, password.value));
      unlock.hidden = true;
    } catch (error) {
      reportError(error, true);
      unlock.hidden = false;
      password.select();
    } finally {
      decoding = false;
    }
  };

  const onMessage = (event) => {
    if (event.source !== parentWindow) return;
    const data = event.data;
    if (!data || typeof data.type !== 'string') return;
    if (data.type === 'shell.init') {
      shellReady = true;
      consume();
      return;
    }
    if (data.type === 'opener.fragment' && typeof data.fragment === 'string') {
      fragment = data.fragment;
      consume();
      return;
    }
    if (data.type === 'opener.target.ready' && data.version === 1) {
      void invokeTarget(data);
      return;
    }
    if (
      data.type === 'opener.target.error'
      && pendingLaunch
      && data.requestId === pendingLaunch.requestId
    ) {
      pendingLaunch = null;
      reportError(new Error(typeof data.message === 'string' ? data.message : 'target failed to open'));
    }
  };

  function start() {
    if (started) return;
    started = true;
    unlock.addEventListener('submit', onSubmit);
    runtime.addEventListener('message', onMessage);
  }

  return Object.freeze({ start });
}

/**
 * Self-contained opener napplet artifact.
 *
 * The runtime may transport the top-level fragment into this opaque iframe,
 * but only this napplet parses or decrypts it. The same HTML is suitable for a
 * signed NIP-5D `/index.html` artifact.
 */
export const DEFAULT_OPENER_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Envelope opener</title>
    <style>
      :root { color-scheme: dark; font: 16px/1.5 system-ui, sans-serif; background: #111; color: #eee; }
      body { min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 1.5rem; }
      main { width: min(32rem, 100%); display: grid; gap: .9rem; }
      h1 { margin: 0; font-size: 1rem; letter-spacing: .08em; text-transform: uppercase; }
      p { margin: 0; color: #aaa; }
      form { display: grid; gap: .65rem; }
      input, button { padding: .65rem .75rem; border-radius: .3rem; font: inherit; }
      input { background: #1c1c1c; color: #eee; border: 1px solid #555; }
      button { border: 0; background: #b9e6b9; color: #111; cursor: pointer; }
      [hidden] { display: none; }
      [data-state="error"] { color: #ffaaa5; }
    </style>
  </head>
  <body>
    <main>
      <h1>Envelope opener</h1>
      <p id="status" role="status" aria-live="polite">Waiting for launch fragment…</p>
      <form id="unlock" hidden>
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" minlength="8" required>
        <button type="submit">Open encrypted link</button>
      </form>
    </main>
    <script>
      (() => {
        const codec = (${createFragmentDecoder.toString()})(globalThis);
        const controller = (${createOpenerNappletController.toString()})(globalThis, codec);
        controller.start();
      })();
    </script>
  </body>
</html>`;
