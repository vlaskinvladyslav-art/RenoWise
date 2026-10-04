// Тонка обгортка над IndexedDB (локальне джерело правди, працює офлайн).
// Сховища: records (усі сутності), media (фото як dataURL), meta (службові значення).
const NAME = 'renotrack';
const VERSION = 1;
let opening;

function open() {
  opening ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      d.createObjectStore('records', { keyPath: 'id' });
      d.createObjectStore('media', { keyPath: 'id' });
      d.createObjectStore('meta');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return opening;
}

async function run(store, mode, fn) {
  const d = await open();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const available = () => open().then(() => true, () => false);
export const getAll = (store) => run(store, 'readonly', (s) => s.getAll());
export const get = (store, key) => run(store, 'readonly', (s) => s.get(key));
export const put = (store, val, key) => run(store, 'readwrite', (s) => s.put(val, key));
export const del = (store, key) => run(store, 'readwrite', (s) => s.delete(key));
export const clear = (store) => run(store, 'readwrite', (s) => s.clear());
export async function putMany(store, arr) {
  const d = await open();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, 'readwrite');
    const s = t.objectStore(store);
    arr.forEach((v) => s.put(v));
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}
