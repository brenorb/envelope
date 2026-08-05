/**
 * The built-in opener napplet is intentionally tiny. It is a bootstrap
 * artifact for the host while the same code can later be published as a
 * signed NIP-5D napplet of its own.
 */
export const DEFAULT_OPENER_HTML = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Hosted Nowhere opener</title></head>
  <body><p>Opening napplet…</p>
    <script>
      (() => {
        const parentWindow = window.parent;
        let shellReady = false;
        let pendingInit;
        const open = () => {
          if (!shellReady || !pendingInit) return;
          parentWindow.postMessage({
            type: 'opener.open',
            version: 1,
            pointer: pendingInit.pointer,
            state: pendingInit.state
          }, '*');
          pendingInit = undefined;
        };
        parentWindow.postMessage({ type: 'shell.ready' }, '*');
        window.addEventListener('message', (event) => {
          if (event.source !== parentWindow) return;
          const data = event.data;
          if (!data || typeof data.type !== 'string') return;
          if (data.type === 'shell.init') {
            shellReady = true;
            open();
            return;
          }
          if (data.type !== 'opener.init') return;
          pendingInit = data;
          open();
        });
      })();
    </script>
  </body>
</html>`;
