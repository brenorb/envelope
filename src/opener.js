import { decodeFragment } from './fragment.js';

/**
 * Create the static opener controller.
 *
 * The resolver is deliberately injected. It must return `verified: true` only
 * after its own protocol-specific checks (for example Paja's NIP-5D signature,
 * aggregate, and blob verification) have succeeded.
 *
 * @param {{
 *   window: WindowLike,
 *   document: DocumentLike,
 *   container: ElementLike,
 *   status: ElementLike,
 *   resolver: { resolve: (pointer: string) => Promise<ResolvedTarget> },
 *   onError?: (error: unknown) => void,
 * }} options
 */
export function createOpener({ window, document, container, status, resolver, onError } = {}) {
  assertOptions({ window, document, container, status, resolver });

  let generation = 0;
  let started = false;

  const onHashChange = () => { void load(); };

  async function start() {
    if (!started) {
      window.addEventListener('hashchange', onHashChange);
      started = true;
    }
    return load();
  }

  async function load(hash = window.location.hash) {
    const currentGeneration = ++generation;
    clearTarget();

    let request;
    try {
      request = decodeFragment(hash);
    } catch (error) {
      showError('This link is not a valid Hosted Nowhere launch link.', error);
      return;
    }

    if (request === null) {
      setStatus(status, 'Choose a napplet to open.', 'empty');
      return;
    }

    setStatus(status, 'Resolving napplet…', 'loading');
    try {
      const target = await resolver.resolve(request.pointer);
      if (currentGeneration !== generation) return;
      assertVerifiedTarget(target);
      mountTarget(target, request, currentGeneration);
    } catch (error) {
      if (currentGeneration !== generation) return;
      showError('This napplet could not open.', error);
    }
  }

  function mountTarget(target, request, currentGeneration) {
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.sandbox?.add('allow-scripts');
    frame.setAttribute('title', target.title ?? 'Hosted Nowhere napplet');
    frame.addEventListener('load', () => {
      if (currentGeneration !== generation) return;
      const message = {
        type: 'opener.init',
        version: 1,
        pointer: request.pointer,
        ...(request.state === undefined ? {} : { state: request.state }),
      };
      frame.contentWindow?.postMessage(message, '*');
      setStatus(status, 'Target is ready.', 'ready');
    });
    frame.srcdoc = target.indexHtml;
    replaceChildren(container, frame);
    setStatus(status, 'Target is ready.', 'ready');
  }

  function clearTarget() {
    replaceChildren(container);
  }

  function showError(message, error) {
    setStatus(status, message, 'error');
    onError?.(error);
  }

  function stop() {
    generation += 1;
    if (!started) return;
    window.removeEventListener('hashchange', onHashChange);
    started = false;
  }

  return { start, load, stop };
}

function assertOptions(options) {
  for (const [name, value] of Object.entries(options)) {
    if (value === undefined || value === null) throw new Error(`opener option is required: ${name}`);
  }
  if (typeof options.resolver.resolve !== 'function') throw new Error('resolver.resolve is required');
}

function assertVerifiedTarget(target) {
  if (!target || target.verified !== true || typeof target.indexHtml !== 'string') {
    throw new Error('resolver returned unverified or malformed target bytes');
  }
}

function replaceChildren(element, ...children) {
  if (typeof element.replaceChildren === 'function') {
    element.replaceChildren(...children);
    return;
  }
  while (element.firstChild) element.removeChild(element.firstChild);
  for (const child of children) element.appendChild(child);
}

function setStatus(element, text, state) {
  element.textContent = text;
  element.setAttribute?.('data-state', state);
}

/** @typedef {{ location: { hash: string }, addEventListener: Function, removeEventListener: Function }} WindowLike */
/** @typedef {{ createElement: (tag: string) => ElementLike }} DocumentLike */
/** @typedef {{ verified: true, indexHtml: string, identity?: string, title?: string }} ResolvedTarget */
/** @typedef {{ replaceChildren?: Function, firstChild?: unknown, removeChild?: Function, appendChild?: Function, textContent?: string, setAttribute?: Function }} ElementLike */
