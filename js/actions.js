// Усі дії користувача (делегування подій за data-act) і керування оверлеями.
import {
  state, create, update, remove, undo, putMedia, dropMedia, exportAll, importAll, wipe, requestRender, log, bulkPut,
} from './store.js';
import { getDerived } from './derived.js';
import { CALC_TYPES, defaultCalc } from './calc.js';
import { STATUS } from './model.js';
import { num, uid, money, getPath, setPath, setCurrency, storeFromUrl, ptsToStr } from './util.js';
import { compress, saveBlobAsMedia, fetchOG, localizeImage, imageToData } from './media.js';
import { cropState, cropAspect, cropRotate, cropApply } from './cropper.js';
import { prefs, savePrefs, applyTheme } from './prefs.js';
import { loadDemo, quickRooms } from './demo.js';
import { suggestIcon } from './icons.js';
import * as sync from './sync.js';
import * as pl from './planner.js';
import { ui } from './ui.js';

const $ = (id) => document.getElementById(id);
const tap = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* не всюди підтримується */ } };
const n = (v) => (String(v ?? '').trim() === '' ? '' : num(v));
const curSpaceId = () => (ui.route.name === 'space' ? ui.route.params.id : null);
const ref = (t) => ({ type: 'task', id: t.id });

// ── Тости ──
let toastSeq = 0;
export function toast(text, { action, ms = 3200 } = {}) {
  const t = { id: ++toastSeq, text, action, closing: false };
  ui.toasts.push(t);
  requestRender();
  setTimeout(() => dismissToast(t.id), action ? 6500 : ms);
}
function dismissToast(id) {
  const t = ui.toasts.find((x) => x.id === id);
  if (!t || t.closing) return;
  t.closing = true;
  requestRender();
  setTimeout(() => { ui.toasts = ui.toasts.filter((x) => x.id !== id); requestRender(); }, 260);
}

// ── Навігація ──
export const go = (path) => { if (location.hash.slice(1) !== path) location.hash = path; };

// ── Стек оверлеїв. Кожен рівень = один запис в історії, тож «Назад» закриває верхній шит. ──
let pushed = 0;
let afterClose = null;
let closingAll = false;

export function openOverlay(o, { replace = false } = {}) {
  ui.fabOpen = false;
  const ov = { ...o, closing: false };
  if (replace && ui.overlays.length) ui.overlays[ui.overlays.length - 1] = ov;
  else { ui.overlays.push(ov); history.pushState({ ov: ui.overlays.length }, ''); pushed++; }
  ui.overlay = ov;
  requestRender();
  return ov;
}
export function closeOverlay(cb) {
  const top = ui.overlay;
  if (!top) { cb?.(); return; }
  if (top.closing) return;
  afterClose = cb || null;
  if (pushed > 0) history.back(); else finishClose();
}
export function closeAll(cb) {
  if (!ui.overlays.length) { cb?.(); return; }
  afterClose = cb || null;
  closingAll = true;
  ui.overlays.forEach((o) => { cleanup(o); o.closing = true; });
  requestRender();
  if (pushed > 0) history.go(-pushed); else finishAll();
}
export function onPop() {
  if (pushed <= 0) return false;
  if (closingAll) { pushed = 0; finishAll(); return true; }
  pushed--;
  finishClose();
  return true;
}
function cleanup(o) {
  if ((o.kind === 'option' || o.kind === 'quick') && !o.saved) (o.draft._newMedia || []).forEach(dropMedia);
}
function finishAll() {
  closingAll = false; pushed = 0;
  setTimeout(() => {
    ui.overlays = []; ui.overlay = null;
    requestRender();
    const cb = afterClose; afterClose = null; cb?.();
  }, 240);
}
function finishClose() {
  const top = ui.overlay;
  if (!top) return;
  cleanup(top);
  top.closing = true;
  requestRender();
  setTimeout(() => {
    ui.overlays = ui.overlays.filter((x) => x !== top);
    ui.overlay = ui.overlays[ui.overlays.length - 1] || null;
    if (ui.overlay) ui.overlay.still = true; // повернення до попереднього шита — без повторної анімації
    requestRender();
    const cb = afterClose; afterClose = null; cb?.();
  }, 240);
}
const editorOv = () => ui.overlays.find((o) => o.kind === 'editor');

// ── Допоміжне ──
function setCfg(patch) {
  if (state.data.cfg) update('cfg', { ...patch, deleted: false });
  else create('cfg', { id: 'cfg', ...patch });
}
function setPlan(patch) {
  if (state.data.plan) update('plan', { ...patch, deleted: false });
  else create('plan', { id: 'plan', ...patch });
}
const imgAspect = (src) => new Promise((res) => {
  const im = new Image();
  im.onload = () => res(im.naturalWidth > 0 && im.naturalHeight > 0 ? im.naturalWidth / im.naturalHeight : 1.4);
  im.onerror = () => res(1.4);
  im.src = src;
});
const focusTask = (id, block = 'center', delay = 120) => { ui.scrollTo = { key: `task-${id}`, block, delay }; };

function normCalc(c) {
  const T = CALC_TYPES[c.type] || CALC_TYPES.area;
  const out = { type: c.type, basis: c.basis || T.basis || 'floor', custom: num(c.custom) };
  for (const f of T.fields) out[f.key] = f.type === 'select' ? c[f.key] : num(c[f.key]);
  return out;
}
const unitCalc = (price, qty) => ({ ...defaultCalc('unit'), price: num(price), qty: num(qty) || 1 });

// ── Відкриття форм ──
function openSpaceSheet(id, extra = {}) {
  const s = id && state.data[id];
  const draft = s
    ? { name: s.name, icon: s.icon || 'home', kind: s.kind || 'room', l: s.l ?? '', w: s.w ?? '', h: s.h ?? '', doorW: s.doorW ?? '', areaOv: s.areaOv ?? '', perimOv: s.perimOv ?? '', budget: s.budget ?? '' }
    : { name: '', icon: 'home', kind: 'room', l: '', w: '', h: '2.7', doorW: '0.9', areaOv: '', perimOv: '', budget: '' };
  openOverlay({ type: 'sheet', kind: 'space', id, draft, adv: !!(draft.areaOv || draft.perimOv), ...extra }, { replace: !!extra.replace });
}

function openTaskSheet({ id, spaceId, spacePick = false, kind } = {}) {
  const d = getDerived();
  const t = id && state.data[id];
  const info = id && d.taskInfo.get(id);
  const sp = spaceId || curSpaceId() || d.spaces[0]?.space.id || '';
  const defKind = kind || (d.spaceById.get(sp)?.kind === 'category' ? 'item' : 'work');
  const draft = t
    ? { title: t.title, kind: info?.kind || 'work', spaceId: t.spaceId, icon: t.icon || '', spot: t.spot || '', due: t.due || '', work: { mode: t.work?.mode || 'fixed', price: t.work?.price ?? '' }, note: t.note || '' }
    : { title: '', kind: defKind, spaceId: sp, icon: '', spot: '', due: '', work: { mode: 'fixed', price: '' }, note: '' };
  openOverlay({ type: 'sheet', kind: 'task', id, draft, spacePick });
}

function openOptionSheet({ id, taskId, pickTask = false } = {}) {
  const d = getDerived();
  const o = id && state.data[id];
  let draft;
  if (o) {
    draft = {
      taskId: o.taskId, newTask: { title: '', spaceId: '', kind: 'item' }, title: o.title, desc: o.desc || '', store: o.store || '', url: o.url || '',
      imageId: o.imageId || '', imageUrl: o.imageUrl || '', note: o.note || '',
      calc: JSON.parse(JSON.stringify(o.calc || defaultCalc('unit'))),
      extras: JSON.parse(JSON.stringify(o.extras || [])), _newMedia: [],
    };
  } else {
    const t = taskId && d.taskInfo.get(taskId);
    draft = {
      taskId: taskId || '', newTask: { title: '', spaceId: curSpaceId() || d.spaces[0]?.space.id || '', kind: 'item' },
      title: '', desc: '', store: '', url: '', imageId: '', imageUrl: '', note: '',
      calc: t?.kind === 'work' ? defaultCalc('area') : unitCalc('', 1), extras: [], _newMedia: [],
    };
  }
  openOverlay({ type: 'sheet', kind: 'option', id, draft, pickTask, busy: false });
}

function openQuickSheet({ spaceId, imageId = '', thenPlace = null, replace = false } = {}) {
  const d = getDerived();
  const sp = spaceId || curSpaceId() || d.spaces.find((s) => s.space.kind === 'category')?.space.id || d.spaces[0]?.space.id || '';
  openOverlay({
    type: 'sheet', kind: 'quick', thenPlace, busy: false,
    draft: { title: '', spaceId: sp, spot: '', mode: 'chosen', price: '', qty: '1', store: '', desc: '', url: '', imageId, imageUrl: '', _newMedia: imageId ? [imageId] : [] },
  }, { replace });
}

function confirmSheet(title, text, confirmAct, confirmLabel, data = {}) {
  openOverlay({ type: 'sheet', kind: 'confirm', title, text, confirmAct, confirmLabel, ...data });
}

function openEditor(opts = {}) {
  const d = getDerived();
  const ed = pl.newEditor(d);
  if (opts.tool) ed.tool = opts.tool;
  if (opts.pendingTask) ed.pendingTask = opts.pendingTask;
  openOverlay({ type: 'full', kind: 'editor', ed });
}

// ── Файли (камера / галерея / план / імпорт) ──
export async function handleFile(file) {
  const kind = ui.pickFor;
  ui.pickFor = null;
  if (!file) return;
  try {
    if (kind === 'plan') {
      toast('Обробляю план…');
      const data = await compress(file, { maxDim: 1800, quality: 0.82 });
      const id = uid();
      await putMedia(id, data);
      const old = state.data.plan?.imageId;
      setPlan({ imageId: id, aspect: await imgAspect(data) });
      if (old) dropMedia(old);
      ui.planEdit = true;
      toast('План додано — тапніть на кімнати, щоб розставити маркери');
    } else if (kind === 'option') {
      const o = ui.overlay;
      if (!o?.draft) return;
      const m = await saveBlobAsMedia(file);
      const prev = o.draft.imageId;
      if (prev && o.draft._newMedia.includes(prev)) { dropMedia(prev); o.draft._newMedia = o.draft._newMedia.filter((x) => x !== prev); }
      o.draft.imageId = m.id; o.draft.imageUrl = '';
      o.draft._newMedia.push(m.id);
      requestRender();
    } else if (kind === 'quick') {
      const m = await saveBlobAsMedia(file);
      openQuickSheet({ imageId: m.id });
    }
  } catch (e) { toast(e.message || 'Не вдалося обробити файл'); }
}

export async function handleImport(file) {
  if (!file) return;
  try {
    const count = await importAll(JSON.parse(await file.text()));
    toast(`Імпортовано записів: ${count}`);
  } catch (e) { toast(e.message || 'Не вдалося імпортувати'); }
}

function pickFile(kind, src) {
  ui.pickFor = kind;
  $(src === 'cam' ? 'file-cam' : 'file-gal').click();
}

// Рух по статусах: спільна логіка для кнопок етапу.
function celebrate(spaceId, wasProgress) {
  const info = getDerived().spaceInfo.get(spaceId);
  if (info && wasProgress < 1 && info.progress >= 1) toast(`«${info.space.name}» — усе готово!`, { ms: 4200 });
}
function changeStatus(id, v, { quiet = false } = {}) {
  const d0 = getDerived();
  const ti = d0.taskInfo.get(id);
  if (!ti) return;
  const was = d0.spaceInfo.get(ti.space.id)?.progress ?? 0;
  const patch = { status: v };
  if (ti.seq.includes('bought') && ti.seq.indexOf(v) < ti.seq.indexOf('bought')) patch.spentActual = null;
  if (v === 'later') patch.laterFrom = ti.status;
  update(id, patch);
  tap(v === 'later' ? 8 : 16);
  if (!quiet) log(`«${ti.task.title}» → ${STATUS[v].label}`, ref(ti.task));
  celebrate(ti.space.id, was);
}

// ── Дії ──
export const actions = {
  // навігація
  go: (el) => { tap(4); if (ui.overlays.length) closeAll(() => go(el.dataset.to)); else go(el.dataset.to); },
  back: () => { if (ui.hasPrev) history.back(); else go('/spaces'); },
  'open-task': (el) => {
    const t = state.data[el.dataset.id];
    if (!t) return;
    const run = () => { ui.expanded[t.id] = true; focusTask(t.id, 'center', 380); go(`/space/${t.spaceId}`); requestRender(); };
    if (ui.overlays.length) closeAll(run); else run();
  },

  // загальне
  set: (el) => { setPath(ui.overlay.draft, el.dataset.path, el.dataset.val); tap(4); requestRender(); },
  'toggle-ui': (el) => { ui[el.dataset.k] = !ui[el.dataset.k]; requestRender(); },
  'toggle-sheet': (el) => { ui.overlay[el.dataset.k] = !ui.overlay[el.dataset.k]; requestRender(); },
  'close-overlay': () => closeOverlay(),
  'toast-act': (el) => {
    const t = ui.toasts.find((x) => x.id === +el.dataset.id);
    t?.action?.fn();
    dismissToast(+el.dataset.id);
  },
  'img-open': (el) => openOverlay({ type: 'lightbox', src: el.dataset.src }),
  'apply-update': () => { ui.updating = true; ui.waitingSW?.postMessage('skipWaiting'); },
  tasklist: (el) => openOverlay({ type: 'sheet', kind: 'tasklist', status: el.dataset.status }),
  acts: () => openOverlay({ type: 'sheet', kind: 'acts' }),
  'copy-text': async (el) => { try { await navigator.clipboard.writeText(el.dataset.text); toast('Скопійовано'); } catch { toast('Не вдалося скопіювати'); } },
  'share-invite': async (el) => {
    const url = el.dataset.text;
    if (navigator.share) { try { await navigator.share({ title: 'RenoWise', text: 'Приєднуйся до нашого дому в RenoWise', url }); } catch { /* скасовано */ } return; }
    try { await navigator.clipboard.writeText(url); toast('Посилання скопійовано'); } catch { toast(url); }
  },

  // FAB
  fab: () => { ui.fabOpen = !ui.fabOpen; tap(6); requestRender(); },
  'new-space': () => openSpaceSheet(),
  'quick-item': (el) => { ui.fabOpen = false; if (!getDerived().spaces.length) { toast('Спочатку створіть простір'); openSpaceSheet(); return; } openQuickSheet({ spaceId: el?.dataset?.id }); },
  'new-task': () => {
    ui.fabOpen = false;
    if (!getDerived().spaces.length) { toast('Спочатку створіть простір'); openSpaceSheet(); return; }
    openTaskSheet({ spacePick: true });
  },
  'new-option': () => {
    ui.fabOpen = false;
    if (!getDerived().spaces.length) { toast('Спочатку створіть простір'); openSpaceSheet(); return; }
    openOptionSheet({ pickTask: true });
  },
  'quick-cam': () => {
    ui.fabOpen = false;
    if (!getDerived().spaces.length) { toast('Спочатку створіть простір'); openSpaceSheet(); return; }
    pickFile('quick', 'cam');
  },

  // простори
  'spaces-filter': (el) => { ui.spacesFilter = el.dataset.v; requestRender(); },
  'edit-space': (el) => openSpaceSheet(el.dataset.id),
  'save-space': () => {
    const o = ui.overlay, dr = o.draft, name = dr.name.trim();
    if (!name) return toast('Введіть назву простору');
    const room = dr.kind !== 'category';
    const f = {
      name, icon: dr.icon, kind: dr.kind,
      l: room ? n(dr.l) : '', w: room ? n(dr.w) : '', h: room ? n(dr.h) : '', doorW: room ? n(dr.doorW) : '',
      areaOv: room ? n(dr.areaOv) : '', perimOv: room ? n(dr.perimOv) : '', budget: n(dr.budget),
    };
    let id = o.id;
    if (id) update(id, f); else { id = create('space', f).id; log(`новий простір «${name}»`); }
    tap(12);
    if (o.thenPin) {
      create('pin', { spaceId: id, x: o.thenPin.x, y: o.thenPin.y });
      closeOverlay();
    } else if (o.thenEdAssign) {
      const ov = editorOv();
      if (ov) { pl.edAssign(ov.ed, id); autoApplyDims(ov.ed, id); }
      closeOverlay();
    } else if (!o.id) {
      closeAll(() => go(`/space/${id}`));
    } else closeOverlay();
  },
  'del-space': (el) => {
    const id = el.dataset.id;
    const name = state.data[id]?.name;
    closeAll(() => {
      remove(id);
      go('/spaces');
      toast(`«${name}» видалено`, { action: { label: 'Скасувати', fn: undo } });
    });
  },

  // завдання
  'toggle-task': (el) => {
    const id = el.dataset.id;
    ui.expanded[id] = !ui.expanded[id];
    if (ui.expanded[id]) focusTask(id, 'nearest', 360);
    tap(6);
    requestRender();
  },
  'new-task-in': (el) => openTaskSheet({ spaceId: el.dataset.id }),
  'edit-task': (el) => openTaskSheet({ id: el.dataset.id }),
  'save-task': () => {
    const o = ui.overlay, dr = o.draft, title = dr.title.trim();
    if (!title) return toast('Введіть назву завдання');
    if (!dr.spaceId) return toast('Оберіть простір');
    const f = {
      title, kind: dr.kind, spaceId: dr.spaceId, icon: dr.icon || suggestIcon(title) || '', spot: dr.spot.trim(), due: dr.due || '',
      work: { mode: dr.kind === 'work' ? dr.work.mode || 'fixed' : 'fixed', price: dr.kind === 'todo' ? 0 : n(dr.work.price) }, note: dr.note.trim(),
    };
    let id = o.id;
    if (id) update(id, f);
    else {
      id = create('task', { ...f, status: dr.kind === 'todo' ? 'open' : 'search', selectedId: null, spentActual: null }).id;
      log(`${dr.kind === 'item' ? 'нова річ' : dr.kind === 'todo' ? 'нова справа' : 'нове завдання'} «${title}»`, { type: 'task', id });
    }
    tap(12);
    ui.expanded[id] = true;
    const sp = dr.spaceId;
    closeAll(() => {
      if (curSpaceId() !== sp) go(`/space/${sp}`);
      focusTask(id, 'center', 300);
      requestRender();
    });
  },
  'del-task': (el) => {
    const id = el.dataset.id, t = state.data[id];
    const run = () => { remove(id); toast(`«${t?.title}» видалено`, { action: { label: 'Скасувати', fn: undo } }); };
    if (ui.overlay) closeOverlay(run); else run();
  },
  'set-status': (el) => {
    const id = el.dataset.id, v = el.dataset.v;
    const ti = getDerived().taskInfo.get(id);
    if (!ti) return;
    if (v === 'back') { const back = ti.task.laterFrom && ti.seq.includes(ti.task.laterFrom) ? ti.task.laterFrom : ti.seq[0]; changeStatus(id, back); return; }
    if (v === 'later') { changeStatus(id, 'later'); return; }
    if (!ti.seq.includes(v) || (v === ti.status && !ti.later)) return;
    if (ti.kind !== 'todo' && ti.options.length > 0 && !ti.selected && ti.seq.indexOf(v) >= 1) { toast('Спершу оберіть варіант нижче'); return; }
    changeStatus(id, v);
  },
  'set-actual': (el) => {
    const v = el.value.trim();
    update(el.dataset.id, { spentActual: v === '' ? null : num(v) });
  },

  // варіанти
  'view-opt': (el) => { ui.viewing[el.dataset.task] = el.dataset.opt; tap(5); requestRender(); },
  'select-opt': (el) => {
    const taskId = el.dataset.task, optId = el.dataset.opt;
    const t = state.data[taskId];
    if (!t || t.selectedId === optId) return;
    const prev = t.selectedId || null, prevStatus = t.status;
    const before = getDerived().taskInfo.get(taskId);
    const patch = { selectedId: optId };
    if (before && (before.status === 'search' || before.status === 'open')) patch.status = 'chosen';
    update(taskId, patch);
    tap([12, 40, 14]);
    const after = getDerived().taskInfo.get(taskId);
    const diff = after.total - (before?.total ?? 0);
    const title = state.data[optId]?.title;
    log(`обрано «${title}»${after.optionCost > 0 ? ` · ${money(after.optionCost)}` : ''} для «${t.title}»`, ref(t));
    toast(`Обрано «${title}»${Math.abs(diff) >= 1 && before?.selected ? ` · ${diff > 0 ? '+' : '−'}${money(Math.abs(diff))} до бюджету` : ''}`,
      { action: { label: 'Скасувати', fn: () => update(taskId, { selectedId: prev, status: prevStatus }) } });
  },
  'new-opt-in': (el) => openOptionSheet({ taskId: el.dataset.id }),
  'edit-opt': (el) => openOptionSheet({ id: el.dataset.id }),
  'del-opt': (el) => {
    const id = el.dataset.id, o = state.data[id];
    const t = o && state.data[o.taskId];
    const wasSel = t?.selectedId === id;
    const run = () => {
      remove(id);
      if (wasSel) update(t.id, { selectedId: null, ...(['chosen', 'ordered'].includes(t.status) ? { status: 'search' } : {}) });
      toast(`«${o?.title}» видалено`, { action: { label: 'Скасувати', fn: () => { undo(); if (wasSel) update(t.id, { selectedId: id, status: t.status }); } } });
    };
    if (ui.overlay) closeOverlay(run); else run();
  },
  'calc-type': (el) => {
    const dr = ui.overlay.draft, price = dr.calc.price;
    dr.calc = { ...defaultCalc(el.dataset.v), price };
    tap(5); requestRender();
  },
  'x-calc-type': (el) => {
    const x = ui.overlay.draft.extras[+el.dataset.i], price = x.calc.price;
    x.calc = { ...defaultCalc(el.dataset.v), price };
    tap(5); requestRender();
  },
  'add-extra': () => {
    ui.overlay.draft.extras.push({ id: uid(), title: '', store: '', calc: defaultCalc('area') });
    requestRender();
  },
  'del-extra': (el) => { ui.overlay.draft.extras.splice(+el.dataset.i, 1); requestRender(); },
  'pick-photo': (el) => pickFile('option', el.dataset.src),
  'drop-photo': () => {
    const dr = ui.overlay.draft;
    if (dr.imageId && dr._newMedia.includes(dr.imageId)) { dropMedia(dr.imageId); dr._newMedia = dr._newMedia.filter((x) => x !== dr.imageId); }
    dr.imageId = ''; dr.imageUrl = '';
    requestRender();
  },
  'fetch-og': async () => {
    const o = ui.overlay, dr = o.draft, url = dr.url.trim();
    if (!/^https?:\/\//i.test(url)) return toast('Вставте повне посилання, що починається з https://');
    if (!dr.store.trim()) dr.store = storeFromUrl(url);
    o.busy = true; requestRender();
    try {
      const og = await fetchOG(url, prefs.og);
      if (!dr.title.trim() && og.title) dr.title = og.title.slice(0, 120);
      if (!(dr.desc || '').trim() && og.description) dr.desc = og.description.replace(/\s+/g, ' ').slice(0, 110);
      if (og.image) {
        const m = await localizeImage(og.image, prefs.img);
        if (dr.imageId && dr._newMedia.includes(dr.imageId)) dropMedia(dr.imageId);
        if (m) { dr.imageId = m.id; dr.imageUrl = ''; dr._newMedia.push(m.id); } else { dr.imageId = ''; dr.imageUrl = og.image; }
      }
      toast(og.image || og.title ? 'Дані підтягнуто. Фото не те? Натисніть «Обрізати» або завантажте своє' : 'На сторінці не знайдено фото чи назви');
    } catch (e) {
      toast(e.name === 'AbortError' ? 'Сервіс не відповів вчасно' : (e.message || 'Не вдалося підтягнути дані'));
    } finally { o.busy = false; requestRender(); }
  },
  'save-opt': () => {
    const o = ui.overlay, dr = o.draft;
    let taskId = dr.taskId;
    if (!taskId) return toast('Оберіть завдання');
    if (!dr.title.trim()) return toast('Введіть назву варіанта');
    let fresh = false;
    if (taskId === '__new__') {
      if (!dr.newTask.title.trim()) return toast('Введіть назву нового завдання');
      const k = dr.newTask.kind;
      taskId = create('task', {
        spaceId: dr.newTask.spaceId, title: dr.newTask.title.trim(), kind: k, icon: suggestIcon(dr.newTask.title) || '', spot: '', due: '',
        work: { mode: 'fixed', price: 0 }, note: '', status: 'search', selectedId: null, spentActual: null,
      }).id;
      fresh = true;
    }
    const ti = getDerived().taskInfo.get(taskId);
    const simple = (ti?.kind || dr.newTask.kind) !== 'work';
    const rec = {
      taskId, title: dr.title.trim(), desc: (dr.desc || '').trim(), store: dr.store.trim(), url: dr.url.trim(),
      imageId: dr.imageId || '', imageUrl: dr.imageUrl || '', note: dr.note.trim(),
      calc: simple ? unitCalc(dr.calc.price, dr.calc.qty) : normCalc(dr.calc),
      extras: simple ? [] : dr.extras.filter((x) => x.title.trim() || num(x.calc.price)).map((x) => ({
        id: x.id, title: x.title.trim() || 'Розхідник', store: (x.store || '').trim(), calc: normCalc(x.calc),
      })),
    };
    let id = o.id;
    if (id) update(id, rec);
    else {
      id = create('option', rec).id;
      const t = state.data[taskId];
      const noOptions = !getDerived().taskInfo.get(taskId)?.options.filter((x) => x.opt.id !== id).length;
      if (!t.selectedId && (fresh || (noOptions && t.status !== 'search' && t.status !== 'open'))) {
        update(taskId, { selectedId: id, status: ['search', 'open'].includes(t.status) ? 'chosen' : t.status });
      }
      log(`додано варіант «${rec.title}» до «${t.title}»`, ref(t));
    }
    o.saved = true;
    tap(12);
    ui.viewing[taskId] = id;
    ui.expanded[taskId] = true;
    const sp = state.data[taskId].spaceId;
    closeAll(() => {
      if (curSpaceId() !== sp) go(`/space/${sp}`);
      focusTask(taskId, 'center', 300);
      requestRender();
    });
  },
  'save-quick': () => {
    const o = ui.overlay, dr = o.draft, title = dr.title.trim();
    if (!title) return toast('Що саме купити?');
    if (!dr.spaceId) return toast('Оберіть простір');
    const search = dr.mode === 'search';
    const task = create('task', {
      spaceId: dr.spaceId, title, kind: 'item', icon: suggestIcon(title) || '', spot: dr.spot.trim(), due: '',
      work: { mode: 'fixed', price: 0 }, note: '', status: search ? 'search' : 'chosen', selectedId: null, spentActual: null,
    });
    const opt = create('option', {
      taskId: task.id, title, desc: dr.desc.trim(), store: dr.store.trim() || storeFromUrl(dr.url.trim()), url: dr.url.trim(),
      imageId: dr.imageId || '', imageUrl: dr.imageUrl || '', note: '', calc: unitCalc(dr.price, dr.qty), extras: [],
    });
    if (!search) update(task.id, { selectedId: opt.id });
    log(`нова річ «${title}»${num(dr.price) ? ` · ${money(num(dr.price) * (num(dr.qty) || 1))}` : ''}`, ref(task));
    o.saved = true;
    tap(14);
    ui.expanded[task.id] = true;
    if (o.thenPlace) {
      const ov = editorOv();
      if (ov) pl.edPlaceItem(ov.ed, task.id, o.thenPlace.x, o.thenPlace.y);
      closeOverlay();
      return;
    }
    closeAll(() => {
      if (curSpaceId() !== dr.spaceId) go(`/space/${dr.spaceId}`);
      focusTask(task.id, 'center', 300);
      requestRender();
    });
  },

  // обрізання фото
  'crop-photo': async () => {
    const o = ui.overlay, dr = o.draft;
    let data = dr.imageId ? state.media[dr.imageId] : null;
    try {
      if (!data && dr.imageUrl) {
        toast('Завантажую фото для обрізання…');
        data = await imageToData(dr.imageUrl, prefs.img);
        if (!data) return toast('Сайт не дозволяє скопіювати це фото. Завантажте скріншот чи власне фото');
      }
      if (!data) return;
      const st = await cropState(data);
      openOverlay({ type: 'sheet', kind: 'crop', ...st, parentIdx: ui.overlays.indexOf(o) });
    } catch (e) { toast(e.message); }
  },
  'crop-aspect': (el) => { cropAspect(ui.overlay, +el.dataset.v); requestRender(); },
  'crop-rotate': async () => { await cropRotate(ui.overlay); requestRender(); },
  'crop-done': async () => {
    const c = ui.overlay;
    c.busy = true; requestRender();
    try {
      const res = await cropApply(c);
      const parent = ui.overlays[c.parentIdx];
      if (parent?.draft) {
        const dr = parent.draft;
        if (dr.imageId && dr._newMedia.includes(dr.imageId)) { dropMedia(dr.imageId); dr._newMedia = dr._newMedia.filter((x) => x !== dr.imageId); }
        dr.imageId = res.id; dr.imageUrl = ''; dr._newMedia.push(res.id);
      }
      closeOverlay();
    } catch (e) { c.busy = false; toast(e.message || 'Не вдалося обрізати'); requestRender(); }
  },

  // покупки
  'wallet-set': (el) => { prefs.wallet = el.value.trim(); savePrefs(); requestRender(); },
  'shop-filter': (el) => { ui.shopStore = el.dataset.store || null; requestRender(); },
  'shop-open': (el) => { ui.shopStore = el.dataset.store || null; go('/shop'); },
  'shop-toggle': (el) => {
    const ti = getDerived().taskInfo.get(el.dataset.id);
    if (!ti) return;
    if (ti.status === 'done') return toast('Завдання вже виконано');
    changeStatus(ti.task.id, ti.idx >= ti.seq.indexOf('bought') ? 'chosen' : 'bought');
  },

  // план: вигляд
  'plan-kind': (el) => { ui.planKind = el.dataset.v; requestRender(); },
  'plan-mode': (el) => { ui.planMode = el.dataset.v; requestRender(); },
  'plan-zoom': (el) => { ui.planZoom = Math.min(3, Math.max(1, ui.planZoom + (+el.dataset.v) * 0.5)); requestRender(); },
  'plan-items': () => { ui.planItems = !ui.planItems; requestRender(); },
  'room-tap': (el) => {
    const r = state.data[el.dataset.id];
    if (!r) return;
    if (r.spaceId) { tap(8); go(`/space/${r.spaceId}`); } else toast('Ця кімната без простору — призначте його в редакторі');
  },
  'ipin-tap': (el) => { const p = state.data[el.dataset.id]; if (p) actions['open-task']({ dataset: { id: p.taskId } }); },
  'plan-place': (el) => { ui.planKind = 'draw'; go('/plan'); openEditor({ tool: 'item', pendingTask: el.dataset.id }); },

  // план: редактор
  'plan-edit-open': () => openEditor(),
  'plan-autofill': () => {
    const rooms = pl.autoLayout(getDerived().spaces);
    bulkPut(rooms.map((r) => ({ id: r.id, type: 'room', spaceId: r.spaceId, pts: ptsToStr(r.pts) })));
    toast('Кімнати розкладено за розмірами — підправте розташування');
    openEditor();
  },
  'ed-tool': (el) => { const ed = editorOv().ed; pl.edToolSet(ed, el.dataset.v); ed.pendingTask = null; requestRender(); },
  'ed-undo': () => { pl.edUndo(editorOv().ed); requestRender(); },
  'ed-redo': () => { pl.edRedo(editorOv().ed); requestRender(); },
  'ed-zoom': (el) => pl.edZoom(editorOv().ed, +el.dataset.v > 0 ? 1 / 1.35 : 1.35),
  'ed-fit': () => pl.edFit(editorOv().ed),
  'ed-delete': () => { pl.edDelete(editorOv().ed); requestRender(); },
  'ed-assign': () => openOverlay({ type: 'sheet', kind: 'pick-space' }),
  'ed-pick-space': (el) => {
    const ed = editorOv().ed, sid = el.dataset.space;
    pl.edAssign(ed, sid);
    if (sid) autoApplyDims(ed, sid);
    closeOverlay();
  },
  'ed-newspace': () => openSpaceSheet(null, { thenEdAssign: true, replace: true }),
  'ed-apply': () => {
    const ed = editorOv().ed, r = pl.edSelected(ed);
    if (r?.spaceId) { applyDims(ed, r.spaceId); }
  },
  'ed-poly-done': () => { const ed = editorOv().ed; const r = pl.edPolyFinish(ed); if (r) ui.edNeedAssign = r.id; requestRender(); },
  'ed-poly-undo': () => { pl.edPolyUndo(editorOv().ed); requestRender(); },
  'ed-autofill': () => { const k = pl.edAutoFill(editorOv().ed, getDerived()); toast(k ? `Додано кімнат: ${k}` : 'Усі простори вже на кресленні'); requestRender(); },
  'ed-rect-w': (el) => { const ed = editorOv().ed; const r = pl.edSelected(ed); if (r) { pl.edSetRect(ed, el.value, pl.bbox(r.pts).h); requestRender(); } },
  'ed-rect-h': (el) => { const ed = editorOv().ed; const r = pl.edSelected(ed); if (r) { pl.edSetRect(ed, pl.bbox(r.pts).w, el.value); requestRender(); } },
  'ed-pick-task': (el) => {
    const ed = editorOv().ed, at = ui.overlay.at || ui.lastPlace;
    if (at) pl.edPlaceItem(ed, el.dataset.id, at.x, at.y);
    closeOverlay();
  },
  'ed-newitem': () => { const at = ui.overlay.at; openQuickSheet({ thenPlace: at, replace: true }); },
  'ed-done': () => {
    const ed = editorOv().ed;
    pl.commitEditor(ed);
    tap(14);
    closeOverlay(() => toast('План збережено'));
  },
  'ed-cancel': () => {
    const ed = editorOv().ed;
    if (!ed.changed) { closeOverlay(); return; }
    confirmSheet('Відкинути зміни?', 'Усе, що ви намалювали в цьому сеансі, буде втрачено.', 'ed-discard', 'Відкинути');
  },
  'ed-discard': () => closeAll(),

  // імідж-план (фото)
  'plan-edit': () => { ui.planEdit = !ui.planEdit; tap(8); requestRender(); },
  'plan-upload': (el) => pickFile('plan', el.dataset.src),
  'plan-remove': () => confirmSheet('Прибрати фото плану?', 'Зображення плану й усі маркери буде видалено. Простори та завдання залишаться.', 'plan-remove-yes', 'Прибрати'),
  'plan-remove-yes': () => closeOverlay(() => {
    remove('plan');
    toast('План прибрано', { action: { label: 'Скасувати', fn: undo } });
  }),
  'plan-canvas': (el, e) => {
    if (!ui.planEdit) return;
    const r = el.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100));
    openOverlay({ type: 'sheet', kind: 'pin', draft: { x: +x.toFixed(2), y: +y.toFixed(2) } });
  },
  'pin-tap': (el) => {
    if (Date.now() - (ui.justDragged || 0) < 350) return;
    const pin = state.data[el.dataset.id];
    if (!pin) return;
    if (ui.planEdit) openOverlay({ type: 'sheet', kind: 'pin', pinId: pin.id, draft: {} });
    else { tap(8); go(`/space/${pin.spaceId}`); }
  },
  'pin-assign': (el) => {
    const o = ui.overlay, spaceId = el.dataset.space;
    if (o.pinId) update(o.pinId, { spaceId });
    else {
      const existing = getDerived().pins.find((p) => p.spaceId === spaceId);
      if (existing) update(existing.id, { x: o.draft.x, y: o.draft.y });
      else create('pin', { spaceId, x: o.draft.x, y: o.draft.y });
    }
    tap(14);
    closeOverlay();
  },
  'pin-newspace': () => { const { x, y } = ui.overlay.draft; openSpaceSheet(null, { thenPin: { x, y }, replace: true }); },
  'pin-del': () => {
    const id = ui.overlay.pinId;
    closeOverlay(() => { remove(id); toast('Маркер видалено', { action: { label: 'Скасувати', fn: undo } }); });
  },
  'pin-open': () => {
    const pin = state.data[ui.overlay.pinId];
    closeAll(() => pin && go(`/space/${pin.spaceId}`));
  },

  // дім і люди
  'home-create': async () => {
    try { await sync.createHome(ui.homeName); ui.homeName = ''; toast('Дім створено. Тепер запросіть мешканців'); } catch (e) { toast(e.message); }
  },
  'home-join': async () => {
    try { await sync.joinHome(ui.joinCode); ui.joinCode = ''; toast('Ви в домі! Зміни інших з’являтимуться тут одразу'); } catch (e) { toast(e.message); }
  },
  'home-invite': async () => {
    try { const code = await sync.createInvite(); openOverlay({ type: 'sheet', kind: 'invite', code }); } catch (e) { toast(e.message); }
  },
  'home-leave': () => confirmSheet('Вийти з дому?', 'Ви перестанете бачити спільні дані й надсилати зміни. Дані на цьому пристрої залишаться.', 'home-leave-yes', 'Вийти'),
  'home-leave-yes': () => closeOverlay(async () => { try { await sync.leaveHome(); toast('Ви вийшли з дому'); } catch (e) { toast(e.message); } }),
  'member-remove': async (el) => { try { await sync.removeMember(el.dataset.uid); toast('Учасника видалено'); } catch (e) { toast(e.message); } },
  'home-rename': async (el) => { try { await sync.renameHome(el.value); } catch (e) { toast(e.message); } },

  // налаштування
  theme: (el) => { prefs.theme = el.dataset.v; savePrefs(); applyTheme(); requestRender(); },
  'cfg-budget': (el) => setCfg({ totalBudget: n(el.value) }),
  'cfg-currency': (el) => { const c = el.value.trim() || '₴'; setCurrency(c); setCfg({ currency: c }); },
  'cfg-og': (el) => { prefs.og = el.value.trim(); savePrefs(); toast(prefs.og ? 'Збережено' : 'Парсинг сторінок вимкнено'); },
  'cfg-img': (el) => { prefs.img = el.value.trim(); savePrefs(); toast(prefs.img ? 'Збережено' : 'Копіювання через посередника вимкнено'); },
  'fb-save': async () => {
    try {
      sync.saveConfig(sync.parseConfig(ui.fbText));
      ui.fbText = '';
      await sync.init();
      toast('Конфіг збережено. Тепер увійдіть через Google');
    } catch (e) { toast(e.message); }
  },
  'fb-forget': () => confirmSheet('Забути конфіг Firebase?', 'Синхронізацію буде вимкнено. Локальні дані залишаться на цьому пристрої.', 'fb-forget-yes', 'Забути'),
  'fb-forget-yes': () => { sync.forgetConfig(); location.reload(); },
  'fb-signin': async () => { try { await sync.signIn(); } catch (e) { toast(e.message); } },
  'fb-signout': () => sync.signOut(),
  'fb-sync': async () => { await sync.syncNow(); toast('Синхронізацію виконано'); },
  'copy-rules': async () => {
    try {
      await navigator.clipboard.writeText(sync.rulesText([sync.sync.user?.email].filter(Boolean)));
      toast('Правила скопійовано');
    } catch { toast('Не вдалося скопіювати — виділіть текст вручну'); }
  },
  export: () => {
    const blob = new Blob([JSON.stringify(exportAll())], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `renowise-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  },
  import: () => $('file-import').click(),
  demo: async () => { await loadDemo(); toast('Демо-дані додано'); go('/'); },
  'quick-rooms': () => { quickRooms(); toast('Типові кімнати створено'); go('/spaces'); },
  wipe: () => confirmSheet('Видалити всі дані?', 'Усі простори, завдання, варіанти й план будуть видалені (на всіх синхронізованих пристроях). Перед цим зробіть експорт.', 'wipe-yes', 'Видалити все'),
  'wipe-yes': () => closeOverlay(async () => { await wipe(); toast('Усі дані видалено'); go('/'); }),
  install: async () => { const e = ui.installEvt; if (!e) return; e.prompt(); await e.userChoice; ui.installEvt = null; requestRender(); },
};

// Розміри кімнат із креслення → поля простору (застосовуються при «Готово»).
function applyDims(ed, spaceId, quiet = false) {
  const info = getDerived().spaceInfo.get(spaceId);
  if (!info) return;
  const rooms = ed.rooms.filter((r) => r.spaceId === spaceId);
  const dims = pl.dimsFromRooms(rooms, num(info.space.doorW));
  if (!dims) return;
  (ed.apply ||= {})[spaceId] = dims;
  ed.changed = true;
  if (!quiet) toast(dims.l ? `«${info.space.name}»: ${dims.l} × ${dims.w} м` : `«${info.space.name}»: площа ${dims.areaOv} м²`);
  requestRender();
}
function autoApplyDims(ed, spaceId) {
  const info = getDerived().spaceInfo.get(spaceId);
  if (info && !(info.vars.S > 0) && info.space.kind !== 'category') applyDims(ed, spaceId);
}

// Прив'язка полів форми до чернетки оверлею: data-bind="calc.price"
export function applyBind(el) {
  const o = ui.overlay;
  if (!o?.draft) return;
  const v = el.type === 'checkbox' ? el.checked : el.value;
  if (getPath(o.draft, el.dataset.bind) === v) return;
  setPath(o.draft, el.dataset.bind, v);
  requestRender();
}
