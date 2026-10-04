// Точка входу: рендер, роутинг, делегування подій, PWA.
import { state, subscribe, load, requestRender, update, dirtyRecords } from './store.js';
import { getDerived } from './derived.js';
import { morph } from './morph.js';
import { html, raw, setCurrency, clamp } from './util.js';
import { icon, brandMark, brandName } from './icons.js';
import { applyTheme } from './prefs.js';
import { ui, formatCount, avatar } from './ui.js';
import * as sync from './sync.js';
import { personOf, memberList } from './identity.js';
import { actions, applyBind, closeOverlay, onPop, toast, handleFile, handleImport, openOverlay } from './actions.js';
import { initPlanner, mountEditor } from './planner.js';
import { mountCrop } from './cropper.js';
import { dashboardView } from './views/dashboard.js';
import { spacesView, spaceView } from './views/spaces.js';
import { planView } from './views/plan.js';
import { shopView } from './views/shop.js';
import { settingsView } from './views/settings.js';
import { overlayView } from './sheets.js';

const $app = document.getElementById('app');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const bootAt = performance.now();

// ── Роутинг (#/…) ──
const TABS = ['dash', 'spaces', 'plan', 'shop', 'settings'];
const TITLES = { dash: 'Огляд', spaces: 'Простори', plan: 'План', shop: 'Покупки', settings: 'Налаштування' };
const NAV = [
  ['dash', '/', 'Огляд', 'home'], ['spaces', '/spaces', 'Простори', 'grid'], ['plan', '/plan', 'План', 'map'],
  ['shop', '/shop', 'Покупки', 'cart'], ['settings', '/settings', 'Ще', 'sliders'],
];

function parseHash() {
  const [, a, b] = (location.hash.replace(/^#/, '') || '/').split('/');
  if (a === 'spaces' || a === 'plan' || a === 'shop' || a === 'settings') return { name: a, params: {} };
  if (a === 'space' && b) return { name: 'space', params: { id: decodeURIComponent(b) } };
  if (a === 'join') return { name: 'join', params: { code: (b || '').toUpperCase() } };
  return { name: 'dash', params: {} };
}
const routeKey = (r) => `${r.name}${r.params?.id ? ':' + r.params.id : ''}`;
const scrollMemo = {};
let restoreY = 0;

function applyRoute(initial = false) {
  const next = parseHash();
  if (next.name === 'join') { // посилання-запрошення: підставляємо код і ведемо в налаштування
    ui.joinCode = next.params.code;
    ui.fbGuide = false;
    location.replace('#/settings');
    setTimeout(() => toast('Код запрошення підставлено — увійдіть через Google й натисніть «Приєднатися»', { ms: 5000 }), 500);
    return;
  }
  const prev = ui.route;
  if (!initial) {
    scrollMemo[routeKey(prev)] = window.scrollY;
    ui.hasPrev = true;
    const dn = next.name === 'space' ? 1 : 0, dp = prev.name === 'space' ? 1 : 0;
    ui.dir = dn > dp ? 'fwd' : dn < dp ? 'back'
      : TABS.indexOf(next.name) >= TABS.indexOf(prev.name) ? 'tab-r' : 'tab-l';
  }
  ui.route = next;
  ui.fabOpen = false;
  restoreY = scrollMemo[routeKey(next)] ?? 0;
  requestRender();
}

// ── Шапка, навігація, FAB, тости ──
function syncChip() {
  const s = sync.sync.status, pend = dirtyRecords().length;
  const m = {
    off: ['cloudOff', 'Локально', 'off'],
    signedout: ['cloudOff', 'Увійти', 'warn'],
    connecting: ['refresh', 'З’єднання', 'warn spin'],
    nohome: ['home', 'Створіть дім', 'warn'],
    online: pend ? ['refresh', 'Збереження', 'warn spin'] : ['cloud', 'Онлайн', 'ok'],
    offline: ['cloudOff', pend ? `Офлайн · ${pend}` : 'Офлайн', 'warn'],
    error: ['alert', 'Помилка', 'bad'],
  }[s] || ['cloudOff', 'Локально', 'off'];
  return html`<button class="chip sync ${m[2]}" data-act="go" data-to="/settings">${icon(m[0], 16)}<span>${m[1]}</span></button>`;
}

function peopleCluster() {
  const list = memberList();
  if (list.length < 2) return '';
  return html`<button class="avs" data-act="go" data-to="/settings" aria-label="Мешканці дому">${list.slice(0, 4).map((m) => avatar(m.uid, 28))}</button>`;
}

function topbar(d) {
  const r = ui.route, isSpace = r.name === 'space';
  const info = isSpace ? d.spaceInfo.get(r.params.id) : null;
  const title = isSpace ? (info ? info.space.name : 'Простір') : TITLES[r.name];
  return html`
    <header class="topbar"><div class="topbar-in ${memberList().length > 1 ? 'has-avs' : ''}">
      ${isSpace ? html`<button class="btn icon ghost back" data-act="back" aria-label="Назад">${icon('chevL', 22)}</button>`
        : html`<button class="logo-btn" data-act="go" data-to="/" aria-label="RenoWise">${brandMark(36)}</button>`}
      ${r.name === 'dash' ? html`<h1 class="brand" data-key="t-dash">${brandName()}</h1>`
        : html`<h1 class="title" data-key="t-${routeKey(r)}">${title}</h1>`}
      <div class="grow"></div>
      ${ui.updateReady ? html`<button class="chip upd" data-act="apply-update">${icon('refresh', 14)}<span>Оновити</span></button>` : ''}
      ${peopleCluster()}
      ${r.name === 'settings' ? '' : syncChip()}
    </div></header>`;
}

function bottomNav(r, d) {
  const active = r.name === 'space' ? 'spaces' : r.name;
  const toBuy = new Set(d.shop.items.filter((i) => !i.bought).map((i) => i.taskId)).size;
  return html`
    <nav class="nav" aria-label="Навігація"><i class="nav-ind" data-keep></i>
      ${NAV.map(([k, to, label, ic]) => html`
        <button class="nav-b ${k === active ? 'on' : ''}" data-act="go" data-to="${to}" aria-label="${label}" ${k === active ? raw('aria-current="page"') : ''}>
          <span class="nav-i">${icon(ic, 22)}${k === 'shop' && toBuy ? html`<em>${toBuy}</em>` : ''}</span><span class="nav-l">${label}</span>
        </button>`)}
    </nav>`;
}

function fabView() {
  const hide = ui.overlays.length > 0 || ui.route.name === 'settings' || (ui.route.name === 'plan' && ui.planEdit);
  const open = ui.fabOpen && !hide;
  const items = [
    ['new-space', 'home', 'Простір'], ['quick-item', 'box', 'Річ або покупка'], ['new-task', 'tools', 'Ремонт / завдання'],
    ['new-option', 'tag', 'Варіант до завдання'], ['quick-cam', 'camera', 'Фото з камери'],
  ];
  return html`
    <div class="fab-wrap ${open ? 'open' : ''} ${hide ? 'hide' : ''}" data-key="fab">
      <div class="fab-scrim" data-act="fab"></div>
      <div class="fab-menu">${items.map(([act, ic, label], i) => html`
        <button class="fab-i" style="--i:${items.length - 1 - i}" data-act="${act}"><span class="fab-l">${label}</span><span class="fab-c">${icon(ic, 20)}</span></button>`)}</div>
      <button class="fab" data-act="fab" aria-label="Додати" aria-expanded="${open}">${icon('plus', 28)}</button>
    </div>`;
}

const toastsView = () => html`
  <div class="toasts" data-key="toasts" aria-live="polite">${ui.toasts.map((t) => html`
    <div class="toast ${t.closing ? 'out' : ''}" data-key="toast-${t.id}"><span>${t.text}</span>
      ${t.action ? html`<button class="toast-a" data-act="toast-act" data-id="${t.id}">${t.action.label}</button>` : ''}</div>`)}</div>`;

function currentView(d) {
  const r = ui.route;
  switch (r.name) {
    case 'spaces': return spacesView(d);
    case 'space': return d.spaceInfo.has(r.params.id) ? spaceView(d, r.params.id) : '';
    case 'plan': return planView(d);
    case 'shop': return shopView(d);
    case 'settings': return settingsView(d);
    default: return dashboardView(d);
  }
}

function shell(d) {
  const r = ui.route;
  return html`
    ${topbar(d)}
    <main class="view" data-key="v-${routeKey(r)}" data-dir="${ui.dir}">${currentView(d)}</main>
    ${bottomNav(r, d)}
    ${fabView()}
    ${overlayView(d)}
    ${toastsView()}`;
}

// ── Рендер ──
let raf = 0;
const schedule = () => { if (!raf) raf = requestAnimationFrame(render); };

function render() {
  raf = 0;
  if (!state.ready) return;
  const d = getDerived();
  setCurrency(d.cfg.currency);

  // Неіснуючий простір (видалили на іншому пристрої) → до списку.
  if (ui.route.name === 'space' && !d.spaceInfo.has(ui.route.params.id)) { location.replace('#/spaces'); return; }

  morph($app, shell(d).s);
  afterRender();
}

let booted = false;
function afterRender() {
  document.body.classList.toggle('locked', ui.overlays.length > 0);
  if (!booted) { // заставка триває щонайменше ~1.1 с, щоб логотип встиг «намалюватись»
    booted = true;
    setTimeout(() => document.body.classList.add('ready'), Math.max(0, 1100 - (performance.now() - bootAt)));
  }
  animateCounters();
  layoutSegs();
  layoutNav();
  mountEditor();
  mountCrop();
  if (restoreY != null) { window.scrollTo(0, restoreY); restoreY = null; }
  if (ui.scrollTo) {
    const { key, block, delay } = ui.scrollTo;
    ui.scrollTo = null;
    setTimeout(() => $app.querySelector(`[data-key="${CSS.escape(key)}"]`)?.scrollIntoView({ block, behavior: reduced ? 'auto' : 'smooth' }), delay);
  }
  // Редактор плану попросив відкрити вибір простору / речі
  if (ui.edNeedAssign) { ui.edNeedAssign = null; if (ui.overlay?.kind === 'editor') actions['ed-assign'](); }
  if (ui.edPlace) { const at = ui.edPlace; ui.edPlace = null; if (ui.overlay?.kind === 'editor') openOverlay({ type: 'sheet', kind: 'pick-task', at }); }
}

// Анімація чисел: від попереднього значення до нового.
function animateCounters() {
  for (const el of $app.querySelectorAll('[data-count]')) {
    const to = +el.dataset.count, kind = el.dataset.fmt;
    if (el._to === to) continue;
    const from = el._to ?? 0;
    el._to = to;
    cancelAnimationFrame(el._raf);
    if (reduced || from === to) { el.textContent = formatCount(to, kind); continue; }
    el.textContent = formatCount(from, kind);
    const t0 = performance.now(), dur = clamp(Math.abs(to - from) / 4, 450, 900);
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - (1 - k) ** 3;
      el.textContent = formatCount(Math.round(from + (to - from) * e), kind);
      if (k < 1) el._raf = requestAnimationFrame(step);
    };
    el._raf = requestAnimationFrame(step);
  }
}

// Слайдер-«пілюля» активного сегмента.
function layoutSegs() {
  for (const seg of $app.querySelectorAll('.seg')) {
    const pill = seg.querySelector(':scope > .seg-pill');
    const on = seg.querySelector(':scope > .seg-b.on');
    if (!pill) continue;
    if (!on) { pill.style.opacity = '0'; continue; }
    pill.style.opacity = '';
    pill.style.setProperty('--x', `${on.offsetLeft}px`);
    pill.style.setProperty('--w', `${on.offsetWidth}px`);
    if (!pill.classList.contains('ready')) requestAnimationFrame(() => pill.classList.add('ready'));
    if (seg.classList.contains('scroll')) {
      const k = on.dataset.opt || on.dataset.v;
      if (seg._on !== k) {
        const first = seg._on === undefined;
        seg._on = k;
        seg.scrollTo({ left: Math.max(0, on.offsetLeft - 16), behavior: first || reduced ? 'auto' : 'smooth' });
      }
    }
  }
}

// Індикатор нижньої навігації: позиція вимірюється по реальній кнопці, тож не «з'їжджає»,
// навіть якщо підписи мають різну ширину.
function layoutNav() {
  const nav = $app.querySelector('.nav');
  const ind = nav?.querySelector('.nav-ind');
  const on = nav?.querySelector('.nav-b.on');
  if (!ind) return;
  if (!on) { ind.style.opacity = '0'; return; }
  ind.style.opacity = '';
  ind.style.setProperty('--x', `${on.offsetLeft}px`);
  ind.style.setProperty('--w', `${on.offsetWidth}px`);
  if (!ind.classList.contains('ready')) requestAnimationFrame(() => ind.classList.add('ready'));
}
addEventListener('resize', () => requestAnimationFrame(() => { layoutSegs(); layoutNav(); }));

// ── Делегування подій ──
let suppress = 0;
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  if (Date.now() < suppress) return;
  const fn = actions[el.dataset.act];
  if (fn) fn(el, e);
});

document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset?.bind) applyBind(el);
  else if (el.dataset?.ui) ui[el.dataset.ui] = el.dataset.ui === 'joinCode' ? el.value.toUpperCase() : el.value;
  else if (el.dataset?.live) actions[el.dataset.live]?.(el, e);
});
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset?.bind) applyBind(el);
  if (el.dataset?.change) actions[el.dataset.change]?.(el, e);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (ui.overlay) closeOverlay(); else if (ui.fabOpen) { ui.fabOpen = false; requestRender(); } }
  if (e.key === 'Enter' && e.target.matches?.('input[data-change]')) e.target.blur();
});

// Файли
document.getElementById('file-cam').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; handleFile(f); });
document.getElementById('file-gal').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; handleFile(f); });
document.getElementById('file-import').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; handleImport(f); });

// Перетягування маркерів на фото-плані (режим редагування)
let drag = null;
document.addEventListener('pointerdown', (e) => {
  const pin = e.target.closest?.('.pin');
  if (!pin || !ui.planEdit) return;
  const canvas = pin.closest('.plan-canvas');
  drag = { id: pin.dataset.id, rect: canvas.getBoundingClientRect(), sx: e.clientX, sy: e.clientY, moved: false, el: pin };
  try { pin.setPointerCapture?.(e.pointerId); } catch { /* синтетична подія */ }
});
document.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) return;
  drag.moved = true;
  const rec = state.data[drag.id];
  if (!rec) return;
  rec.x = +clamp(((e.clientX - drag.rect.left) / drag.rect.width) * 100, 0, 100).toFixed(2);
  rec.y = +clamp(((e.clientY - drag.rect.top) / drag.rect.height) * 100, 0, 100).toFixed(2);
  drag.el.classList.add('dragging');
  requestRender();
});
const endDrag = () => {
  if (!drag) return;
  const rec = state.data[drag.id];
  if (drag.moved && rec) { ui.justDragged = Date.now(); update(drag.id, { x: rec.x, y: rec.y }); }
  drag.el.classList.remove('dragging');
  drag = null;
};
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);

addEventListener('hashchange', () => applyRoute());
addEventListener('popstate', () => { onPop(); });

// ── Мережа і PWA ──
addEventListener('online', () => { ui.online = true; toast('Мережу відновлено'); requestRender(); });
addEventListener('offline', () => { ui.online = false; toast('Ви офлайн — зміни збережуться на пристрої'); requestRender(); });
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); ui.installEvt = e; requestRender(); });
addEventListener('appinstalled', () => { ui.installEvt = null; requestRender(); });

// На localhost service worker вимкнено (інакше застарілий кеш плутає під час розробки, а старий SW може заблокувати сторінку).
// Щоб випробувати офлайн-режим локально, відкрийте http://localhost:5173/?sw
const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const useSW = !isLocal || /[?&]sw\b/.test(location.search);
if (!useSW && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
  caches?.keys().then((ks) => ks.forEach((k) => caches.delete(k))).catch(() => {});
}
if (useSW && 'serviceWorker' in navigator) {
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (ui.updating && !reloaded) { reloaded = true; location.reload(); } });
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const watch = (w) => w?.addEventListener('statechange', () => {
      if (w.state === 'installed' && navigator.serviceWorker.controller) { ui.updateReady = true; ui.waitingSW = w; requestRender(); }
    });
    if (reg.waiting && navigator.serviceWorker.controller) { ui.updateReady = true; ui.waitingSW = reg.waiting; }
    reg.addEventListener('updatefound', () => watch(reg.installing));
  }).catch(() => {});
}

// Хтось із дому змінив план — показуємо сповіщення на льоту.
sync.sync.notify = (rec) => toast(`${personOf(rec.by, rec.name).name}: ${rec.text}`, { ms: 4800 });

// ── Старт ──
subscribe(schedule);
applyTheme();
initPlanner();
applyRoute(true);
load().then(() => { schedule(); sync.init(); });
window.__reno = { state, getDerived, actions }; // для налагодження з консолі
