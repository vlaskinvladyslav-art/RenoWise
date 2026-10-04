// Спільні UI-компоненти (повертають безпечні html-фрагменти).
import { html, raw, esc, money, fmt, pct, plural, initials } from './util.js';
import { icon, iconKey } from './icons.js';
import { state, mediaSrc } from './store.js';
import { STATUS } from './model.js';
import { personOf } from './identity.js';

export const ui = state.ui;

// data-атрибути з об'єкта: da({id: 5}) → data-id="5"
export const da = (o = {}) => raw(Object.entries(o).filter(([, v]) => v != null)
  .map(([k, v]) => `data-${k}="${esc(v)}"`).join(' '));

// Число, яке анімується від попереднього значення до нового (див. app.js → animateCounters).
export const formatCount = (n, kind) => (kind === 'pct' ? `${n}%` : kind === 'int' ? fmt(n) : money(n));
export const counter = (v, kind = 'money', cls = '') => {
  const n = Math.round(v || 0);
  return html`<span class="num ${cls}" data-count="${n}" data-fmt="${kind}">${formatCount(n, kind)}</span>`;
};

export const bar = (p, cls = '') => html`<div class="bar ${cls}"><i style="width:${Math.round(p * 10) / 10}%"></i></div>`;

export const ring = (p, size = 38, stroke = 4) => {
  const c = size / 2, r = (size - stroke) / 2;
  return html`<svg class="ring ${p <= 0 ? 'z' : ''}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle class="ring-bg" cx="${c}" cy="${c}" r="${r}" stroke-width="${stroke}"/>
    <circle class="ring-fg" cx="${c}" cy="${c}" r="${r}" stroke-width="${stroke}" pathLength="100"
      stroke-dasharray="${Math.round(Math.max(0, Math.min(1, p)) * 100)} 100" transform="rotate(-90 ${c} ${c})"/>
  </svg>`;
};

// Іконка простору в плитці (підтримує й старі емодзі зі збережених даних).
export const spaceIcon = (space, size = 22) => icon(iconKey(space?.icon), size);

// Картинка: локальне фото (blob) або віддалене посилання.
export const imgSrc = (o) => mediaSrc(o?.imageId) || o?.imageUrl || '';
export const pic = (src, cls = '') => (src
  ? html`<img class="${cls}" src="${src}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
  : '');

// Мініатюра речі: фото або іконка в кольоровій плитці.
export const thumb = (src, iconName, cls = '', size = 24) => (src
  ? html`<span class="thumb ${cls}">${pic(src)}</span>`
  : html`<span class="thumb ph ${cls}">${icon(iconName || 'box', size)}</span>`);

export const statusChip = (status, { sm = false } = {}) => {
  const s = STATUS[status] || STATUS.search;
  return html`<span class="schip ${sm ? 'sm' : ''} st-${status}">${icon(s.icon, sm ? 12 : 14)}${s.label}</span>`;
};

// Аватар людини з дому: фото Google або ініціали на кольоровому тлі.
export const avatar = (uid, size = 26, nameFallback = '') => {
  const p = personOf(uid, nameFallback);
  return p.photo
    ? html`<span class="avatar" style="--s:${size}px" title="${p.name}"><img src="${p.photo}" alt="" referrerpolicy="no-referrer"></span>`
    : html`<span class="avatar" style="--s:${size}px;--c:${p.color}" title="${p.name}">${initials(p.name)}</span>`;
};

export const empty = (art, title, text, actions = '') => html`
  <div class="empty rise">
    <div class="empty-e">${art}</div>
    <h3>${title}</h3>
    <p>${text}</p>
    <div class="empty-a">${actions}</div>
  </div>`;

export function seg(items, active, { act, data = {}, cls = '' } = {}) {
  return html`<div class="seg ${cls}"><i class="seg-pill" data-keep></i>${items.map((it) => html`
    <button type="button" class="seg-b ${String(it.v) === String(active) ? 'on' : ''} ${it.cls || ''}" data-act="${act}" data-v="${it.v}" ${da(data)}>
      ${it.icon ? icon(it.icon, 16) : ''}<span class="seg-t">${it.label}</span>${it.sub ? html`<small>${it.sub}</small>` : ''}
    </button>`)}</div>`;
}

// ── Форми ──
export const inp = ({ bind, value, ph = '', unit = '', num = false, list = '', cls = '', type = '' }) => html`
  <span class="inwrap ${unit ? 'has-unit' : ''}"><input class="in ${cls}" ${type ? raw(`type="${esc(type)}"`) : ''} data-bind="${bind}" value="${value ?? ''}" placeholder="${ph}"
    ${num ? raw('inputmode="decimal" autocomplete="off"') : raw('autocomplete="off"')} ${list ? raw(`list="${esc(list)}"`) : ''}>${unit ? html`<em>${unit}</em>` : ''}</span>`;

export const select = ({ bind, value, options, cls = '' }) => html`
  <select class="in sel ${cls}" data-bind="${bind}" data-value="${value ?? ''}">${Object.entries(options).map(([v, l]) => html`
    <option value="${v}" ${String(v) === String(value ?? '') ? raw('selected') : ''}>${l}</option>`)}</select>`;

export const fld = (label, control, hint = '', key = '') => html`
  <label class="fld" ${key ? raw(`data-key="${esc(key)}"`) : ''}><span class="fld-l">${label}</span>${control}${hint ? html`<small class="fld-h">${hint}</small>` : ''}</label>`;

export const chipPick = (items, active, path) => html`
  <div class="chips">${items.map((it) => html`
    <button type="button" class="chip-b ${String(it.v) === String(active) ? 'on' : ''}" data-act="set" data-path="${path}" data-val="${it.v}">${it.icon ? icon(it.icon, 16) : ''}${it.label}</button>`)}</div>`;

// Вибір іконки з сітки
export const iconPick = (keys, active, path, hl = '') => html`
  <div class="icon-grid">${keys.map((k) => html`
    <button type="button" class="ig-b ${k === active ? 'on' : ''} ${k === hl && k !== active ? 'hint' : ''}" data-act="set" data-path="${path}" data-val="${k}" aria-label="${k}">${icon(k, 24)}</button>`)}</div>`;

// Блок «заплановано / затверджено / витрачено» (дашборд і простір).
export function budgetBlock({ planned, selected, spent, limit = 0, pending, taskCount, postponed = 0 }) {
  const over = limit > 0 && planned > limit;
  return html`
    <div class="hero-amount">${counter(planned)}</div>
    <div class="hero-sub">заплановано${taskCount != null ? html` · ${taskCount} ${plural(taskCount, 'завдання', 'завдання', 'завдань')}` : ''}${postponed > 0 ? html` · відкладено ${money(postponed)}` : ''}</div>
    <div class="stack" aria-hidden="true"><i class="st-sel" style="width:${pct(selected, planned)}%"></i><i class="st-spent" style="width:${pct(spent, planned)}%"></i></div>
    <div class="stats3">
      <div class="stat"><span class="dot sel"></span><small>Затверджено</small><b>${counter(selected)}</b></div>
      <div class="stat"><span class="dot spent"></span><small>Витрачено</small><b>${counter(spent)}</b></div>
      <div class="stat"><span class="dot pend"></span><small>Не обрано</small><b>${counter(pending)}</b></div>
    </div>
    ${limit > 0 ? html`
      <div class="limit">
        ${bar(pct(planned, limit), over ? 'bad' : '')}
        <span class="${over ? 'bad' : ''}">${over ? `Перевищення ліміту на ${money(planned - limit)}` : `Ліміт ${money(limit)} · залишок ${money(limit - planned)}`}</span>
      </div>` : ''}`;
}
