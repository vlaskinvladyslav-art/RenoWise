// Модальні форми (bottom sheets) і оверлеї: простір, завдання, варіант, швидка річ, обрізання фото,
// маркер, вибір простору/речі для плану, списки за статусами, історія, запрошення, редактор плану.
import { html, raw, money, fmt, STORE_PRESETS, getCurrency } from './util.js';
import { icon, iconKey, ROOM_ICONS, ITEM_ICONS, suggestIcon } from './icons.js';
import { CALC_TYPES, BASES, WORK_MODES, roomVars, calcItem, calcWork, r2 } from './calc.js';
import { KINDS, STATUS } from './model.js';
import { ui, fld, inp, select, chipPick, iconPick, pic, imgSrc, spaceIcon, thumb, statusChip } from './ui.js';
import { editorView } from './planner.js';
import { actRow } from './views/dashboard.js';
import { taskIconKey, taskThumbSrc } from './views/spaces.js';

const frame = (title, body, footer, sub = '') => html`
  <div class="grab"></div>
  <header class="sheet-h"><div><h2>${title}</h2>${sub ? html`<small class="muted">${sub}</small>` : ''}</div>
    <button class="btn icon ghost" data-act="close-overlay" aria-label="Закрити">${icon('x', 20)}</button></header>
  <div class="sheet-b">${body}</div>
  ${footer ? html`<footer class="sheet-f">${footer}</footer>` : ''}`;

export function overlayView(d) {
  return html`${ui.overlays.map((o, i) => html`<div class="ovl" data-key="ov-${i}-${o.kind || o.type}" style="--z:${50 + i * 4}">${one(o, d)}</div>`)}`;
}

function one(o, d) {
  if (o.type === 'lightbox') {
    return html`<div class="lightbox ${o.closing ? 'out' : ''}" data-act="close-overlay"><img src="${o.src}" alt="" referrerpolicy="no-referrer"></div>`;
  }
  if (o.kind === 'editor') return editorView(o, d);
  const f = { space: spaceForm, task: taskForm, option: optionForm, quick: quickForm, crop: cropForm, pin: pinForm, confirm: confirmForm,
    'pick-space': pickSpaceForm, 'pick-task': pickTaskForm, tasklist: taskListForm, acts: actsForm, invite: inviteForm }[o.kind];
  if (!f) return '';
  const { title, body, footer, sub } = f(o, d);
  return html`
    <div class="scrim ${o.closing ? 'out' : ''} ${o.still ? 'still' : ''}" data-act="close-overlay" data-key="scrim"></div>
    <section class="sheet ${o.kind} ${o.closing ? 'out' : ''} ${o.still ? 'still' : ''}" role="dialog" aria-modal="true" data-key="sheet-${o.kind}-${o.id || 'new'}">
      ${frame(title, body, footer, sub)}
    </section>`;
}

const kindItems = Object.entries(KINDS).map(([v, k]) => ({ v, label: k.label, icon: k.icon }));
const spaceOptions = (d) => Object.fromEntries(d.spaces.map((s) => [s.space.id, s.space.name]));
const cur = () => getCurrency();

// ── Простір ──
const SPACE_ICONS = [...new Set([...ROOM_ICONS, 'plug', 'fridge', 'tv', 'lamp', 'sofa', 'plant', 'tools', 'box'])];

function spaceForm(o) {
  const dr = o.draft, room = dr.kind !== 'category', v = roomVars(dr);
  return {
    title: o.id ? 'Змінити простір' : 'Новий простір',
    body: html`
      ${fld('Назва', inp({ bind: 'name', value: dr.name, ph: 'Наприклад, Кухня' }), '', 'f-name')}
      <div class="fsec">Іконка</div>
      ${iconPick(SPACE_ICONS, iconKey(dr.icon), 'icon')}
      <div class="fsec">Тип</div>
      ${chipPick([{ v: 'room', label: 'Кімната', icon: 'home' }, { v: 'category', label: 'Категорія (техніка, меблі…)', icon: 'box' }], dr.kind, 'kind')}
      ${room ? html`
        <div class="fsec">Розміри <small>— з них автоматично рахуються матеріали</small></div>
        <div class="fgrid">
          ${fld('Довжина', inp({ bind: 'l', value: dr.l, unit: 'м', num: true }), '', 'f-l')}
          ${fld('Ширина', inp({ bind: 'w', value: dr.w, unit: 'м', num: true }), '', 'f-w')}
          ${fld('Висота', inp({ bind: 'h', value: dr.h, unit: 'м', num: true }), '', 'f-h')}
          ${fld('Ширина дверей', inp({ bind: 'doorW', value: dr.doorW, unit: 'м', num: true }), '', 'f-d')}
        </div>
        <div class="calcbox"><span><small>Підлога S</small><b>${fmt(v.S, 2)} м²</b></span>
          <span><small>Периметр P</small><b>${fmt(v.P, 2)} м</b></span><span><small>Стіни</small><b>${fmt(v.Sw, 2)} м²</b></span></div>
        <button type="button" class="link" data-act="toggle-sheet" data-k="adv">${o.adv ? 'Сховати' : 'Нестандартна форма кімнати'}</button>
        ${o.adv ? html`<div class="fgrid">
          ${fld('Площа вручну', inp({ bind: 'areaOv', value: dr.areaOv, unit: 'м²', num: true }), 'Перекриває L × W', 'f-ao')}
          ${fld('Периметр вручну', inp({ bind: 'perimOv', value: dr.perimOv, unit: 'м', num: true }), 'Перекриває розрахунок', 'f-po')}
        </div>` : ''}` : ''}
      ${fld('Бюджет простору', inp({ bind: 'budget', value: dr.budget, unit: cur(), num: true, ph: 'необов’язково' }), '', 'f-budget')}`,
    footer: html`${o.id ? html`<button class="btn icon danger" data-act="del-space" data-id="${o.id}" aria-label="Видалити">${icon('trash', 20)}</button>` : ''}
      <button class="btn primary grow" data-act="save-space">Зберегти</button>`,
  };
}

// ── Завдання ──
function taskForm(o, d) {
  const dr = o.draft, w = dr.work, mode = w.mode || 'fixed';
  const space = d.spaceById.get(dr.spaceId);
  const res = calcWork(w, roomVars(space));
  const hint = suggestIcon(dr.title);
  return {
    title: o.id ? 'Змінити завдання' : 'Нове завдання',
    body: html`
      <div class="fsec first">Що це</div>
      ${chipPick(kindItems, dr.kind, 'kind')}
      <small class="muted tpd">${KINDS[dr.kind].hint}</small>
      ${fld('Назва', inp({ bind: 'title', value: dr.title, ph: dr.kind === 'item' ? 'Наприклад, Тостер' : dr.kind === 'work' ? 'Наприклад, Підлога' : 'Наприклад, Викликати електрика' }), '', 'f-title')}
      ${o.spacePick ? fld('Простір', select({ bind: 'spaceId', value: dr.spaceId, options: spaceOptions(d) }), '', 'f-space') : ''}
      <div class="fsec">Іконка ${hint && hint !== dr.icon ? html`<small>— підказка за назвою підсвічена</small>` : ''}</div>
      ${iconPick(ITEM_ICONS, dr.icon, 'icon', hint || '')}
      ${fld('Де розмістити', inp({ bind: 'spot', value: dr.spot, ph: 'Напр.: біля вікна, над столом', list: 'spots' }), '', 'f-spot')}
      <datalist id="spots">${d.spotNames.map((s) => html`<option value="${s}">`)}</datalist>
      ${fld('Термін', inp({ bind: 'due', value: dr.due, type: 'date' }), 'Необов’язково — нагадаємо на «Огляді»', 'f-due')}
      ${dr.kind === 'work' ? html`
        <div class="fsec">Робота майстра</div>
        ${chipPick(Object.entries(WORK_MODES).map(([v, label]) => ({ v, label })), mode, 'work.mode')}
        ${fld(mode === 'fixed' ? 'Вартість роботи' : 'Ціна за одиницю', inp({ bind: 'work.price', value: w.price, num: true, unit: mode === 'fixed' ? cur() : `${cur()}/${mode === 'perim' ? 'м' : 'м²'}` }), '', 'f-wp')}
        <div class="result ${res.warn ? 'warn' : ''}"><div class="result-m"><b>Робота</b><span>${money(res.cost)}</span></div><small>${res.detail}</small></div>`
      : dr.kind === 'item' ? html`
        ${fld('Доставка / монтаж', inp({ bind: 'work.price', value: w.price, num: true, unit: cur(), ph: 'необов’язково' }), 'Додається до ціни речі', 'f-wp')}` : ''}
      <label class="fld" data-key="f-note"><span class="fld-l">Нотатка</span>
        <textarea class="in" rows="3" data-bind="note" placeholder="Майстер, терміни, нюанси…">${dr.note}</textarea></label>`,
    footer: html`${o.id ? html`<button class="btn icon danger" data-act="del-task" data-id="${o.id}" aria-label="Видалити">${icon('trash', 20)}</button>` : ''}
      <button class="btn primary grow" data-act="save-task">Зберегти</button>`,
  };
}

// ── Фото-блок (спільний для варіанта й швидкої речі) ──
function photoBlock(dr) {
  const src = imgSrc(dr);
  const remote = !dr.imageId && dr.imageUrl;
  return html`
    <div class="photo" data-key="sec-photo">
      ${src ? html`<div class="photo-p">${pic(src)}<button type="button" class="btn icon sm photo-x" data-act="drop-photo" aria-label="Прибрати фото">${icon('x', 16)}</button></div>`
        : html`<div class="photo-ph">${icon('image', 28)}<span>Фото товару або цінника</span></div>`}
      <div class="row-btns">
        <button type="button" class="btn sm" data-act="pick-photo" data-src="cam">${icon('camera', 16)} Камера</button>
        <button type="button" class="btn sm" data-act="pick-photo" data-src="gal">${icon('image', 16)} Галерея</button>
        ${src ? html`<button type="button" class="btn sm" data-act="crop-photo">${icon('crop', 16)} Обрізати</button>` : ''}
      </div>
      ${remote ? html`<small class="fld-h">Фото підвантажується з сайту й не працюватиме офлайн. «Обрізати» збереже копію.</small>` : ''}
    </div>`;
}
const urlRow = (o, dr) => html`
  <div class="fld" data-key="f-url"><span class="fld-l">Посилання на товар</span>
    <div class="urlrow">${inp({ bind: 'url', value: dr.url, ph: 'https://…' })}
      <button type="button" class="btn sm ${o.busy ? 'busy' : ''}" data-act="fetch-og" ${o.busy ? 'disabled' : ''}>${o.busy ? html`<i class="spin"></i>` : icon('sparkle', 16)} Підтягнути</button></div>
    <small class="fld-h">Фото й назва підтягнуться зі сторінки магазину. Якщо фото не те — «Обрізати» або завантажте своє.</small></div>`;

// ── Варіант (товар / матеріал) ──
const resultBox = (r) => html`
  <div class="result ${r.warn ? 'warn' : ''}">
    <div class="result-m"><b>${r.qty ? `${fmt(r.qty, 2)} ${r.unit}` : '—'}</b><span>${money(r.cost)}</span></div>
    <small>${r.detail}</small>
  </div>`;

function calcFields(prefix, c, typeAct, data = '') {
  const T = CALC_TYPES[c.type] || CALC_TYPES.area;
  return html`
    <div class="typepick">${Object.entries(CALC_TYPES).map(([k, t]) => html`
      <button type="button" class="tp ${c.type === k ? 'on' : ''}" data-act="${typeAct}" data-v="${k}" ${data}><span>${icon(t.icon, 24)}</span><b>${t.label}</b></button>`)}</div>
    <small class="muted tpd">${T.hint}</small>
    <div class="fgrid">
      ${T.fields.map((fl) => (fl.type === 'select'
        ? fld(fl.label, select({ bind: `${prefix}.${fl.key}`, value: c[fl.key], options: fl.options }), '', `${prefix}.${fl.key}`)
        : fld(fl.label, inp({ bind: `${prefix}.${fl.key}`, value: c[fl.key], unit: fl.unit === '₴' ? cur() : fl.unit === '₴/м²' ? `${cur()}/м²` : fl.unit, num: true }), fl.hint || '', `${prefix}.${fl.key}`)))}
    </div>
    ${T.basis ? html`<div class="fgrid">
      ${fld('Рахувати від', select({ bind: `${prefix}.basis`, value: c.basis, options: BASES }), '', `${prefix}.basis`)}
      ${c.basis === 'custom' ? fld('Значення', inp({ bind: `${prefix}.custom`, value: c.custom, unit: c.type === 'linear' ? 'м' : 'м²', num: true }), '', `${prefix}.custom`) : ''}
    </div>` : ''}`;
}

function optionForm(o, d) {
  const dr = o.draft;
  const tid = dr.taskId;
  const tinfo = d.taskInfo.get(tid);
  const kind = tid === '__new__' ? dr.newTask.kind : tinfo?.kind || 'item';
  const simple = kind !== 'work';
  const sid = tid === '__new__' ? dr.newTask.spaceId : tinfo?.space.id;
  const stores = [...new Set([...d.storeNames, ...STORE_PRESETS])];

  const head = html`
    <datalist id="stores">${stores.map((s) => html`<option value="${s}">`)}</datalist>
    ${o.pickTask ? html`
      <div class="sec" data-key="sec-task">
        ${fld('До якого завдання', html`<select class="in sel" data-bind="taskId" data-value="${tid}">
          <option value="" ${tid ? '' : raw('selected')}>— оберіть завдання —</option>
          ${d.spaces.map((s) => s.tasks.filter((t) => t.kind !== 'todo').length ? html`<optgroup label="${s.space.name}">${s.tasks.filter((t) => t.kind !== 'todo').map((t) => html`
            <option value="${t.task.id}" ${tid === t.task.id ? raw('selected') : ''}>${t.task.title}</option>`)}</optgroup>` : '')}
          <option value="__new__" ${tid === '__new__' ? raw('selected') : ''}>＋ Нове завдання…</option></select>`, '', 'f-task')}
        ${tid === '__new__' ? html`
          ${chipPick(kindItems.filter((k) => k.v !== 'todo'), dr.newTask.kind, 'newTask.kind')}
          <div class="fgrid">
            ${fld('Назва завдання', inp({ bind: 'newTask.title', value: dr.newTask.title, ph: dr.newTask.kind === 'item' ? 'Наприклад, Тостер' : 'Наприклад, Підлога' }), '', 'f-nt')}
            ${fld('Простір', select({ bind: 'newTask.spaceId', value: dr.newTask.spaceId, options: spaceOptions(d) }), '', 'f-ns')}
          </div>` : ''}
      </div>` : ''}
    ${photoBlock(dr)}
    ${urlRow(o, dr)}`;

  if (simple) {
    const total = r2(num0(dr.calc.price) * (num0(dr.calc.qty) || 1));
    return {
      title: o.id ? 'Змінити варіант' : 'Новий варіант',
      sub: tinfo ? tinfo.task.title : '',
      body: html`${head}
        ${fld('Назва', inp({ bind: 'title', value: dr.title, ph: 'Модель, артикул, колір' }), '', 'f-title')}
        ${fld('Коротко: що це', inp({ bind: 'desc', value: dr.desc, ph: 'Напр.: 2 слоти, 830 Вт, нержавійка' }), 'З’явиться в згорнутій картці', 'f-desc')}
        <div class="fgrid pq">
          ${fld('Ціна', inp({ bind: 'calc.price', value: dr.calc.price, unit: cur(), num: true }), '', 'f-price')}
          ${fld('Кільк.', inp({ bind: 'calc.qty', value: dr.calc.qty, unit: 'шт.', num: true }), '', 'f-qty')}
        </div>
        ${fld('Де купувати', inp({ bind: 'store', value: dr.store, list: 'stores', ph: 'Магазин' }), '', 'f-store')}
        <label class="fld" data-key="f-note"><span class="fld-l">Нотатка</span>
          <textarea class="in" rows="2" data-bind="note" placeholder="Колір, відгуки, чому цей варіант…">${dr.note}</textarea></label>`,
      footer: html`${o.id ? html`<button class="btn icon danger" data-act="del-opt" data-id="${o.id}" aria-label="Видалити варіант">${icon('trash', 20)}</button>` : ''}
        <div class="foot-total"><small>Разом</small><b>${money(total)}</b></div>
        <button class="btn primary grow" data-act="save-opt">Зберегти</button>`,
    };
  }

  const vars = roomVars(d.spaceById.get(sid));
  const soft = (r) => (!sid && r.warn ? { ...r, warn: '', detail: 'Оберіть завдання — розрахунок використає розміри його простору' } : r);
  const main = soft(calcItem(dr.calc, vars));
  const exRes = dr.extras.map((x) => soft(calcItem(x.calc, vars)));
  const total = r2(main.cost + exRes.reduce((s, r) => s + r.cost, 0));

  return {
    title: o.id ? 'Змінити варіант' : 'Новий варіант',
    sub: tinfo ? tinfo.task.title : '',
    body: html`${head}
      <div class="fgrid">
        ${fld('Назва', inp({ bind: 'title', value: dr.title, ph: 'Модель, артикул, колір' }), '', 'f-title')}
        ${fld('Де купувати', inp({ bind: 'store', value: dr.store, list: 'stores', ph: 'Магазин' }), '', 'f-store')}
      </div>
      ${fld('Коротко: що це', inp({ bind: 'desc', value: dr.desc, ph: 'Напр.: ламінат 33 клас, 8 мм' }), '', 'f-desc')}

      <div class="fsec">Як рахувати</div>
      ${calcFields('calc', dr.calc, 'calc-type')}
      ${resultBox(main)}

      <div class="fsec">Розхідники <small>— підкладка, клей, затирка…</small></div>
      ${dr.extras.map((x, i) => html`
        <div class="extra" data-key="ex-${x.id}">
          <div class="extra-h">${inp({ bind: `extras.${i}.title`, value: x.title, ph: 'Назва розхідника' })}
            <button type="button" class="btn icon sm ghost danger" data-act="del-extra" data-i="${i}" aria-label="Прибрати">${icon('trash', 18)}</button></div>
          ${calcFields(`extras.${i}.calc`, x.calc, 'x-calc-type', raw(`data-i="${i}"`))}
          ${fld('Де купувати (якщо в іншому місці)', inp({ bind: `extras.${i}.store`, value: x.store, list: 'stores', ph: dr.store || 'Магазин' }), '', `ex-${x.id}-s`)}
          ${resultBox(exRes[i])}
        </div>`)}
      <button type="button" class="btn sm" data-act="add-extra">${icon('plus', 16)} Розхідник</button>

      <label class="fld" data-key="f-note"><span class="fld-l">Нотатка</span>
        <textarea class="in" rows="2" data-bind="note" placeholder="Колір, відгуки, чому цей варіант…">${dr.note}</textarea></label>`,
    footer: html`${o.id ? html`<button class="btn icon danger" data-act="del-opt" data-id="${o.id}" aria-label="Видалити варіант">${icon('trash', 20)}</button>` : ''}
      <div class="foot-total"><small>Разом за варіант</small><b>${money(total)}</b></div>
      <button class="btn primary grow" data-act="save-opt">Зберегти</button>`,
  };
}
const num0 = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };

// ── Швидка річ: одна форма замість «завдання → варіант → розрахунок» ──
function quickForm(o, d) {
  const dr = o.draft;
  const stores = [...new Set([...d.storeNames, ...STORE_PRESETS])];
  const total = r2(num0(dr.price) * (num0(dr.qty) || 1));
  const ic = suggestIcon(dr.title) || 'box';
  return {
    title: 'Нова річ',
    sub: 'Купити щось — без розмірів і розрахунків',
    body: html`
      <datalist id="stores">${stores.map((s) => html`<option value="${s}">`)}</datalist>
      <datalist id="spots">${d.spotNames.map((s) => html`<option value="${s}">`)}</datalist>
      ${photoBlock(dr)}
      ${fld('Що купити', html`<span class="inwrap iconed"><span class="in-ic">${icon(ic, 20)}</span>${inp({ bind: 'title', value: dr.title, ph: 'Наприклад, Подушки на стільці', cls: 'pl' })}</span>`, '', 'f-title')}
      <div class="fgrid">
        ${fld('Простір', select({ bind: 'spaceId', value: dr.spaceId, options: spaceOptions(d) }), '', 'f-space')}
        ${fld('Де розмістити', inp({ bind: 'spot', value: dr.spot, list: 'spots', ph: 'біля вікна' }), '', 'f-spot')}
      </div>
      <div class="fsec">Етап</div>
      ${chipPick([{ v: 'chosen', label: 'Вже знаю, що куплю', icon: 'target' }, { v: 'search', label: 'Ще обираю', icon: 'search' }], dr.mode, 'mode')}
      <div class="fgrid pq">
        ${fld('Ціна', inp({ bind: 'price', value: dr.price, unit: cur(), num: true }), dr.mode === 'search' ? 'Орієнтовна — або залиште порожньою' : '', 'f-price')}
        ${fld('Кільк.', inp({ bind: 'qty', value: dr.qty, unit: 'шт.', num: true }), '', 'f-qty')}
      </div>
      ${fld('Де купувати', inp({ bind: 'store', value: dr.store, list: 'stores', ph: 'Магазин' }), '', 'f-store')}
      ${fld('Коротко: що це', inp({ bind: 'desc', value: dr.desc, ph: 'Колір, розмір, модель…' }), '', 'f-desc')}
      ${urlRow(o, dr)}`,
    footer: html`<div class="foot-total"><small>Разом</small><b>${money(total)}</b></div>
      <button class="btn primary grow" data-act="save-quick">${icon('plus', 18)} Додати</button>`,
  };
}

// ── Обрізання фото ──
const ASPECTS = [{ v: 0, label: 'Вільно' }, { v: 1, label: '1:1' }, { v: 4 / 3, label: '4:3' }, { v: 3 / 4, label: '3:4' }, { v: 16 / 9, label: '16:9' }];
function cropForm(o) {
  return {
    title: 'Обрізати фото',
    body: html`
      <div class="crop-host" data-static></div>
      <div class="chips crop-asp">${ASPECTS.map((a) => html`
        <button type="button" class="chip-b ${(o.aspect || 0) === a.v ? 'on' : ''}" data-act="crop-aspect" data-v="${a.v}">${a.label}</button>`)}</div>
      <small class="muted tpd">Тягніть рамку чи її кути. Обране буде мініатюрою речі в картці.</small>`,
    footer: html`<button class="btn" data-act="crop-rotate" ${o.busy ? 'disabled' : ''}>${icon('rotate', 18)} Повернути</button>
      <button class="btn primary grow" data-act="crop-done" ${o.busy ? 'disabled' : ''}>${o.busy ? html`<i class="spin"></i>` : icon('check', 18)} Обрізати</button>`,
  };
}

// ── Маркер на фото-плані ──
function pinForm(o, d) {
  const placed = new Map(d.pins.map((p) => [p.spaceId, p]));
  const curPin = o.pinId ? d.pins.find((p) => p.id === o.pinId) : null;
  return {
    title: curPin ? 'Маркер на плані' : 'Яка це кімната?',
    body: html`
      <div class="pick-list">
        ${d.spaces.map((s) => html`
          <button type="button" class="pick ${curPin?.spaceId === s.space.id ? 'on' : ''}" data-key="pk-${s.space.id}" data-act="pin-assign" data-space="${s.space.id}">
            <span class="emo">${spaceIcon(s.space, 22)}</span>
            <span class="pick-m"><b>${s.space.name}</b><small>${placed.has(s.space.id) && curPin?.spaceId !== s.space.id ? 'вже на плані — перенести сюди' : s.space.kind === 'category' ? 'категорія' : 'кімната'}</small></span>
            ${curPin?.spaceId === s.space.id ? icon('check', 18) : ''}
          </button>`)}
      </div>`,
    footer: html`${curPin ? html`<button class="btn icon danger" data-act="pin-del" aria-label="Видалити маркер">${icon('trash', 20)}</button>
        <button class="btn grow" data-act="pin-open">${icon('ext', 18)} Відкрити</button>`
      : html`<button class="btn grow" data-act="pin-newspace">${icon('plus', 18)} Новий простір</button>`}`,
  };
}

// ── Вибір простору для кімнати в редакторі ──
function pickSpaceForm(o, d) {
  const ed = ui.overlays.find((x) => x.kind === 'editor')?.ed;
  const room = ed && ed.sel?.kind === 'room' ? ed.rooms.find((r) => r.id === ed.sel.id) : null;
  const used = new Map();
  ed?.rooms.forEach((r) => r.spaceId && used.set(r.spaceId, (used.get(r.spaceId) || 0) + 1));
  return {
    title: 'Яка це кімната?',
    sub: 'Прив’яжіть креслення до простору — і площа піде у формули',
    body: html`
      <div class="pick-list">
        ${d.spaces.filter((s) => s.space.kind !== 'category').map((s) => html`
          <button type="button" class="pick ${room?.spaceId === s.space.id ? 'on' : ''}" data-key="ps-${s.space.id}" data-act="ed-pick-space" data-space="${s.space.id}">
            <span class="emo">${spaceIcon(s.space, 22)}</span>
            <span class="pick-m"><b>${s.space.name}</b><small>${s.vars.S > 0 ? `${fmt(s.vars.S, 1)} м² за розмірами` : 'розміри не задані'}${used.get(s.space.id) && room?.spaceId !== s.space.id ? ' · вже на кресленні' : ''}</small></span>
            ${room?.spaceId === s.space.id ? icon('check', 18) : ''}
          </button>`)}
        ${room?.spaceId ? html`<button type="button" class="pick" data-act="ed-pick-space" data-space=""><span class="emo">${icon('x', 20)}</span><span class="pick-m"><b>Без простору</b><small>відв’язати кімнату</small></span></button>` : ''}
      </div>`,
    footer: html`<button class="btn grow" data-act="ed-newspace">${icon('plus', 18)} Новий простір</button>`,
  };
}

// ── Вибір речі для маркера на плані ──
function pickTaskForm(o, d) {
  const groups = d.spaces.map((s) => ({ s, ts: s.tasks.filter((t) => t.kind !== 'todo') })).filter((g) => g.ts.length);
  const onPlan = new Set(ui.overlays.find((x) => x.kind === 'editor')?.ed.ipins.map((p) => p.taskId));
  return {
    title: 'Яку річ поставити?',
    sub: 'Маркер покаже, де вона стоятиме',
    body: groups.length ? html`${groups.map(({ s, ts }) => html`
      <div class="fsec">${s.space.name}</div>
      <div class="pick-list">${ts.map((t) => html`
        <button type="button" class="pick" data-key="pt-${t.task.id}" data-act="ed-pick-task" data-id="${t.task.id}">
          ${thumb(taskThumbSrc(t), taskIconKey(t), 'sm', 20)}
          <span class="pick-m"><b>${t.selected && t.decided ? t.selected.opt.title : t.task.title}</b><small>${t.task.title}${onPlan.has(t.task.id) ? ' · вже на плані' : ''}</small></span>
          ${statusChip(t.status, { sm: true })}
        </button>`)}</div>`)}`
      : html`<p class="confirm-t">Поки немає речей. Додайте першу — і поставте її на план.</p>`,
    footer: html`<button class="btn grow" data-act="ed-newitem">${icon('plus', 18)} Нова річ</button>`,
  };
}

// ── Завдання за статусом ──
function taskListForm(o, d) {
  const list = d.project.byStatus[o.status] || [];
  const s = STATUS[o.status];
  return {
    title: o.status === 'search' ? 'Шукаю' : s.label,
    sub: s.hint,
    body: list.length ? html`<div class="list card flat">${list.map((t) => html`
      <button class="row press" data-key="tl-${t.task.id}" data-act="open-task" data-id="${t.task.id}">
        ${thumb(taskThumbSrc(t), taskIconKey(t), 'sm', 20)}
        <span class="row-m"><b>${t.selected && t.decided ? t.selected.opt.title : t.task.title}</b><small>${t.space.name}${t.task.spot ? ` · ${t.task.spot}` : ''}</small></span>
        <span class="row-r"><small>${t.total > 0 ? money(t.total) : ''}</small>${icon('chevR', 16)}</span>
      </button>`)}</div>` : html`<p class="confirm-t">Тут поки порожньо.</p>`,
    footer: '',
  };
}

function actsForm(o, d) {
  return {
    title: 'Історія змін',
    sub: 'Хто й що змінював у домі',
    body: d.acts.length ? html`<div class="list card flat acts">${d.acts.map((a) => actRow(a, d))}</div>` : html`<p class="confirm-t">Поки що порожньо.</p>`,
    footer: '',
  };
}

function inviteForm(o) {
  const link = `${location.origin}${location.pathname}#/join/${o.code}`;
  return {
    title: 'Запросити в дім',
    sub: 'Код діє 14 днів. Людина входить через свій Google-акаунт і вводить код.',
    body: html`
      <div class="invite">
        <div class="invite-code" aria-label="Код запрошення">${[...o.code].map((c, i) => html`<span style="--i:${i}">${c}</span>`)}</div>
        <small class="muted">Або надішліть посилання — код підставиться сам</small>
        <code class="invite-link">${link}</code>
      </div>`,
    footer: html`<button class="btn grow" data-act="copy-text" data-text="${o.code}">${icon('copy', 18)} Код</button>
      <button class="btn primary grow" data-act="share-invite" data-text="${link}">${icon('share', 18)} Поділитись</button>`,
  };
}

function confirmForm(o) {
  return {
    title: o.title,
    body: html`<p class="confirm-t">${o.text}</p>`,
    footer: html`<button class="btn grow" data-act="close-overlay">Скасувати</button>
      <button class="btn danger-fill grow" data-act="${o.confirmAct}">${o.confirmLabel || 'Підтвердити'}</button>`,
  };
}

