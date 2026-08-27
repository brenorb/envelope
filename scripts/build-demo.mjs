import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import QRCode from 'qrcode';
import { createDemoLaunches } from '../src/demo.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function renderDemoPage(launches) {
  const cards = launches.map((launch) => `
      <article class="card" data-demo-id="${escapeHtml(launch.id)}">
        <img src="./qr/${escapeHtml(launch.id)}.svg" alt="QR code for ${escapeHtml(launch.label)}">
        <div>
          <h2>${escapeHtml(launch.label)}</h2>
          <p class="note">${escapeHtml(launch.text)}</p>
          <a href="${escapeHtml(launch.url)}">Open this napplet</a>
          <code>${escapeHtml(launch.url)}</code>
        </div>
      </article>`).join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Envelope QR demo</title>
    <style>
      :root { color-scheme: dark; font: 16px/1.5 system-ui, sans-serif; background: #101211; color: #f4f0df; }
      * { box-sizing: border-box; }
      body { max-width: 72rem; margin: 0 auto; padding: 2rem 1rem 4rem; }
      header { margin-bottom: 2rem; }
      h1, h2, p { margin: 0; }
      h1 { font-size: clamp(1.8rem, 4vw, 3rem); }
      header p { margin-top: .5rem; color: #a9ad9f; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr)); gap: 1rem; }
      .card { display: grid; gap: 1rem; padding: 1rem; border: 1px solid #30352f; border-radius: .75rem; background: #181b19; }
      img { width: 100%; max-width: 18rem; aspect-ratio: 1; justify-self: center; padding: .75rem; border-radius: .5rem; background: white; }
      h2 { font-size: 1.1rem; }
      .note { margin-top: .35rem; color: #d8c36a; }
      a { display: inline-block; margin-top: 1rem; color: #9cebb8; }
      code { display: block; margin-top: .75rem; color: #a9ad9f; font-size: .7rem; overflow-wrap: anywhere; }
    </style>
  </head>
  <body>
    <header>
      <h1>Envelope</h1>
      <p>Scan a code to open a live Nostr napplet in the custom Paja runtime with state in the URL.</p>
    </header>
    <main class="grid" aria-label="Envelope demo launch links">${cards}
    </main>
  </body>
</html>
`;
}

export async function buildDemo({
  outputDir = resolve(projectRoot, 'demo'),
  siteUrl,
  pointer,
} = {}) {
  const deployment = JSON.parse(await readFile(resolve(projectRoot, 'config/deployment.json'), 'utf8'));
  const launches = createDemoLaunches({
    siteUrl: siteUrl ?? process.env.ENVELOPE_SITE_URL ?? deployment.siteUrl,
    pointer: pointer ?? process.env.ENVELOPE_TARGET_POINTER ?? deployment.exampleTargetPointer,
  });
  const resolvedOutput = resolve(outputDir);
  if (resolvedOutput === '/' || resolvedOutput === projectRoot) throw new Error('Refusing to replace an unsafe demo output directory');
  await rm(resolvedOutput, { recursive: true, force: true });
  await mkdir(resolve(resolvedOutput, 'qr'), { recursive: true });
  await Promise.all(launches.map(async (launch) => {
    const svg = await QRCode.toString(launch.url, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 560,
    });
    await writeFile(resolve(resolvedOutput, 'qr', `${launch.id}.svg`), svg, 'utf8');
  }));
  await writeFile(resolve(resolvedOutput, 'index.html'), renderDemoPage(launches), 'utf8');
  await writeFile(resolve(resolvedOutput, 'links.json'), `${JSON.stringify(launches, null, 2)}\n`, 'utf8');
  return { outputDir: resolvedOutput, launches };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const result = await buildDemo();
  process.stdout.write(`Built QR demo in ${result.outputDir}\n`);
}
