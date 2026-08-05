import { createFragmentDecoder } from './fragment.js';

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
    <title>Hosted Nowhere opener</title>
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
      <h1>Hosted Nowhere opener</h1>
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
        const parentWindow = window.parent;
        const status = document.querySelector('#status');
        const unlock = document.querySelector('#unlock');
        const password = document.querySelector('#password');
        let shellReady = false;
        let fragment;
        let decoding = false;

        const setStatus = (message, state) => {
          status.textContent = message;
          if (state) status.dataset.state = state;
          else delete status.dataset.state;
        };

        const reportError = (error, encrypted = false) => {
          const message = encrypted
            ? 'This encrypted link could not open. Check the password and try again.'
            : 'This link is not a valid Hosted Nowhere launch link.';
          setStatus(message, 'error');
          parentWindow.postMessage({
            type: 'opener.error',
            version: 1,
            error: error instanceof Error ? error.message : String(error)
          }, '*');
        };

        const launch = (request) => {
          if (request === null) {
            setStatus('Choose a napplet to open.', 'empty');
            return;
          }
          parentWindow.postMessage({
            type: 'opener.open',
            version: 1,
            pointer: request.pointer,
            ...(request.state === undefined ? {} : { state: request.state })
          }, '*');
          setStatus('Opening napplet…', 'loading');
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
          unlock.hidden = true;
          if (codec.isEncryptedFragment(fragment)) {
            setStatus('Enter the password to decrypt this link.', 'locked');
            unlock.hidden = false;
            password.focus();
            return;
          }
          decodePublic();
        };

        unlock.addEventListener('submit', async (event) => {
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
        });

        window.addEventListener('message', (event) => {
          if (event.source !== parentWindow) return;
          const data = event.data;
          if (!data || typeof data.type !== 'string') return;
          if (data.type === 'shell.init') {
            shellReady = true;
            consume();
            return;
          }
          if (data.type !== 'opener.fragment' || typeof data.fragment !== 'string') return;
          fragment = data.fragment;
          consume();
        });

        parentWindow.postMessage({ type: 'shell.ready' }, '*');
      })();
    </script>
  </body>
</html>`;
