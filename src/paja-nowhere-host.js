const NIP_19_POINTER_PATTERN = /^(?:naddr|nevent)1[023456789acdefghjklmnpqrstuvwxyz]+$/;
const PAJA_WAIT_MS = 15_000;
const POLL_INTERVAL_MS = 25;

function readRuntimeConfig() {
  const element = document.getElementById('kehto-paja-config');

  if (!element) {
    throw new Error('Missing Paja runtime configuration');
  }

  return JSON.parse(element.textContent ?? '{}');
}

function openerPointerFrom(config) {
  const pointer = config?.target?.pointer?.value;

  if (typeof pointer !== 'string' || !NIP_19_POINTER_PATTERN.test(pointer)) {
    throw new Error('The Paja runtime has no valid opener pointer');
  }

  return pointer;
}

function waitFor(predicate, timeoutMs = PAJA_WAIT_MS) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const inspect = () => {
      const value = predicate();
      if (value) {
        resolve(value);
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error('Timed out waiting for the Paja runtime'));
        return;
      }

      window.setTimeout(inspect, POLL_INTERVAL_MS);
    };

    inspect();
  });
}

function findReadyTab(paja, pointer) {
  return paja.tabs?.find(
    (tab) => tab.pointerValue === pointer && tab.status === 'ready' && tab.frame?.contentWindow,
  );
}

function postFragment(openerTab) {
  openerTab.frame.contentWindow.postMessage(
    {
      type: 'opener.fragment',
      version: 1,
      fragment: window.location.hash,
    },
    '*',
  );
}

function isOpenRequest(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    value.type === 'opener.open' &&
    value.version === 1 &&
    typeof value.requestId === 'string' &&
    value.requestId.length > 0 &&
    typeof value.pointer === 'string' &&
    NIP_19_POINTER_PATTERN.test(value.pointer)
  );
}

async function openTarget(paja, openerTab, request) {
  await paja.loadPointer(request.pointer);
  const targetTab = await waitFor(() => findReadyTab(paja, request.pointer));

  openerTab.frame.contentWindow.postMessage(
    {
      type: 'opener.target.ready',
      version: 1,
      requestId: request.requestId,
      pointer: request.pointer,
      target: {
        dTag: targetTab.resolvedTarget?.dTag,
        aggregateHash: targetTab.resolvedTarget?.aggregateHash,
      },
    },
    '*',
  );
}

export async function installNowhereHost() {
  const openerPointer = openerPointerFrom(readRuntimeConfig());
  const paja = await waitFor(() => window.__KEHTO_PAJA__);
  const openerTab = await waitFor(() => findReadyTab(paja, openerPointer));
  let requestGeneration = 0;

  postFragment(openerTab);
  window.addEventListener('hashchange', () => postFragment(openerTab));
  window.addEventListener('message', (event) => {
    if (event.source !== openerTab.frame.contentWindow || !isOpenRequest(event.data)) {
      return;
    }

    const generation = ++requestGeneration;
    void openTarget(paja, openerTab, event.data).catch((error) => {
      if (generation !== requestGeneration) return;

      openerTab.frame.contentWindow.postMessage(
        {
          type: 'opener.target.error',
          version: 1,
          requestId: event.data.requestId,
          message: error instanceof Error ? error.message : String(error),
        },
        '*',
      );
    });
  });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  void installNowhereHost().catch((error) => {
    console.error('Unable to install Hosted Nowhere Paja adapter', error);
  });
}
