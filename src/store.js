// Sparar uppladdade filer i IndexedDB så de finns kvar efter omladdning.
const DB = 'smarthomehub3d';
const STORE = 'files';

function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => res(req?.result);
    t.onerror = () => rej(t.error);
  });
}

export const saveFile = (key, blob) => tx('readwrite', s => s.put(blob, key)).catch(() => {});
export const loadFile = key => tx('readonly', s => s.get(key)).catch(() => undefined);
export const deleteFile = key => tx('readwrite', s => s.delete(key)).catch(() => {});
