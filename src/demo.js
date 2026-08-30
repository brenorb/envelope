import { encodeFragment } from './fragment.js';

export const BUILDINGS_POINTER = 'naddr1qvzqqqyf8ypzqza0kr9j7cpvs4uun08wfpmsxl8aqdjx9p8fg8253cjnahndlkzjqqykyatfd3jxjmn8wvuyrtyz';
export const ENVELOPE_EXAMPLE_POINTER = 'naddr1qqgx2mnkv4kx7ur994jhsctdwpkx2q3qgttp04qscpuau2220hpave59dxtjj4put900gxw3y5jje7ugkzcqxpqqqzynj2j0sar';

export const BUILDINGS_INTENT = Object.freeze({
  archetype: 'building-explorer',
  action: 'open',
  convention: 'napplet:building-explorer/open',
});

export const ENVELOPE_INTENT = Object.freeze({
  archetype: 'envelope',
  action: 'open',
  convention: 'napplet:envelope/open',
});

const messageEntries = [
  ['message-welcome', 'Envelope message · Welcome', 'Welcome to Envelope.', 'welcome'],
  ['message-madeira', 'Envelope message · Madeira', 'Greetings from Madeira.', 'postcard'],
  ['message-protocol', 'Envelope message · Protocol', 'State travels in the URL.', 'protocol'],
  ['message-offline', 'Envelope message · Offline', 'This message needs no hosted database.', 'offline'],
  ['message-scan', 'Envelope message · Scan', 'Scan → resolve → open.', 'demo'],
  ['message-showcase', 'Envelope message · Showcase', 'Twenty links, one runtime.', 'showcase'],
  ['message-nostr', 'Envelope message · Nostr', 'The app came from Nostr.', 'nostr'],
  ['message-napplet', 'Envelope message · Napplet', 'A napplet is a notebook with a starting state.', 'napplet'],
].map(([id, label, message, tone]) => Object.freeze({
  id,
  label,
  text: message,
  nappletId: 'envelope-example',
  pointer: ENVELOPE_EXAMPLE_POINTER,
  intent: ENVELOPE_INTENT,
  state: Object.freeze({ message, tone }),
}));

export const DEMO_ENTRIES = Object.freeze([
  Object.freeze({
    id: 'buildings-ground',
    label: 'Buildings · Ground floor',
    text: 'Open the ground floor.',
    nappletId: 'buildings',
    state: Object.freeze({ floor: 'ground' }),
  }),
  Object.freeze({
    id: 'buildings-both',
    label: 'Buildings · Both floors',
    text: 'Show both floors.',
    nappletId: 'buildings',
    state: Object.freeze({ floor: 'both' }),
  }),
  ...messageEntries,
]);

export function createDemoLaunches({ siteUrl, pointer } = {}) {
  if (typeof siteUrl !== 'string' || siteUrl.length === 0) throw new Error('siteUrl is required');
  return DEMO_ENTRIES.map((entry) => {
    const targetPointer = entry.pointer ?? pointer ?? BUILDINGS_POINTER;
    const state = entry.state ?? { text: entry.text };
    const intent = entry.intent ?? BUILDINGS_INTENT;
    const fragment = encodeFragment({
      pointer: targetPointer,
      state,
      intent,
    });
    const url = new URL(siteUrl);
    url.hash = fragment.slice(1);
    return Object.freeze({
      ...entry,
      targetPointer,
      state,
      intent,
      nappletId: entry.nappletId ?? 'buildings',
      fragment,
      url: url.href,
    });
  });
}
