import { html, money, moneyShort, plural, timeAgo, getCurrency } from '../util.js';
import { icon } from '../icons.js';
import { budgetBlock, ring, empty, counter, spaceIcon, thumb, avatar } from '../ui.js';
import { GROUPS, STATUS } from '../model.js';
import { personOf, members } from '../identity.js';
import { taskIconKey, taskThumbSrc } from './spaces.js';

export function dashboardView(d) {
  const p = d.project;

  if (!d.spaces.length) {
    return empty(icon('home', 56), 'Почнімо планувати',
      'Ремонт, техніка, подушки на кухонні стільці — усе, що ви плануєте для дому. Створіть простори й додайте перші речі.',
      html`
        <button class="btn primary" data-act="new-space">${icon('plus', 18)} Створити простір</button>
        <button class="btn" data-act="quick-rooms">${icon('home', 18)} Типові кімнати</button>
        <button class="btn ghost" data-act="demo">${icon('sparkle', 18)} Показати приклад</button>`);
  }

  const stores = d.shop.groups.filter((g) => g.store && g.remaining > 0).slice(0, 6);
  const searching = p.searching.slice(0, 5);
  const shared = Object.keys(members).length > 1;
  const acts = d.acts.slice(0, 6);
  const tiles = GROUPS.filter((g) => g !== 'later' || p.byStatus.later.length);

  return html`
    <section class="hero card rise" style="--i:0">
      <div class="hero-top">
        <span class="eyebrow">${icon('coins', 16)} Бюджет дому</span>
        ${p.limit > 0 ? html`<span class="pill ${p.over ? 'bad' : 'ok'}">${p.over ? 'Понад ліміт' : 'У межах ліміту'}</span>`
          : html`<button class="link sm" data-act="go" data-to="/settings">Задати ліміт</button>`}
      </div>
      ${budgetBlock({ ...p, pending: p.pending })}
    </section>

    <div class="pipe rise" style="--i:1">
      ${tiles.map((g) => html`
        <button class="pipe-t st-${g} press" data-key="pt-${g}" data-act="tasklist" data-status="${g}">
          <span class="pipe-i">${icon(STATUS[g].icon, 18)}</span>
          <b>${counter(p.byStatus[g].length, 'int')}</b><small>${STATUS[g].short}</small>
        </button>`)}
    </div>

    <div class="sec-h rise" style="--i:2"><h2>Простори</h2>
      <button class="link" data-act="go" data-to="/spaces">Усі ${icon('chevR', 16)}</button></div>
    <div class="hscroll rise" style="--i:3">
      ${d.spaces.map((s, i) => html`
        <button class="mini card press" data-key="mini-${s.space.id}" style="--i:${i}" data-act="go" data-to="/space/${s.space.id}">
          <span class="mini-top"><span class="emo">${spaceIcon(s.space, 22)}</span>${ring(s.progress)}</span>
          <b class="mini-name">${s.space.name}</b>
          <span class="mini-cost">${counter(s.planned, 'money')}</span>
          <small>${s.doneCount}/${s.tasks.filter((t) => t.counted).length} ${plural(s.tasks.length, 'завдання', 'завдання', 'завдань')}</small>
        </button>`)}
      <button class="mini card add press" data-act="new-space"><span class="plus">${icon('plus', 22)}</span><b>Новий</b></button>
    </div>

    ${searching.length ? html`
      <div class="sec-h rise" style="--i:4"><h2>Ще обираю</h2><span class="count">${p.searching.length}</span></div>
      <div class="list card rise" style="--i:5">
        ${searching.map((t) => {
          const r = t.priceRange;
          return html`
          <button class="row press" data-key="und-${t.task.id}" data-act="open-task" data-id="${t.task.id}">
            ${thumb(taskThumbSrc(t), taskIconKey(t), 'sm', 20)}
            <span class="row-m"><b>${t.task.title}</b>
              <small>${t.space.name} · ${t.options.length} ${plural(t.options.length, 'варіант', 'варіанти', 'варіантів')}</small></span>
            <span class="row-r"><small>${r ? (r.lo === r.hi ? money(r.lo) : `${moneyShort(r.lo)} – ${moneyShort(r.hi)} ${getCurrency()}`) : ''}</small>${icon('chevR', 16)}</span>
          </button>`;
        })}
      </div>` : ''}

    ${p.dueSoon.length ? html`
      <div class="sec-h rise" style="--i:6"><h2>Скоро термін</h2></div>
      <div class="list card rise" style="--i:7">
        ${p.dueSoon.slice(0, 4).map((t) => html`
          <button class="row press" data-key="due-${t.task.id}" data-act="open-task" data-id="${t.task.id}">
            ${thumb(taskThumbSrc(t), taskIconKey(t), 'sm', 20)}
            <span class="row-m"><b>${t.task.title}</b><small>${t.space.name}</small></span>
            <span class="row-r"><span class="mchip ${t.due.overdue ? 'bad' : 'soon'}">${icon('calendar', 12)}${t.due.label}</span></span>
          </button>`)}
      </div>` : ''}

    ${stores.length ? html`
      <div class="sec-h rise" style="--i:8"><h2>Де купувати</h2>
        <button class="link" data-act="go" data-to="/shop">Список ${icon('chevR', 16)}</button></div>
      <div class="hscroll slim rise" style="--i:9">
        ${stores.map((g) => html`
          <button class="chip store press" data-key="st-${g.store}" data-act="shop-open" data-store="${g.store}">
            ${icon('store', 16)}<b>${g.store}</b><small>${money(g.remaining)}</small>
          </button>`)}
      </div>` : ''}

    ${acts.length ? html`
      <div class="sec-h rise" style="--i:10"><h2>${shared ? 'Що нового вдома' : 'Остання активність'}</h2>
        <button class="link" data-act="acts">Уся історія ${icon('chevR', 16)}</button></div>
      <div class="list card acts rise" style="--i:11">${acts.map((a) => actRow(a, d))}</div>` : ''}
  `;
}

export function actRow(a, d) {
  const p = personOf(a.by, a.name);
  const target = a.ref?.type === 'task' && d.taskInfo.has(a.ref.id) ? a.ref.id : null;
  const inner = html`
    ${avatar(a.by, 32, a.name)}
    <span class="act-t"><span class="act-h"><b>${p.me ? 'Ви' : p.name}</b><small>${timeAgo(a.at)}</small></span><span class="act-x">${a.text}</span></span>
    ${target ? icon('chevR', 16) : ''}`;
  return target
    ? html`<button class="act press" data-key="act-${a.id}" data-act="open-task" data-id="${target}">${inner}</button>`
    : html`<div class="act" data-key="act-${a.id}">${inner}</div>`;
}
