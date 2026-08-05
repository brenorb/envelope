import {
  createShellBridge,
  injectNappletNamespacePrelude,
  originRegistry,
} from '@kehto/shell';

/**
 * Create the minimal official Kehto shell host used by the static launcher.
 *
 * The host intentionally advertises only `shell` until a real service backend
 * is configured. A capability must never be advertised merely because the
 * target requested it in its manifest.
 */
export function createKehtoShellHost({ domains = ['shell'] } = {}) {
  const bridge = createShellBridge(createShellAdapter());
  const messageHandler = (event) => bridge.handleMessage(event);
  window.addEventListener('message', messageHandler);
  let nextWindowId = 0;

  return {
    prepareHtml(html) {
      return injectNappletNamespacePrelude(html, { domains });
    },

    registerFrame(frame, identity) {
      const windowId = `hosted-nowhere-${++nextWindowId}`;
      const frameWindow = frame.contentWindow;
      if (!frameWindow) throw new Error('napplet iframe has no contentWindow');
      originRegistry.register(frameWindow, windowId, identity);
      return () => {
        originRegistry.unregister(windowId);
      };
    },

    destroy() {
      window.removeEventListener('message', messageHandler);
      bridge.destroy();
    },
  };
}

function createShellAdapter() {
  const subscriptions = new Map();
  const relayConfig = { discovery: [], super: [], outbox: [] };
  return {
    relayPool: {
      getRelayPool: () => null,
      trackSubscription: (key, cleanup) => subscriptions.set(key, cleanup),
      untrackSubscription: (key) => subscriptions.delete(key),
      openScopedRelay: () => {},
      closeScopedRelay: () => {},
      publishToScopedRelay: () => false,
      selectRelayTier: () => [],
    },
    relayConfig: {
      addRelay: (tier, url) => { if (relayConfig[tier]) relayConfig[tier].push(url); },
      removeRelay: (tier, url) => {
        if (relayConfig[tier]) relayConfig[tier] = relayConfig[tier].filter((candidate) => candidate !== url);
      },
      getRelayConfig: () => ({
        discovery: [...relayConfig.discovery],
        super: [...relayConfig.super],
        outbox: [...relayConfig.outbox],
      }),
      getNip66Suggestions: () => [],
    },
    windowManager: { createWindow: () => null },
    auth: { getUserPubkey: () => null, getSigner: () => null },
    config: { getNappUpdateBehavior: () => 'banner' },
    hotkeys: { executeHotkeyFromForward: () => {} },
    workerRelay: { getWorkerRelay: () => null },
    crypto: { verifyEvent: async () => false },
  };
}
