import { html, money, moneyShort, fmt, plural, timeAgo, getCurrency } from '../util.js';
import { icon, suggestIcon } from '../icons.js';
import { CALC_TYPES } from '../calc.js';
import { ui, budgetBlock, bar, seg, empty, pic, imgSrc, spaceIcon, thumb, statusChip, avatar } from '../ui.js';
import { STATUS } from '../model.js';
import { personOf } from '../identity.js';

export const dimsText = (info) => {
  const s = info.space, v = info.vars;
  if (s.kind === 'category') return 'Категорія';
  if (v.S > 0) {
    const lw = v.L > 0 && v.W > 0 && !(+s.areaOv > 0) ? `${fmt(v.L, 2)} × ${fmt(v.W, 2)} м · ` : '';
    return `${lw}${fmt(v.S, 1)} м²`;
  }
  return 'Розміри не задані';
};

export const taskIconKey = (ti) => ti.task.icon || suggestIcon(ti.task.title) || (ti.kind === 'todo' ? 'checklist' : ti.kind === 'work' ? 'tools' : 'box');
export const taskThumbSrc = (ti) => imgSrc(ti.selected?.opt) || imgSrc(ti.options.find((o) => imgSrc(o.opt))?.opt);

// ── Список просторів ──
export function spacesView(d) {
  if (!d.spaces.length) {
    return empty(icon('home', 54), 'Ще немає просторів', 'Простір — це кімната (Кухня) або категорія (Велика техніка).',
      html`<button class="btn primary" data-act="new-space">${icon('plus', 18)} Створити простір</button>
           <button class="btn" data-act="quick-rooms">${icon('home', 18)} Типові кімнати</button>`);
  }
  const f = ui.spacesFilter;
  const list = d.spaces.filter((s) => f === 'all' || s.space.kind === (f === 'rooms' ? 'room' : 'category'));
  return html`
    <div class="toolbar rise">${seg([{ v: 'all', label: 'Усі' }, { v: 'rooms', label: 'Кімнати' }, { v: 'cats', label: 'Категорії' }], f, { act: 'spaces-filter' })}</div>
    <div class="grid2">
      ${list.map((s, i) => html`
        <button class="scard card press rise" data-key="sc-${s.space.id}" style="--i:${i}" data-act="go" data-to="/space/${s.space.id}">
          <span class="scard-top"><span class="emo lg">${spaceIcon(s.space, 26)}</span><span class="status-dot st-${s.status}"></span></span>
          <b class="scard-name">${s.space.name}</b>
          <small class="scard-dim">${dimsText(s)}</small>
          <span class="scard-cost">${money(s.planned)}</span>
          ${bar(s.progress * 100)}
          <small>${s.tasks.length} ${plural(s.tasks.length, 'завдання', 'завдання', 'завдань')}${s.doneCount ? ` · ${s.doneCount} готово` : ''}</small>
          ${s.over ? html`<span class="badge bad sm">понад бюджет</span>` : ''}
        </button>`)}
      <button class="scard card add press rise" style="--i:${list.length}" data-act="new-space">
        <span class="plus">${icon('plus', 26)}</span><b>Новий простір</b>
      </button>
    </div>`;
}

// ── Сторінка простору ──
export function spaceView(d, id) {
  const s = d.spaceInfo.get(id);
  if (!s) return '';
  const room = s.space.kind !== 'category';
  const v = s.vars;
  return html`
    <section class="hero card rise" style="--i:0">
      <div class="sp-top">
        <span class="emo xl">${spaceIcon(s.space, 32)}</span>
        <div class="sp-t"><h2>${s.space.name}</h2><small>${dimsText(s)}</small></div>
        <button class="btn icon ghost" data-act="edit-space" data-id="${s.space.id}" aria-label="Змінити простір">${icon('edit', 20)}</button>
      </div>
      ${budgetBlock({ planned: s.planned, selected: s.selected, spent: s.spent, pending: s.planned - s.selected, limit: s.budget, postponed: s.postponed })}
      ${room ? (v.S > 0 || v.P > 0 ? html`
        <div class="vars" title="Змінні простору для формул">
          <span class="vchip"><small>Підлога S</small><b>${fmt(v.S, 1)} м²</b></span>
          <span class="vchip"><small>Периметр P</small><b>${fmt(v.P, 1)} м</b></span>
          <span class="vchip"><small>Стіни</small><b>${fmt(v.Sw, 1)} м²</b></span>
          <span class="vchip"><small>Висота</small><b>${fmt(v.H, 2)} м</b></span>
        </div>` : html`
        <button class="hintbtn" data-act="edit-space" data-id="${s.space.id}">${icon('ruler', 18)} Вкажіть розміри — або намалюйте їх на плані: формули пораховуть усе самі</button>`) : ''}
    </section>

    <div class="sec-h rise" style="--i:1"><h2>Завдання</h2>
      <div class="sec-btns">
        <button class="btn sm" data-act="quick-item" data-id="${s.space.id}">${icon('plus', 16)} Річ</button>
        <button class="btn sm ghost" data-act="new-task-in" data-id="${s.space.id}">${icon('tools', 16)} Завдання</button>
      </div></div>

    ${s.tasks.length ? s.tasks.map((ti, i) => taskCard(ti, d, i)) : empty(icon('checklist', 54), 'Поки без завдань',
      room ? 'Наприклад: «Підлога», «Стіни», «Подушки на стільці».' : 'Наприклад: «Пральна машина», «Холодильник».',
      html`<button class="btn primary" data-act="quick-item" data-id="${s.space.id}">${icon('plus', 18)} Додати річ</button>
           <button class="btn" data-act="new-task-in" data-id="${s.space.id}">${icon('tools', 18)} Ремонт чи справа</button>`)}
  `;
}

// ── Закрита картка завдання: що це, скільки коштує, де стоятиме ──
function headInfo(ti) {
  const t = ti.task, sel = ti.selected, n = ti.options.length;
  const searching = ti.status === 'search' || ti.status === 'open';
  const useOpt = !!sel && !searching && ti.kind !== 'todo';
  const name = useOpt ? sel.opt.title : t.title;
  const over = useOpt && sel.opt.title.trim().toLowerCase() !== t.title.trim().toLowerCase() ? t.title : '';
  const r = ti.priceRange;
  let desc = '';
  if (ti.kind === 'todo') desc = t.note || '';
  else if (useOpt) desc = sel.opt.desc || '';
  else if (n) desc = `${n} ${plural(n, 'варіант', 'варіанти', 'варіантів')}${r && n > 1 ? ` · ${moneyShort(r.lo)} – ${moneyShort(r.hi)} ${getCurrency()}` : ''}`;
  else desc = ti.kind === 'item' ? 'Додайте варіанти та порівнюйте' : 'Без варіантів';
  return { name, over, desc, searching };
}

function priceCell(ti, searching) {
  if (ti.kind === 'todo') return html`<span class="task-cost"></span>`;
  const r = ti.priceRange;
  if (searching && r && ti.options.length > 1 && !ti.selected) {
    return html`<span class="task-cost"><b>від ${money(r.lo)}</b><small>до ${moneyShort(r.hi)}</small></span>`;
  }
  const qty = ti.selected?.opt.calc?.type === 'unit' ? +ti.selected.opt.calc.qty : 0;
  return html`<span class="task-cost"><b>${ti.total > 0 ? money(ti.total) : '—'}</b>${qty > 1 ? html`<small>× ${qty} шт.</small>` : ti.estimated ? html`<small class="est">≈ оцінка</small>` : ''}</span>`;
}

function taskCard(ti, d, i) {
  const t = ti.task;
  const open = !!ui.expanded[t.id];
  const { name, over, desc, searching } = headInfo(ti);
  const sel = ti.selected;
  const store = sel?.opt.store;
  const st = STATUS[ti.status];

  return html`
  <article class="task card rise st-${ti.status} ${open ? 'open' : ''} ${ti.later ? 'later' : ''}" data-key="task-${t.id}" style="--i:${Math.min(i, 8) + 2}">
    <button class="task-head press" data-act="toggle-task" data-id="${t.id}" aria-expanded="${open}">
      <span class="tthumb">${thumb(taskThumbSrc(ti), taskIconKey(ti), '', 26)}<span class="tbadge" title="${st.label}">${icon(st.icon, 12)}</span></span>
      <span class="task-main">
        ${over ? html`<small class="task-over">${over}</small>` : ''}
        <b class="task-title">${name}</b>
        ${desc ? html`<small class="task-desc">${desc}</small>` : ''}
        <span class="task-meta">
          ${statusChip(ti.status, { sm: true })}
          ${t.spot ? html`<span class="mchip">${icon('pin', 12)}${t.spot}</span>` : ''}
          ${store ? html`<span class="mchip">${icon('store', 12)}${store}</span>` : ''}
          ${ti.due ? html`<span class="mchip ${ti.due.overdue && !ti.final ? 'bad' : ti.due.soon ? 'soon' : ''}">${icon('calendar', 12)}${ti.due.label}</span>` : ''}
        </span>
      </span>
      ${priceCell(ti, searching)}
      <span class="chev">${icon('chevD', 18)}</span>
    </button>
    <div class="acc"><div class="acc-in">${taskBody(ti)}</div></div>
  </article>`;
}

function statusBar(ti) {
  const t = ti.task;
  const blocked = ti.kind !== 'todo' && ti.options.length > 0 && !ti.selected;
  const items = ti.seq.map((s) => ({ v: s, label: STATUS[s].label, icon: STATUS[s].icon }));
  return html`
    <div class="statusbar" data-key="sb-${t.id}">
      <div class="lbl">Етап</div>
      ${seg(items, ti.later ? '' : ti.status, { act: 'set-status', data: { id: t.id }, cls: 'scroll status-seg' })}
      <div class="status-foot">
        <small class="muted">${blocked ? 'Щоб перейти далі, оберіть варіант нижче' : STATUS[ti.status]?.hint || ''}</small>
        <button class="chip pick sm ${ti.later ? 'on' : ''}" data-act="set-status" data-id="${t.id}" data-v="${ti.later ? 'back' : 'later'}">${icon('pause', 14)}${ti.later ? 'Повернути в план' : 'Відкласти'}</button>
      </div>
    </div>`;
}

function taskBody(ti) {
  const t = ti.task;
  const isOwn = !t.updatedBy || t.updatedBy === 'local';
  const who = !isOwn ? personOf(t.updatedBy) : null;
  const bought = ti.seq.includes('bought') && ti.idx >= ti.seq.indexOf('bought') && !ti.later;

  return html`
    ${statusBar(ti)}
    ${ti.kind === 'todo' ? '' : ti.kind === 'item' ? itemOptions(ti) : workOptions(ti)}

    ${ti.kind === 'work' ? html`
      <div class="sumbox">
        <div class="sum"><span>Робота<small>${ti.work.detail}</small></span><b>${money(ti.work.cost)}</b></div>
        <div class="sum"><span>Матеріали${ti.estimated ? html` <em class="est">оцінка · найдешевший</em>` : ''}</span><b>${money(ti.optionCost)}</b></div>
        <div class="sum tot"><span>Разом</span><b>${money(ti.total)}</b></div>
      </div>` : ti.kind === 'item' && ti.total > 0 ? html`
      <div class="sumbox">
        ${ti.work.cost > 0 ? html`<div class="sum"><span>Доставка / монтаж</span><b>${money(ti.work.cost)}</b></div>` : ''}
        <div class="sum tot"><span>Разом${ti.estimated ? html` <em class="est">оцінка · найдешевший</em>` : ''}</span><b>${money(ti.total)}</b></div>
      </div>` : ''}

    ${bought && ti.kind !== 'todo' ? html`
      <label class="actual"><span>Фактично витрачено</span>
        <span class="inwrap has-unit"><input class="in" inputmode="decimal" data-change="set-actual" data-id="${t.id}"
          value="${t.spentActual ?? ''}" placeholder="${Math.round(ti.spent)}"><em>${getCurrency()}</em></span></label>` : ''}

    ${t.spot || ti.due || who || (ti.kind !== 'todo' && t.note) ? html`
      <div class="facts">
        ${t.spot ? html`<span class="fact">${icon('pin', 15)}<span><small>Де розмістити</small>${t.spot}</span></span>` : ''}
        ${ti.due ? html`<span class="fact ${ti.due.overdue && !ti.final ? 'bad' : ''}">${icon('calendar', 15)}<span><small>Термін</small>${ti.due.label}${ti.due.overdue && !ti.final ? ' · прострочено' : ''}</span></span>` : ''}
        ${who ? html`<span class="fact">${avatar(t.updatedBy, 22)}<span><small>Оновлено</small>${who.name} · ${timeAgo(t.updatedAt)}</span></span>` : ''}
      </div>` : ''}
    ${ti.kind !== 'todo' && t.note ? html`<p class="note">${t.note}</p>` : ''}

    <div class="task-actions">
      ${ti.kind === 'todo' ? '' : html`<button class="btn ghost sm" data-act="plan-place" data-id="${t.id}">${icon('map', 16)} На плані</button>`}
      <button class="btn ghost sm" data-act="edit-task" data-id="${t.id}">${icon('edit', 16)} Редагувати</button>
      <button class="btn ghost sm danger" data-act="del-task" data-id="${t.id}">${icon('trash', 16)} Видалити</button>
    </div>`;
}

// Річ: варіанти — картки з фото, описом, ціною. Радіо-кнопка обирає, тап по картці — редагує.
function itemOptions(ti) {
  const t = ti.task, sel = ti.selected;
  const ref = sel && ti.decided ? sel : ti.cheapest;
  if (!ti.options.length) {
    return html`<div class="hint">
      <p>Додайте варіанти (моделі, магазини) й порівнюйте ціни. Коли визначитесь — натисніть кружечок біля обраного.</p>
      <button class="btn primary sm" data-act="new-opt-in" data-id="${t.id}">${icon('plus', 16)} Додати варіант</button></div>`;
  }
  return html`
    <div class="ocards" data-key="oc-${t.id}">
      ${ti.options.map((o) => {
        const isSel = sel?.opt.id === o.opt.id;
        const diff = ref && ref !== o ? o.total - ref.total : 0;
        const qty = o.opt.calc?.type === 'unit' ? +o.opt.calc.qty : 1;
        const src = imgSrc(o.opt);
        return html`
        <div class="ocard ${isSel ? 'sel' : ''}" data-key="oc-${o.opt.id}">
          <button class="radio ${isSel ? 'on' : ''}" data-act="select-opt" data-task="${t.id}" data-opt="${o.opt.id}" aria-label="Обрати цей варіант" aria-pressed="${isSel}">${icon('check', 15)}</button>
          <button class="ocard-body" data-act="edit-opt" data-id="${o.opt.id}">
            ${thumb(src, taskIconKey(ti), 'sm', 22)}
            <span class="ocard-t">
              <b>${o.opt.title}</b>
              ${o.opt.desc ? html`<small>${o.opt.desc}</small>` : ''}
              <span class="meta">
                ${o.opt.store ? html`<span class="mchip">${icon('store', 12)}${o.opt.store}</span>` : ''}
                ${qty > 1 ? html`<span class="mchip">× ${qty}</span>` : ''}
                ${ti.cheapest === o && ti.options.length > 1 ? html`<span class="mchip good">найдешевший</span>` : ''}
              </span>
            </span>
            <span class="ocard-p"><b>${o.total > 0 ? money(o.total) : '—'}</b>${diff !== 0 && o.total > 0 && ref?.total > 0 ? html`<small class="delta ${diff > 0 ? 'up' : 'down'}">${diff > 0 ? '+' : '−'}${moneyShort(Math.abs(diff))}</small>` : ''}</span>
          </button>
          ${o.opt.url ? html`<a class="ocard-ext" href="${o.opt.url}" target="_blank" rel="noopener noreferrer" aria-label="Відкрити сторінку товару">${icon('ext', 17)}</a>` : ''}
        </div>`;
      })}
    </div>
    <button class="btn sm ghost addopt" data-act="new-opt-in" data-id="${t.id}">${icon('plus', 16)} Ще варіант</button>`;
}

// Ремонт: сегменти варіантів і детальний розрахунок.
function workOptions(ti) {
  const t = ti.task;
  const sel = ti.selected;
  const want = ui.viewing[t.id];
  const vo = ti.options.find((o) => o.opt.id === want) || sel || ti.options[0];
  if (!vo) {
    return html`<div class="hint">
      <p>Додайте варіанти матеріалів і порівнюйте, як вибір впливає на бюджет.</p>
      <button class="btn primary sm" data-act="new-opt-in" data-id="${t.id}">${icon('plus', 16)} Додати варіант</button></div>`;
  }
  return html`
    <div class="seg scroll opt-seg" data-key="oseg-${t.id}"><i class="seg-pill" data-keep></i>
      ${ti.options.map((o) => html`
        <button type="button" class="seg-b ${o.opt.id === vo.opt.id ? 'on' : ''}" data-act="view-opt" data-task="${t.id}" data-opt="${o.opt.id}">
          ${sel?.opt.id === o.opt.id ? icon('check', 14, 'tick') : ''}
          <span class="seg-t">${o.opt.title}</span><small>${moneyShort(o.total)}${ti.cheapest === o && ti.options.length > 1 ? ' ↓' : ''}</small>
        </button>`)}
      <button type="button" class="seg-b add" data-act="new-opt-in" data-id="${t.id}" aria-label="Додати варіант">${icon('plus', 16)}</button>
    </div>
    ${workDetail(ti, vo)}`;
}

function workDetail(ti, vo) {
  const o = vo.opt;
  const sel = ti.selected;
  const isSel = sel?.opt.id === o.id;
  const src = imgSrc(o);
  const diff = sel && !isSel ? vo.total - sel.total : 0;
  const type = (r) => CALC_TYPES[r.type]?.label || '';

  return html`
  <div class="opt" data-key="optd-${o.id}">
    ${src ? html`<button class="opt-img" data-act="img-open" data-src="${src}" aria-label="Відкрити фото">${pic(src)}</button>` : ''}
    <div class="opt-head">
      <div class="opt-t">
        <b>${o.title}</b>
        ${o.desc ? html`<small class="muted">${o.desc}</small>` : ''}
        <div class="meta">
          ${o.store ? html`<span class="chip sm">${icon('store', 14)}${o.store}</span>` : ''}
          ${o.url ? html`<a class="chip sm link-chip" href="${o.url}" target="_blank" rel="noopener noreferrer">${icon('ext', 14)}Сторінка</a>` : ''}
        </div>
      </div>
      ${isSel ? html`<span class="badge ok">${icon('check', 14)} Обрано</span>`
        : diff !== 0 ? html`<span class="badge ${diff > 0 ? 'bad' : 'good'}">${diff > 0 ? '+' : '−'}${money(Math.abs(diff))}<small>до обраного</small></span>`
        : !sel && ti.cheapest === vo && ti.options.length > 1 ? html`<span class="badge good">найдешевший</span>` : ''}
    </div>

    <div class="lines">
      <div class="ln"><div><span class="ln-t">${type(vo.main)}${vo.main.qty ? `: ${fmt(vo.main.qty, 2)} ${vo.main.unit}` : ''}</span>
        <small class="ln-d ${vo.main.warn ? 'warn' : ''}">${vo.main.detail}</small></div><b>${money(vo.main.cost)}</b></div>
      ${vo.extras.map((x) => html`
        <div class="ln sub"><div><span class="ln-t">+ ${x.e.title || 'Розхідник'}${x.res.qty ? `: ${fmt(x.res.qty, 2)} ${x.res.unit}` : ''}${x.e.store && x.e.store !== o.store ? ` · ${x.e.store}` : ''}</span>
          <small class="ln-d ${x.res.warn ? 'warn' : ''}">${x.res.detail}</small></div><b>${money(x.res.cost)}</b></div>`)}
      <div class="ln tot"><span>Разом за варіант</span><b>${money(vo.total)}</b></div>
    </div>
    ${vo.warn ? html`<button class="hintbtn" data-act="edit-space" data-id="${ti.space.id}">${icon('ruler', 18)} ${vo.warn}</button>` : ''}
    ${o.note ? html`<p class="note">${o.note}</p>` : ''}

    <div class="opt-actions">
      ${isSel
        ? html`<button class="btn primary grow" disabled>${icon('check', 18)} Обрано</button>`
        : html`<button class="btn primary grow" data-act="select-opt" data-task="${ti.task.id}" data-opt="${o.id}">Обрати цей варіант</button>`}
      <button class="btn icon" data-act="edit-opt" data-id="${o.id}" aria-label="Редагувати варіант">${icon('edit', 20)}</button>
    </div>
  </div>`;
}
