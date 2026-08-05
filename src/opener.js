import { decodeEncryptedFragment, decodeFragment, isEncryptedFragment } from './fragment.js';

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
 *   bootstrapHtml?: string,
 *   shellHost?: { prepareHtml: Function, registerFrame: Function, destroy?: Function },
 *   passwordProvider?: () => Promise<string>,
 *   onError?: (error: unknown) => void,
 * }} options
 */
export function createOpener({ window, document, container, status, resolver, bootstrapHtml, shellHost, passwordProvider, onError } = {}) {
  assertOptions({ window, document, container, status, resolver });
  if (bootstrapHtml !== undefined && typeof bootstrapHtml !== 'string') {
    throw new Error('bootstrapHtml must be a string');
  }
  if (passwordProvider !== undefined && typeof passwordProvider !== 'function') {
    throw new Error('passwordProvider must be a function');
  }

  let generation = 0;
  let started = false;
  let activeFrame;
  let activeRole;
  let activeRequest;
  let activeFrameCleanup;
  let shellInitialized = false;

  const onHashChange = () => { void load(); };
  const onMessage = (event) => {
    if (!activeFrame || event?.source !== activeFrame.contentWindow) return;
    const data = event.data;
    if (!data || typeof data.type !== 'string') return;
    if (data.type === 'shell.ready') {
      if (shellHost) return;
      if (shellInitialized) return;
      shellInitialized = true;
      activeFrame.contentWindow?.postMessage({
        type: 'shell.init',
        capabilities: { domains: ['shell', 'opener'] },
        services: [],
      }, '*');
      return;
    }
    if (activeRole === 'bootstrap' && data.type === 'opener.open' && activeRequest) {
      void resolveAndMount(activeRequest, generation);
    }
  };

  async function start() {
    if (!started) {
      window.addEventListener('hashchange', onHashChange);
      window.addEventListener('message', onMessage);
      started = true;
    }
    return load();
  }

  async function load(hash = window.location.hash) {
    const currentGeneration = ++generation;
    clearTarget();

    let request;
    try {
      if (isEncryptedFragment(hash)) {
        if (!passwordProvider) throw new Error('password required for encrypted fragment');
        request = await decodeEncryptedFragment(hash, await passwordProvider());
      } else {
        request = decodeFragment(hash);
      }
    } catch (error) {
      showError(
        isEncryptedFragment(hash)
          ? 'This encrypted link could not open. Check the password and try again.'
          : 'This link is not a valid Hosted Nowhere launch link.',
        error,
      );
      return;
    }

    if (request === null) {
      setStatus(status, 'Choose a napplet to open.', 'empty');
      return;
    }

    if (bootstrapHtml !== undefined) {
      mountTarget({ verified: true, indexHtml: bootstrapHtml, title: 'Hosted Nowhere opener' }, request, currentGeneration, 'bootstrap');
      return;
    }
    return resolveAndMount(request, currentGeneration);
  }

  async function resolveAndMount(request, currentGeneration) {
    if (currentGeneration !== generation) return;
    setStatus(status, 'Resolving napplet…', 'loading');
    try {
      const target = await resolver.resolve(request.pointer);
      if (currentGeneration !== generation) return;
      assertVerifiedTarget(target);
      mountTarget(target, request, currentGeneration, 'target');
    } catch (error) {
      if (currentGeneration !== generation) return;
      clearTarget();
      showError('This napplet could not open.', error);
    }
  }

  function mountTarget(target, request, currentGeneration, role) {
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
    if (activeFrameCleanup) activeFrameCleanup();
    activeFrameCleanup = undefined;
    activeFrame = frame;
    activeRole = role;
    activeRequest = request;
    shellInitialized = false;
    replaceChildren(container, frame);
    activeFrameCleanup = shellHost?.registerFrame(frame, target.identity ?? {
      dTag: 'hosted-nowhere-opener',
      aggregateHash: '0'.repeat(64),
    });
    frame.srcdoc = shellHost ? shellHost.prepareHtml(target.indexHtml, target) : target.indexHtml;
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
    window.removeEventListener('message', onMessage);
    activeFrame = undefined;
    activeRequest = undefined;
    activeFrameCleanup?.();
    activeFrameCleanup = undefined;
    shellHost?.destroy?.();
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
