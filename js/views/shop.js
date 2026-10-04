import { html, money, fmt, plural, num, getCurrency } from '../util.js';
import { icon, suggestIcon } from '../icons.js';
import { ui, empty, counter, thumb, imgSrc } from '../ui.js';
import { STATUS, affordPlan } from '../model.js';
import { prefs } from '../prefs.js';
import { taskIconKey, taskThumbSrc } from './spaces.js';

const keyOf = (store) => store || '__none';

// «Скільки можу витратити зараз»: вписуєш суму — бачиш, що з бажаного вистачає, а де бракує.
function walletCard(d) {
  const raw = String(prefs.wallet ?? '');
  const cash = num(raw);
  const plan = affordPlan(d.taskInfo.values(), cash);
  if (!plan.rows.length && !cash) return '';
  const cur = getCurrency();
  return html`
    <section class="card wallet rise" data-key="wallet" style="--i:1">
      <div class="wallet-h">
        <span class="eyebrow">${icon('coins', 16)} Можу витратити зараз</span>
        <span class="inwrap has-unit wallet-in"><input class="in" inputmode="decimal" autocomplete="off" data-live="wallet-set" data-change="wallet-set" value="${raw}" placeholder="0"><em>${cur}</em></span>
      </div>
      ${!plan.rows.length ? html`<p class="muted wallet-n">Бажаних речей поки немає — додайте їх через «+».</p>`
        : cash <= 0 ? html`<p class="muted wallet-n">Вкажіть суму — і тут з’явиться, що з бажаного (${plan.rows.length} ${plural(plan.rows.length, 'річ', 'речі', 'речей')} на ${money(plan.need)}) вистачає взяти, а на що бракує.</p>`
        : html`
        <div class="wallet-sum">
          <span>Вистачає на <b>${plan.takenN} із ${plan.rows.length}</b>${plan.takenN ? html` · залишиться <b>${money(plan.left)}</b>` : ''}</span>
          <span class="${plan.missing ? 'short' : 'ok'}">${plan.missing ? html`Щоб узяти все — ще <b>${money(plan.missing)}</b>` : 'Вистачає на все'}</span>
        </div>
        <div class="wallet-list">
          ${plan.rows.map((r) => html`
            <button class="wrow ${r.ok ? 'ok' : 'short'}" data-key="w-${r.ti.task.id}" data-act="open-task" data-id="${r.ti.task.id}">
              ${thumb(taskThumbSrc(r.ti), taskIconKey(r.ti), 'sm', 20)}
              <span class="wrow-m"><b>${r.ti.task.title}</b><small>${money(r.cost)}${r.ti.decided ? '' : ' · ще обираю'}</small></span>
              <span class="wrow-s">${r.ok ? html`${icon('check', 14)} беру` : html`<span>бракує</span><small>${money(r.short)}</small>`}</span>
            </button>`)}
        </div>`}
    </section>`;
}

export function shopView(d) {
  const shop = d.shop;
  if (!shop.items.length) {
    const n = d.project.searching.length;
    return html`${walletCard(d)}${emptyShop(n)}`;
  }
  return html`${walletCard(d)}${shopBody(d)}`;
}

function emptyShop(n) {
  return empty(icon('cart', 54), 'Список покупок порожній',
    n ? `Ще ${n} ${plural(n, 'річ', 'речі', 'речей')} у статусі «Шукаю». Коли оберете варіант — річ з’явиться тут, згрупована за магазином.`
      : 'Оберіть варіанти в завданнях — вони з’являться тут, згруповані за магазинами. Зручно відкривати просто в магазині.',
    html`<button class="btn primary" data-act="go" data-to="/spaces">${icon('grid', 18)} До просторів</button>`);
}

function shopBody(d) {
  const shop = d.shop;
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
