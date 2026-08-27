import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { computeAggregateHash } from '@kehto/nip/5a';
import { DEFAULT_OPENER_HTML } from '../src/opener-napplet.js';
import { EXAMPLE_TARGET_HTML } from '../src/example-target-napplet.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_BLOSSOM_SERVERS = Object.freeze([
  'https://blossom.primal.net',
  'https://cdn.hzrd149.com',
]);

export function createNappletRelease({ html, dTag, title, description, requires = [], archetypes = [], servers = DEFAULT_BLOSSOM_SERVERS }) {
  const bytes = new TextEncoder().encode(html);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const paths = [{ path: '/index.html', sha256 }];
  const aggregateHash = computeAggregateHash(paths);
  const tags = [
    ['d', dTag],
    ['path', '/index.html', sha256],
    ['x', aggregateHash, 'aggregate'],
    ...servers.map((server) => ['server', server]),
    ...requires.map((domain) => ['requires', domain]),
    ['title', title],
    ['description', description],
    ...archetypes.map(({ slug, convention }) => ['archetype', slug, convention]),
  ];

  return {
    kind: 35_129,
    dTag,
    sha256,
    aggregateHash,
    bytes: bytes.byteLength,
    tags,
  };
}

export async function buildNapplets(outputDir = resolve(projectRoot, '.artifacts/napplets')) {
  const resolvedOutput = resolve(outputDir);
  if (resolvedOutput === '/' || resolvedOutput === projectRoot) {
    throw new Error('Refusing to replace an unsafe napplet output directory');
  }

  const definitions = [
    {
      name: 'opener',
      html: DEFAULT_OPENER_HTML,
      dTag: 'envelope-opener',
      title: 'Envelope opener',
      description: 'Decodes Envelope fragments and dispatches verified NAP-INTENT launches.',
      requires: ['intent'],
      archetypes: [],
    },
    {
      name: 'example-target',
      html: EXAMPLE_TARGET_HTML,
      dTag: 'envelope-example',
      title: 'Envelope example target',
      description: 'Displays state delivered from an Envelope link through NAP-INTENT.',
      requires: ['inc'],
      archetypes: [{ slug: 'envelope', convention: 'napplet:envelope/open' }],
    },
  ];

  await rm(resolvedOutput, { recursive: true, force: true });
  const releases = {};
  for (const definition of definitions) {
    const directory = resolve(resolvedOutput, definition.name);
    await mkdir(directory, { recursive: true });
    await writeFile(resolve(directory, 'index.html'), definition.html, 'utf8');
    releases[definition.name] = createNappletRelease(definition);
  }
  await writeFile(resolve(resolvedOutput, 'release.json'), `${JSON.stringify(releases, null, 2)}\n`, 'utf8');
  return { outputDir: resolvedOutput, releases };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const result = await buildNapplets(process.env.ENVELOPE_NAPPLET_OUTPUT_DIR);
  process.stdout.write(`Built napplet artifacts in ${result.outputDir}\n`);
}
