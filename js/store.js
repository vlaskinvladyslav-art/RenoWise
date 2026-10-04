// Стан застосунку. Дані — плоска мапа id → запис; кожен запис має updatedAt
// (last-write-wins), updatedBy (хто змінив) і прапорець _d (ще не відправлено в хмару).
// Видалення — м'яке.
import * as db from './db.js';
import { uid } from './util.js';
import { me } from './identity.js';

export const state = {
  data: {},          // id → запис
  media: {},         // id → dataURL
  v: 0,              // версія даних (для мемоізації derive)
  ready: false,
  persistent: true,  // чи доступний IndexedDB
  ui: {
    route: { name: 'dash', params: {} },
    dir: 'tab',
    overlay: null,   // верхній оверлей стеку (див. actions.js)
    overlays: [],
    fabOpen: false,
    expanded: {},    // taskId → true
    viewing: {},     // taskId → optionId (який варіант розглядається)
    planEdit: false,
    planKind: 'draw',
    planZoom: 1,
    planMode: 'tasks',
    planItems: true,
    spacesFilter: 'all',
    shopStore: null,
    toasts: [],
    online: navigator.onLine,
    updateReady: false,
  },
};

const subs = new Set();
export const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
export const requestRender = () => subs.forEach((fn) => fn());
export const hooks = { onChange: null, onMedia: null, onRemote: null };

const persist = (rec) => {
  if (state.persistent) db.put('records', rec).catch((e) => console.warn('IDB', e));
  hooks.onChange?.(rec);
};
const commit = () => { state.v++; requestRender(); };
const stamp = (rec) => { rec.updatedAt = Date.now(); rec.updatedBy = me.uid; rec._d = 1; return rec; };

export async function load() {
  state.persistent = await db.available();
  if (state.persistent) {
    try {
      for (const r of await db.getAll('records')) state.data[r.id] = r;
      for (const m of await db.getAll('media')) state.media[m.id] = m.data;
    } catch (e) { console.warn('IDB load failed', e); state.persistent = false; }
  }
  pruneActs();
  state.ready = true;
  commit();
}

// Журнал активності не росте безкінечно: лишаємо 250 останніх записів.
function pruneActs() {
  const acts = Object.values(state.data).filter((r) => r.type === 'act' && !r.deleted).sort((a, b) => b.at - a.at);
  for (const old of acts.slice(250)) { old.deleted = true; stamp(old); persist(old); }
}

const ORDERED = new Set(['space', 'task', 'option']);
function nextOrder(type, parentKey, parentId) {
  let max = -1;
  for (const r of Object.values(state.data)) {
    if (r.type === type && !r.deleted && (!parentKey || r[parentKey] === parentId) && (r.order ?? 0) > max) max = r.order ?? 0;
  }
  return max + 1;
}

export function create(type, fields = {}) {
  const parentKey = type === 'task' ? 'spaceId' : type === 'option' ? 'taskId' : null;
  const rec = stamp({ id: fields.id || uid(), type, ...fields });
  if (ORDERED.has(type) && rec.order == null) rec.order = nextOrder(type, parentKey, rec[parentKey]);
  state.data[rec.id] = rec;
  persist(rec);
  commit();
  return rec;
}

export function update(id, patch) {
  const r = state.data[id];
  if (!r) return null;
  Object.assign(r, patch);
  stamp(r);
  persist(r);
  commit();
  return r;
}

// Для великих імпортів/демо: записати без рендера на кожен запис.
export function bulkPut(recs) {
  recs.forEach((r, i) => {
    const rec = stamp({ ...r });
    rec.updatedAt += i;
    state.data[rec.id] = rec;
    persist(rec);
  });
  commit();
}

// Запис у стрічку активності (її бачать усі, хто живе в домі).
export function log(text, ref = null) {
  const rec = stamp({ id: `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, type: 'act', text, by: me.uid, name: me.name, at: Date.now(), ref });
  state.data[rec.id] = rec;
  persist(rec);
  commit();
  return rec;
}

function cascade(id) {
  const r = state.data[id];
  if (!r) return { del: [], patch: [] };
  const del = [id], patch = [];
  const all = Object.values(state.data).filter((x) => !x.deleted);
  if (r.type === 'space') {
    const tasks = all.filter((x) => x.type === 'task' && x.spaceId === id);
    del.push(...tasks.map((t) => t.id));
    del.push(...all.filter((x) => x.type === 'option' && tasks.some((t) => t.id === x.taskId)).map((o) => o.id));
    del.push(...all.filter((x) => x.type === 'ipin' && tasks.some((t) => t.id === x.taskId)).map((o) => o.id));
    del.push(...all.filter((x) => x.type === 'pin' && x.spaceId === id).map((p) => p.id));
    // намальована кімната лишається на кресленні, але стає «непризначеною»
    patch.push(...all.filter((x) => x.type === 'room' && x.spaceId === id).map((p) => p.id));
  } else if (r.type === 'task') {
    del.push(...all.filter((x) => x.type === 'option' && x.taskId === id).map((o) => o.id));
    del.push(...all.filter((x) => x.type === 'ipin' && x.taskId === id).map((o) => o.id));
  } else if (r.type === 'plan') {
    del.push(...all.filter((x) => x.type === 'pin').map((p) => p.id));
  }
  return { del, patch };
}

const undoStack = [];
export function remove(id, label = 'Видалено') {
  const { del, patch } = cascade(id);
  if (!del.length) return;
  const before = [...del, ...patch].map((i) => ({ ...state.data[i] }));
  const now = Date.now();
  for (const i of del) {
    const r = state.data[i];
    r.deleted = true;
    stamp(r); r.updatedAt = now;
    persist(r);
  }
  for (const i of patch) { const r = state.data[i]; r.spaceId = ''; stamp(r); persist(r); }
  undoStack.push({ before });
  commit();
  return label;
}

export function undo() {
  const entry = undoStack.pop();
  if (!entry) return false;
  for (const s of entry.before) {
    const rec = stamp({ ...s });
    state.data[rec.id] = rec;
    persist(rec);
  }
  commit();
  return true;
}

// ── Синхронізація: застосувати запис з хмари (LWW) ──
export function applyRemote(rec) {
  if (!rec || !rec.id || !rec.type) return false;
  const cur = state.data[rec.id];
  if (cur && (cur.updatedAt || 0) >= (rec.updatedAt || 0)) return false;
  const clean = { ...rec };
  delete clean._d;
  state.data[rec.id] = clean;
  if (state.persistent) db.put('records', clean).catch(() => {});
  hooks.onRemote?.(clean, !cur);
  commit();
  return true;
}
export function markClean(id, updatedAt) {
  const r = state.data[id];
  if (r && r._d && r.updatedAt === updatedAt) {
    delete r._d;
    if (state.persistent) db.put('records', r).catch(() => {});
  }
}
export const dirtyRecords = () => Object.values(state.data).filter((r) => r._d);

// ── Медіа (фото) ──
// У DOM віддаємо короткі blob:-URL, а не мегабайтні data:-рядки — рендер лишається швидким.
const blobUrls = {};
function toBlobUrl(du) {
  const i = du.indexOf(',');
  const meta = du.slice(5, i), body = du.slice(i + 1);
  const b64 = /;base64$/.test(meta);
  const type = meta.replace(/;base64$/, '').split(';')[0] || 'application/octet-stream';
  let bytes;
  if (b64) {
    const bin = atob(body);
    bytes = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
  } else bytes = new TextEncoder().encode(decodeURIComponent(body));
  return URL.createObjectURL(new Blob([bytes], { type }));
}

export async function putMedia(id, dataUrl, dirty = true) {
  state.media[id] = dataUrl;
  if (blobUrls[id]) { URL.revokeObjectURL(blobUrls[id]); delete blobUrls[id]; }
  const rec = { id, data: dataUrl, updatedAt: Date.now(), ...(dirty ? { _d: 1 } : {}) };
  if (state.persistent) await db.put('media', rec).catch(() => {});
  if (dirty) hooks.onMedia?.(rec);
  requestRender();
}
export async function dropMedia(id) {
  delete state.media[id];
  if (blobUrls[id]) { URL.revokeObjectURL(blobUrls[id]); delete blobUrls[id]; }
  if (state.persistent) await db.del('media', id).catch(() => {});
}
export function mediaSrc(id) {
  const du = id && state.media[id];
  if (!du) return '';
  try { return (blobUrls[id] ||= toBlobUrl(du)); } catch { return du; }
}

// ── Експорт / імпорт / очищення ──
export function exportAll() {
  const strip = (r) => { const c = { ...r }; delete c._d; return c; };
  return {
    app: 'renowise', version: 2, exportedAt: new Date().toISOString(),
    records: Object.values(state.data).map(strip),
    media: Object.entries(state.media).map(([id, data]) => ({ id, data })),
  };
}
export async function importAll(json) {
  if (!json || !['renowise', 'renotrack'].includes(json.app) || !Array.isArray(json.records)) throw new Error('Невірний файл резервної копії');
  let n = 0;
  const now = Date.now();
  for (const r of json.records) {
    const cur = state.data[r.id];
    if (cur && (cur.updatedAt || 0) >= (r.updatedAt || 0)) continue;
    const rec = { ...r, updatedAt: Math.max(r.updatedAt || 0, now), updatedBy: me.uid, _d: 1 };
    state.data[rec.id] = rec; persist(rec); n++;
  }
  for (const m of json.media || []) if (!state.media[m.id]) await putMedia(m.id, m.data);
  commit();
  return n;
}
export async function wipe() {
  // м'яке видалення всього, щоб видалення дійшло й до інших пристроїв
  const now = Date.now();
  for (const r of Object.values(state.data)) { r.deleted = true; stamp(r); r.updatedAt = now; persist(r); }
  undoStack.length = 0;
  commit();
}
export const hasLocalData = () => Object.values(state.data).some((r) => !r.deleted && r.type !== 'act');
