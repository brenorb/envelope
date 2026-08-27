import { encodeFragment } from './fragment.js';

export const DEMO_NAPPLET_ID = 'envelope-example';
export const DEMO_INTENT = Object.freeze({
  archetype: 'envelope',
  action: 'open',
  convention: 'napplet:envelope/open',
});

export const DEMO_ENTRIES = Object.freeze([
  Object.freeze({
    id: 'note-morning',
    label: 'Envelope · Morning note',
    text: 'Ship the smallest useful thing.',
  }),
  Object.freeze({
    id: 'buildings-ground',
    label: 'Buildings · Ground floor',
    text: 'Open the ground floor.',
    pointer: 'naddr1qvzqqqyf8ypzqza0kr9j7cpvs4uun08wfpmsxl8aqdjx9p8fg8253cjnahndlkzjqqykyatfd3jxjmn8wvuyrtyz',
    nappletId: 'buildings',
    intent: Object.freeze({
      archetype: 'building-explorer',
      action: 'open',
      convention: 'napplet:building-explorer/open',
    }),
    state: Object.freeze({ floor: 'ground' }),
  }),
  Object.freeze({
    id: 'buildings-basement',
    label: 'Buildings · Basement',
    text: 'Open the basement floor.',
    pointer: 'naddr1qvzqqqyf8ypzqza0kr9j7cpvs4uun08wfpmsxl8aqdjx9p8fg8253cjnahndlkzjqqykyatfd3jxjmn8wvuyrtyz',
    nappletId: 'buildings',
    intent: Object.freeze({
      archetype: 'building-explorer',
      action: 'open',
      convention: 'napplet:building-explorer/open',
    }),
    state: Object.freeze({ floor: 'basement' }),
  }),
]);

export function createDemoLaunches({ siteUrl, pointer } = {}) {
  if (typeof siteUrl !== 'string' || siteUrl.length === 0) throw new Error('siteUrl is required');
  return DEMO_ENTRIES.map((entry) => {
    const targetPointer = entry.pointer ?? pointer;
    const state = entry.state ?? { text: entry.text };
    const intent = entry.intent ?? DEMO_INTENT;
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
      nappletId: entry.nappletId ?? DEMO_NAPPLET_ID,
      fragment,
      url: url.href,
    });
  });
}
