import { html, money, fmt, plural } from '../util.js';
import { icon, suggestIcon } from '../icons.js';
import { ui, empty, counter, thumb, imgSrc } from '../ui.js';
import { STATUS } from '../model.js';

const keyOf = (store) => store || '__none';

export function shopView(d) {
  const shop = d.shop;
  if (!shop.items.length) {
    const n = d.project.searching.length;
    return empty(icon('cart', 54), 'Список покупок порожній',
      n ? `Ще ${n} ${plural(n, 'річ', 'речі', 'речей')} у статусі «Шукаю». Коли оберете варіант — річ з’явиться тут, згрупована за магазином.`
        : 'Оберіть варіанти в завданнях — вони з’являться тут, згруповані за магазинами. Зручно відкривати просто в магазині.',
      html`<button class="btn primary" data-act="go" data-to="/spaces">${icon('grid', 18)} До просторів</button>`);
  }

  const f = ui.shopStore;
  const groups = shop.groups.filter((g) => f == null || keyOf(g.store) === f);
  const remaining = groups.reduce((a, g) => a + g.remaining, 0);
  const total = groups.reduce((a, g) => a + g.total, 0);
  const label = (s) => s || 'Без магазину';

  return html`
    <section class="hero card compact rise">
      <span class="eyebrow">${icon('cart', 16)} Залишилось купити</span>
      <div class="hero-amount">${counter(remaining)}</div>
      <div class="hero-sub">із ${money(total)} · ${groups.length} ${plural(groups.length, 'магазин', 'магазини', 'магазинів')}</div>
    </section>

    ${shop.groups.length > 1 ? html`
    <div class="hscroll slim chips-row rise" style="--i:1">
      <button class="chip pick ${f == null ? 'on' : ''}" data-act="shop-filter" data-store="">Усі</button>
      ${shop.groups.map((g) => html`
        <button class="chip pick ${f === keyOf(g.store) ? 'on' : ''}" data-key="f-${keyOf(g.store)}" data-act="shop-filter" data-store="${keyOf(g.store)}">${label(g.store)}<small>${g.left}</small></button>`)}
    </div>` : ''}

    ${groups.map((g, gi) => html`
      <section class="sgroup card rise" data-key="sg-${keyOf(g.store)}" style="--i:${gi + 2}">
        <header class="sg-h">
          <span class="sg-i">${icon('store', 20)}</span>
          <div class="sg-t"><b>${label(g.store)}</b>
            <small>${g.left ? `${g.left} ${plural(g.left, 'позиція', 'позиції', 'позицій')} · ${money(g.remaining)}` : 'Усе куплено'}</small></div>
          ${g.left === 0 ? html`<span class="badge ok sm">${icon('check', 12)}</span>` : ''}
        </header>
        ${g.items.map((it) => html`
          <div class="srow ${it.bought ? 'done' : ''} ${it.extra ? 'sub' : ''} st-${it.status}" data-key="si-${it.key}">
            ${it.extra ? '' : html`
              <button class="check ${it.bought ? 'on' : ''}" data-act="shop-toggle" data-id="${it.taskId}" aria-label="Позначити купленим">${icon('check', 16)}</button>`}
            ${it.extra ? '' : thumb(imgSrc(it.img), it.icon || suggestIcon(it.title) || 'box', 'sm', 20)}
            <button class="srow-m" data-act="open-task" data-id="${it.taskId}">
              <b>${it.extra ? '+ ' : ''}${it.title}</b>
              <small>${it.spaceName}${it.spot ? ` · ${it.spot}` : ''}${it.res.qty && it.res.unit !== 'шт.' ? ` · ${fmt(it.res.qty, 2)} ${it.res.unit}` : it.res.qty > 1 ? ` · × ${fmt(it.res.qty)}` : ''}${!it.bought && it.status === 'ordered' ? ` · ${STATUS.ordered.label.toLowerCase()}` : ''}</small>
            </button>
            <b class="srow-c">${money(it.res.cost)}</b>
          </div>`)}
      </section>`)}
  `;
}
