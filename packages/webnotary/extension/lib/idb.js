// IndexedDB handoff store. The service worker writes the finished bundle Blob
// here; the offscreen document (which, unlike the worker, can call
// URL.createObjectURL) reads it back to mint a blob: URL for chrome.downloads.
// Records are deleted after a successful download and pruned on startup.

const DB_NAME = 'webnotary';
const STORE = 'bundles';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let result;
    try { result = fn(store); } catch (e) { reject(e); return; }
    t.oncomplete = () => resolve(result?.result ?? result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export async function idbPut(record) {
  const db = await openDb();
  try { return await tx(db, 'readwrite', (s) => s.put(record)); } finally { db.close(); }
}

export async function idbGet(id) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readonly');
      const req = t.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally { db.close(); }
}

export async function idbDelete(id) {
  const db = await openDb();
  try { return await tx(db, 'readwrite', (s) => s.delete(id)); } finally { db.close(); }
}

export async function idbPrune(maxAgeMs) {
  const cutoff = Date.now() - maxAgeMs;
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readwrite');
      const req = t.objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) { resolve(); return; }
        if ((cur.value.createdMs ?? 0) < cutoff) cur.delete();
        cur.continue();
      };
      req.onerror = () => reject(req.error);
    });
  } finally { db.close(); }
}
