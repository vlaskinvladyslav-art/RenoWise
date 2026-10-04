import { html, money, fmt, plural } from '../util.js';
import { icon } from '../icons.js';
import { mediaSrc } from '../store.js';
import { ui, seg, empty, spaceIcon } from '../ui.js';
import { planSvg } from '../planner.js';

const MODES = [{ v: 'tasks', label: 'Завдання' }, { v: 'cost', label: 'Кошторис' }, { v: 'progress', label: 'Прогрес' }];
const KINDS = [{ v: 'draw', label: 'Креслення', icon: 'polygon' }, { v: 'image', label: 'Фото плану', icon: 'image' }];
const STATUS_LABEL = { todo: 'Багато роботи', doing: 'В процесі', done: 'Все готово', empty: 'Без завдань' };

function badge(info) {
  if (ui.planMode === 'cost') return String(Math.round(info.planned / 100) / 10) + 'к';
  if (ui.planMode === 'progress') return `${Math.round(info.progress * 100)}%`;
  return info.status === 'done' ? '✓' : String(info.activeCount);
}

const legend = () => html`
  <div class="legend rise" style="--i:2">
    ${['todo', 'doing', 'done', 'empty'].map((k) => html`<span class="lg"><i class="dot st-${k}"></i>${STATUS_LABEL[k]}</span>`)}
  </div>`;

function roomList(d, spaceIds) {
  const rooms = d.spaces.filter((s) => spaceIds.has(s.space.id));
  if (!rooms.length) return '';
  return html`
    <div class="sec-h rise" style="--i:3"><h2>Кімнати на плані</h2></div>
    <div class="list card rise" style="--i:4">
      ${rooms.map((s) => html`
        <button class="row press" data-key="pr-${s.space.id}" data-act="go" data-to="/space/${s.space.id}">
          <span class="status-dot st-${s.status}"></span>
          <span class="row-m"><b>${spaceIcon(s.space, 16)} ${s.space.name}</b>
            <small>${s.activeCount} ${plural(s.activeCount, 'активне', 'активні', 'активних')} · ${fmt(s.progress * 100)}%</small></span>
          <span class="row-r"><small>${money(s.planned)}</small>${icon('chevR', 16)}</span>
        </button>`)}
    </div>`;
}

export function planView(d) {
  const kind = ui.planKind;
  return html`
    <div class="plan-bar rise">${seg(KINDS, kind, { act: 'plan-kind' })}</div>
    ${kind === 'draw' ? drawView(d) : imageView(d)}`;
}

// ── Намальований план ──
function drawView(d) {
  if (!d.rooms.length) {
    return empty(icon('polygon', 54), 'Намалюйте свою квартиру',
      'Малюйте кімнати прямокутниками чи довільним контуром, прив’язуйте їх до просторів — і плану досить, щоб розрахувати площу, периметр і стіни для формул.',
      html`
        <button class="btn primary" data-act="plan-edit-open">${icon('pen', 18)} Намалювати план</button>
        ${d.spaces.length ? html`<button class="btn" data-act="plan-autofill">${icon('sparkle', 18)} З розмірів просторів</button>` : html`<button class="btn ghost" data-act="demo">${icon('sparkle', 18)} Показати приклад</button>`}`);
  }
  const placed = new Set(d.rooms.map((r) => r.room.spaceId).filter(Boolean));
  const unplaced = d.spaces.filter((s) => s.space.kind !== 'category' && !placed.has(s.space.id));
  const unassigned = d.rooms.filter((r) => !r.room.spaceId).length;

  return html`
    <div class="plan-tools rise" style="--i:1">
      <button class="btn sm wide primary" data-act="plan-edit-open">${icon('pen', 18)} Редагувати план</button>
      <button class="btn sm ${ui.planItems ? 'on' : ''}" data-act="plan-items" aria-pressed="${ui.planItems}">${icon('box', 16)} Речі</button>
      <button class="btn icon" data-act="plan-zoom" data-v="-1" aria-label="Зменшити" ${ui.planZoom <= 1 ? 'disabled' : ''}>${icon('zoomOut', 20)}</button>
      <button class="btn icon" data-act="plan-zoom" data-v="1" aria-label="Збільшити" ${ui.planZoom >= 3 ? 'disabled' : ''}>${icon('zoomIn', 20)}</button>
    </div>
    <div class="plan-modes rise" style="--i:1">${seg(MODES, ui.planMode, { act: 'plan-mode' })}</div>

    <div class="plan-scroll card rise sketch" style="--i:2">
      <div class="plan-canvas" style="width:${ui.planZoom * 100}%">${planSvg(d)}</div>
    </div>
    ${legend()}
    ${unassigned ? html`<div class="banner"><span>${icon('info', 18)}</span><span>${unassigned} ${plural(unassigned, 'кімната', 'кімнати', 'кімнат')} без простору — відкрийте редактор і призначте.</span></div>` : ''}
    ${unplaced.length ? html`<div class="sec-h"><h2>Ще не на кресленні</h2></div>
      <div class="hscroll slim">${unplaced.map((s) => html`<span class="chip">${spaceIcon(s.space, 16)} ${s.space.name}</span>`)}</div>` : ''}
    ${roomList(d, placed)}`;
}

// ── Зображення плану з маркерами ──
function imageView(d) {
  const plan = d.plan;
  const src = plan ? mediaSrc(plan.imageId) : '';

  if (!plan || !plan.imageId) {
    return empty(icon('map', 54), 'План із зображення',
      'Завантажте креслення від забудовника чи фото плану від руки й розставте маркери кімнат — на них видно завдання, прогрес і кошторис.',
      html`
        <button class="btn primary" data-act="plan-upload" data-src="gal">${icon('image', 18)} Обрати зображення</button>
        <button class="btn" data-act="plan-upload" data-src="cam">${icon('camera', 18)} Сфотографувати</button>`);
  }

  const pins = d.pins.filter((p) => d.spaceInfo.has(p.spaceId));
  const placed = new Set(pins.map((p) => p.spaceId));
  const unplaced = d.spaces.filter((s) => s.space.kind !== 'category' && !placed.has(s.space.id));
  const edit = ui.planEdit;

  return html`
    <div class="plan-modes rise">${seg(MODES, ui.planMode, { act: 'plan-mode' })}</div>
    ${edit ? html`<div class="banner rise">${icon('pin', 18)}<span>Тапніть на плані, щоб додати маркер кімнати. Маркери можна перетягувати.</span></div>` : ''}

    <div class="plan-wrap rise" style="--i:1">
      <div class="plan-tools">
        <button class="btn sm wide ${edit ? 'primary' : ''}" data-act="plan-edit">${icon(edit ? 'check' : 'pin', 18)} ${edit ? 'Готово' : 'Маркери'}</button>
        <button class="btn icon" data-act="plan-zoom" data-v="-1" aria-label="Зменшити" ${ui.planZoom <= 1 ? 'disabled' : ''}>${icon('zoomOut', 20)}</button>
        <button class="btn icon" data-act="plan-zoom" data-v="1" aria-label="Збільшити" ${ui.planZoom >= 3 ? 'disabled' : ''}>${icon('zoomIn', 20)}</button>
      </div>
      <div class="plan-scroll card ${edit ? 'editing' : ''}">
        <div class="plan-canvas" data-act="plan-canvas" style="width:${ui.planZoom * 100}%;aspect-ratio:${plan.aspect || 1.4}">
          <img class="plan-img" src="${src}" alt="План квартири" draggable="false">
          ${pins.map((p, i) => {
            const info = d.spaceInfo.get(p.spaceId);
            return html`
            <button class="pin st-${info.status}" data-key="pin-${p.id}" data-act="pin-tap" data-id="${p.id}"
              style="left:${p.x}%;top:${p.y}%;--i:${i}" aria-label="${info.space.name}">
              <span class="pin-dot"><span class="pin-e">${spaceIcon(info.space, 20)}</span><span class="pin-b">${badge(info)}</span></span>
              <span class="pin-l">${info.space.name}</span>
            </button>`;
          })}
        </div>
      </div>
    </div>

    ${legend()}
    ${edit ? html`
      ${unplaced.length ? html`<div class="sec-h"><h2>Ще не на плані</h2></div>
        <div class="hscroll slim">${unplaced.map((s) => html`<span class="chip">${spaceIcon(s.space, 16)} ${s.space.name}</span>`)}</div>` : ''}
      <div class="row-btns">
        <button class="btn" data-act="plan-upload" data-src="gal">${icon('image', 18)} Замінити план</button>
        <button class="btn danger" data-act="plan-remove">${icon('trash', 18)} Прибрати план</button>
      </div>` : ''}
    ${roomList(d, placed)}`;
}
