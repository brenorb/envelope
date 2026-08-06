import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createPajaRuntimeHostConfig, renderPajaHtml } from '@kehto/paja';
import { nip19 } from 'nostr-tools';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultNowhereHostPath = resolve(projectRoot, 'src/paja-nowhere-host.js');
const defaultServiceWorkerPath = resolve(projectRoot, 'public/sw.js');

function validateOpenerPointer(pointer) {
  if (typeof pointer !== 'string') {
    throw new TypeError('The opener pointer must be a NIP-19 naddr or nevent');
  }

  let decoded;
  try {
    decoded = nip19.decode(pointer);
  } catch {
    throw new TypeError('The opener pointer must be a valid NIP-19 naddr or nevent');
  }

  if (decoded.type !== 'naddr' && decoded.type !== 'nevent') {
    throw new TypeError('The opener pointer must be a NIP-19 naddr or nevent');
  }
}

function pajaBrowserHostPath() {
  const pajaEntryUrl = import.meta.resolve('@kehto/paja');
  return fileURLToPath(new URL('./browser-host.js', pajaEntryUrl));
}

function addNowhereHost(html) {
  const marker = '    <script type="module" src="./__kehto/browser-host.js"></script>';
  if (!html.includes(marker)) {
    throw new Error('The installed Paja HTML no longer exposes its browser host marker');
  }

  return html.replace(
    marker,
    `${marker}\n    <script type="module" src="./__kehto/nowhere-host.js"></script>\n    <script>if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');</script>`,
  );
}

function addOfflinePointerEventCache(source) {
  const functionMarker = 'async function resolvePajaPointer(value, options = {}) {';
  const onlineResolution = '    const event = await resolvePointerEvent(pointer, pool, relays, normalizeMaxWaitMs(options.maxWaitMs));';
  const verifiedReturn = `    return {
      pointer,
      event,
      relays,`;
  if (!source.includes(functionMarker) || !source.includes(onlineResolution) || !source.includes(verifiedReturn)) {
    throw new Error('The installed Paja resolver no longer matches the offline cache adaptation');
  }

  const helpers = `var NOWHERE_POINTER_EVENT_CACHE_PREFIX = "nowhere:paja:pointer-events:v1:";
function readNowherePointerEvent(pointer) {
  try {
    const event = JSON.parse(localStorage.getItem(NOWHERE_POINTER_EVENT_CACHE_PREFIX + pointer.value) ?? "null");
    return event && matchesPointer(pointer, event) && isNappletManifestKind(event.kind) ? event : null;
  } catch {
    return null;
  }
}
function writeNowherePointerEvent(pointer, event) {
  try {
    localStorage.setItem(NOWHERE_POINTER_EVENT_CACHE_PREFIX + pointer.value, JSON.stringify(event));
  } catch {
  }
}
`;
  const cachedResolution = `    const cachedEvent = readNowherePointerEvent(pointer);
    let event;
    if (typeof navigator !== "undefined" && navigator.onLine === false && cachedEvent) {
      event = cachedEvent;
    } else {
      try {
        event = await resolvePointerEvent(pointer, pool, relays, normalizeMaxWaitMs(options.maxWaitMs));
      } catch (error) {
        if (!cachedEvent) throw error;
        event = cachedEvent;
      }
    }`;

  return source
    .replace(functionMarker, `${helpers}${functionMarker}`)
    .replace(onlineResolution, cachedResolution)
    .replace(verifiedReturn, `    writeNowherePointerEvent(pointer, event);\n${verifiedReturn}`);
}

async function prepareOutputDirectory(outputDir) {
  const resolvedOutput = resolve(outputDir);
  if (resolvedOutput === '/' || resolvedOutput === projectRoot) {
    throw new Error('Refusing to replace an unsafe Paja output directory');
  }

  await rm(resolvedOutput, { recursive: true, force: true });
  await mkdir(resolve(resolvedOutput, '__kehto'), { recursive: true });
  return resolvedOutput;
}

export async function buildPajaRuntime({
  outputDir = resolve(projectRoot, 'dist'),
  openerPointer,
  builtAt = new Date(),
  browserHostPath = pajaBrowserHostPath(),
  nowhereHostPath = defaultNowhereHostPath,
  serviceWorkerPath = defaultServiceWorkerPath,
} = {}) {
  validateOpenerPointer(openerPointer);

  const resolvedOutput = await prepareOutputDirectory(outputDir);
  const config = createPajaRuntimeHostConfig({ pointer: openerPointer }, builtAt);
  const html = addNowhereHost(renderPajaHtml(config));
  const configJson = `${JSON.stringify(config, null, 2)}\n`;
  const browserHost = addOfflinePointerEventCache(await readFile(browserHostPath, 'utf8'));

  await Promise.all([
    writeFile(resolve(resolvedOutput, 'index.html'), html, 'utf8'),
    writeFile(resolve(resolvedOutput, '__kehto/config.json'), configJson, 'utf8'),
    writeFile(resolve(resolvedOutput, '__kehto/browser-host.js'), browserHost, 'utf8'),
    copyFile(nowhereHostPath, resolve(resolvedOutput, '__kehto/nowhere-host.js')),
    copyFile(serviceWorkerPath, resolve(resolvedOutput, 'sw.js')),
  ]);

  return {
    outputDir: resolvedOutput,
    openerPointer,
    mode: 'runtime-pointer',
  };
}

async function runCli() {
  const deployment = JSON.parse(await readFile(resolve(projectRoot, 'config/deployment.json'), 'utf8'));
  const openerPointer = process.env.NOWHERE_OPENER_POINTER ?? deployment.openerPointer;
  const outputDir = process.env.NOWHERE_OUTPUT_DIR ?? resolve(projectRoot, 'dist');
  const result = await buildPajaRuntime({ outputDir, openerPointer });
  process.stdout.write(`Built Paja runtime in ${result.outputDir}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runCli();
}
