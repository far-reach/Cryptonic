// Offscreen document: the one extension context where URL.createObjectURL is
// available. Reads finished bundles out of IndexedDB and mints blob: URLs for
// chrome.downloads; revokes them once the service worker confirms the save.

import { idbGet } from './lib/idb.js';

const urls = new Map();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'wn-offscreen-make-url') {
    (async () => {
      try {
        const rec = await idbGet(msg.id);
        if (!rec?.blob) throw new Error('bundle not found in local store');
        const url = URL.createObjectURL(rec.blob);
        urls.set(msg.id, url);
        sendResponse({ ok: true, url });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message ?? e) });
      }
    })();
    return true;
  }
  if (msg?.type === 'wn-offscreen-revoke') {
    const url = urls.get(msg.id);
    if (url) {
      URL.revokeObjectURL(url);
      urls.delete(msg.id);
    }
    sendResponse({ ok: true });
    return false;
  }
  return false;
});
