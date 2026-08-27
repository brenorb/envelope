/** Install the example target's NAP-INC receiver. */
export function createExampleTargetController(runtime) {
  const output = runtime.document.querySelector('#launch-state');
  const status = runtime.document.querySelector('#status');

  function start() {
    const inc = runtime.napplet?.inc;
    if (typeof inc?.on !== 'function') {
      status.textContent = 'NAP-INC was not granted.';
      status.dataset.state = 'error';
      return;
    }

    inc.on('napplet:envelope/open', (event) => {
      runtime.__ENVELOPE_TARGET_STATE__ = event.payload;
      output.textContent = JSON.stringify(event.payload, null, 2);
      status.textContent = 'Opened from the link.';
      status.dataset.state = 'ready';
    });
  }

  return Object.freeze({ start });
}

export const EXAMPLE_TARGET_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Envelope example target</title>
    <style>
      :root { color-scheme: dark; font: 16px/1.5 system-ui, sans-serif; background: #0d1512; color: #eef8f1; }
      body { min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 1.5rem; }
      main { width: min(38rem, 100%); display: grid; gap: 1rem; }
      h1, p { margin: 0; }
      p { color: #a9b9af; }
      pre { min-height: 8rem; margin: 0; padding: 1rem; overflow: auto; border: 1px solid #315242; border-radius: .4rem; background: #09100d; }
      [data-state="ready"] { color: #9cebb8; }
      [data-state="error"] { color: #ffaaa5; }
    </style>
  </head>
  <body>
    <main>
      <h1>Envelope example target</h1>
      <p id="status" role="status">Waiting for a launch intent…</p>
      <pre id="launch-state">No state received.</pre>
    </main>
    <script>
      const controller = (${createExampleTargetController.toString()})(globalThis);
      controller.start();
    </script>
  </body>
</html>`;
