// Похідні дані: реактивний перерахунок Task → Space → Project.
// Нічого не зберігається — усі суми й статуси рахуються з сирих записів, тож розсинхрону бути не може.
import { roomVars, calcItem, calcWork, r2 } from './calc.js';
import { num, parsePts, dueInfo } from './util.js';

// ── Типи завдань ──
export const KINDS = {
  item: { label: 'Річ', hint: 'Купити річ: техніку, меблі, декор, подушки', icon: 'box' },
  work: { label: 'Ремонт', hint: 'Роботи й матеріали з розрахунками за розмірами', icon: 'tools' },
  todo: { label: 'Справа', hint: 'Без грошей: викликати майстра, виміряти, домовитись', icon: 'checklist' },
};

// ── Статуси: від «шукаю» до «готово» ──
export const SEQ = {
  item: ['search', 'chosen', 'ordered', 'bought'],
  work: ['search', 'chosen', 'ordered', 'bought', 'done'],
  todo: ['open', 'done'],
};
export const STATUS = {
  search: { label: 'Шукаю', short: 'Шукаю', icon: 'search', hint: 'Порівнюю варіанти, ще не вирішив(ла)' },
  open: { label: 'Треба зробити', short: 'Треба', icon: 'flag', hint: 'Справа в черзі' },
  chosen: { label: 'Обрано', short: 'Обрано', icon: 'target', hint: 'Знаю, що саме хочу' },
  ordered: { label: 'Замовлено', short: 'Замовл.', icon: 'truck', hint: 'Очікую доставку' },
  bought: { label: 'Куплено', short: 'Куплено', icon: 'cart', hint: 'Придбано' },
  done: { label: 'Готово', short: 'Готово', icon: 'checkCircle', hint: 'Зроблено або встановлено' },
  later: { label: 'Відкладено', short: 'Пізніше', icon: 'pause', hint: 'Не зараз' },
};
// Для підсумків: «треба зробити» і «шукаю» — одна група.
export const GROUPS = ['search', 'chosen', 'ordered', 'bought', 'done', 'later'];
export const groupOf = (s) => (s === 'open' ? 'search' : s);

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.updatedAt ?? 0) - (b.updatedAt ?? 0);

export const kindOf = (task, space) => task.kind || (space?.kind === 'category' ? 'item' : 'work');

// Підтримує старі записи (stage 0/1/2) і виправляє статус, якщо тип завдання змінили.
export function statusOf(task, kind) {
  const seq = SEQ[kind];
  let s = task.status;
  if (!s) {
    const st = num(task.stage);
    s = st >= 2 ? 'done' : st === 1 ? 'bought' : (task.selectedId ? 'chosen' : 'search');
  }
  if (s === 'later') return s;
  if (kind === 'todo') return s === 'done' ? 'done' : 'open';
  if (s === 'open') s = 'search';
  if (!seq.includes(s)) s = s === 'done' ? seq[seq.length - 1] : 'search';
  return s;
}

function groupBy(arr, key) {
  const m = new Map();
  for (const x of arr) {
    const k = x[key];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

function buildOption(opt, vars) {
  const main = calcItem(opt.calc, vars);
  const extras = (opt.extras || []).map((e) => ({ e, res: calcItem(e.calc, vars) }));
  const total = r2(main.cost + extras.reduce((s, x) => s + x.res.cost, 0));
  const warn = main.warn || extras.map((x) => x.res.warn).find(Boolean) || '';
  return { opt, main, extras, total, warn };
}

function buildTask(task, space, optsByTask) {
  const kind = kindOf(task, space);
  const vars = roomVars(space);
  const options = kind === 'todo' ? [] : (optsByTask.get(task.id) || []).map((o) => buildOption(o, vars));
  const selected = options.find((o) => o.opt.id === task.selectedId) || null;
  const work = kind === 'todo' ? { cost: 0, detail: '', warn: '' } : calcWork(task.work, vars);

  const priced = options.filter((o) => o.total > 0);
  const cheapest = priced.length ? priced.reduce((a, b) => (b.total < a.total ? b : a)) : null;
  const priceRange = priced.length ? { lo: Math.min(...priced.map((o) => o.total)), hi: Math.max(...priced.map((o) => o.total)), n: priced.length } : null;

  let optionCost = 0, estimated = false;
  if (selected) optionCost = selected.total;
  else if (cheapest) { optionCost = cheapest.total; estimated = true; }

  const status = statusOf(task, kind);
  const seq = SEQ[kind];
  const later = status === 'later';
  const idx = Math.max(0, seq.indexOf(status));
  const final = !later && status === seq[seq.length - 1];
  const boughtIdx = seq.indexOf('bought');
  const total = r2(work.cost + optionCost);
  const hasActual = task.spentActual != null && task.spentActual !== '';

  let spent = 0;
  if (!later && boughtIdx >= 0 && idx >= boughtIdx) spent = hasActual ? num(task.spentActual) : final ? total : optionCost;

  return {
    task, kind, space, vars, options, selected, cheapest, priceRange, work, optionCost, estimated, total,
    status, seq, idx, final, later, spent,
    progress: later ? 0 : seq.length > 1 ? idx / (seq.length - 1) : 0,
    decided: !later && idx >= 1,
    counted: !later,
    due: dueInfo(task.due),
    warn: work.warn || options.map((o) => o.warn).find(Boolean) || '',
  };
}

// «Скільки можу витратити зараз»: що з бажаного (речі, які ще не куплені) вистачає взяти, а де бракує.
// Спершу вже обране, потім те, що ще обираю; всередині групи — від дешевшого, тож у бюджет вміститься найбільше речей.
// Річ, на яку не вистачає, не віднімається — дешевші за нею можуть пройти.
export function affordPlan(taskInfos, cash) {
  const wants = [...taskInfos].filter((t) => t.kind === 'item' && t.counted && !t.final && t.total > 0
    && !(t.seq.includes('bought') && t.idx >= t.seq.indexOf('bought')));
  wants.sort((a, b) => (b.decided ? 1 : 0) - (a.decided ? 1 : 0) || a.total - b.total);
  let left = Math.max(0, num(cash));
  const rows = wants.map((ti) => {
    const ok = ti.total <= left;
    const short = ok ? 0 : r2(ti.total - left);
    if (ok) left = r2(left - ti.total);
    return { ti, cost: ti.total, ok, short };
  });
  const need = r2(wants.reduce((a, t) => a + t.total, 0));
  const takenN = rows.filter((r) => r.ok).length;
  return { rows, left, need, takenN, missing: Math.max(0, r2(need - Math.max(0, num(cash)))) };
}

export function derive(data) {
  const live = Object.values(data).filter((r) => !r.deleted);
  const spaces = live.filter((r) => r.type === 'space').sort(byOrder);
  const tasks = live.filter((r) => r.type === 'task').sort(byOrder);
  const options = live.filter((r) => r.type === 'option').sort(byOrder);
  const pins = live.filter((r) => r.type === 'pin');
  const cfg = data.cfg && !data.cfg.deleted ? data.cfg : {};
  const plan = data.plan && !data.plan.deleted ? data.plan : null;

  const spaceById = new Map(spaces.map((s) => [s.id, s]));
  const optsByTask = groupBy(options, 'taskId');
  const tasksBySpace = groupBy(tasks, 'spaceId');

  const taskInfo = new Map();
  const spaceInfo = new Map();
  const spaceList = [];

  for (const s of spaces) {
    const ts = (tasksBySpace.get(s.id) || []).map((t) => buildTask(t, s, optsByTask));
    ts.forEach((ti) => taskInfo.set(ti.task.id, ti));
    const live = ts.filter((t) => t.counted);
    const planned = live.reduce((a, t) => a + t.total, 0);
    const selected = live.reduce((a, t) => a + (t.decided ? t.total : 0), 0);
    const spent = ts.reduce((a, t) => a + t.spent, 0);
    const postponed = ts.filter((t) => t.later).reduce((a, t) => a + t.total, 0);
    const progress = live.length ? live.reduce((a, t) => a + t.progress, 0) / live.length : 0;
    const doneCount = live.filter((t) => t.final).length;
    const status = !live.length ? 'empty' : progress >= 1 ? 'done' : progress > 0 ? 'doing' : 'todo';
    const budget = num(s.budget);
    const info = {
      space: s, vars: roomVars(s), tasks: ts, planned, selected, spent, postponed, progress, doneCount, status,
      budget, over: budget > 0 && planned > budget, activeCount: live.length - doneCount,
    };
    spaceInfo.set(s.id, info);
    spaceList.push(info);
  }

  // Список покупок: обрані варіанти завдань, де рішення ухвалено.
  const items = [];
  for (const si of spaceList) {
    for (const ti of si.tasks) {
      if (!ti.selected || !ti.decided) continue;
      const o = ti.selected;
      const bought = ti.idx >= ti.seq.indexOf('bought') && ti.seq.includes('bought');
      const base = {
        taskId: ti.task.id, spaceId: si.space.id, spaceName: si.space.name, taskTitle: ti.task.title,
        status: ti.status, bought, optId: o.opt.id, spot: ti.task.spot || '',
      };
      items.push({ ...base, key: o.opt.id + ':m', extra: false, store: (o.opt.store || '').trim(), title: o.opt.title, res: o.main, img: o.opt, url: o.opt.url, icon: ti.task.icon, kind: ti.kind });
      for (const x of o.extras) {
        items.push({ ...base, key: x.e.id, extra: true, store: (x.e.store || o.opt.store || '').trim(), title: x.e.title, res: x.res });
      }
    }
  }
  const groupsMap = groupBy(items, 'store');
  const groups = [...groupsMap.entries()]
    .map(([store, its]) => ({
      store,
      items: [...its].sort((a, b) => (a.bought ? 1 : 0) - (b.bought ? 1 : 0)), // куплене — вниз
      total: its.reduce((a, i) => a + i.res.cost, 0),
      remaining: its.reduce((a, i) => a + (i.bought ? 0 : i.res.cost), 0),
      left: new Set(its.filter((i) => !i.bought).map((i) => i.taskId)).size,
      tasksN: new Set(its.map((i) => i.taskId)).size,
    }))
    .sort((a, b) => (a.store === '') - (b.store === '') || a.store.localeCompare(b.store, 'uk'));

  const all = [...taskInfo.values()];
  const byStatus = Object.fromEntries(GROUPS.map((g) => [g, []]));
  for (const t of all) byStatus[groupOf(t.status)].push(t);

  const liveTasks = all.filter((t) => t.counted);
  const project = {
    planned: spaceList.reduce((a, s) => a + s.planned, 0),
    selected: spaceList.reduce((a, s) => a + s.selected, 0),
    spent: spaceList.reduce((a, s) => a + s.spent, 0),
    postponed: spaceList.reduce((a, s) => a + s.postponed, 0),
    limit: num(cfg.totalBudget),
    taskCount: liveTasks.length,
    searching: byStatus.search.filter((t) => t.kind !== 'todo'),
    byStatus,
    progress: liveTasks.length ? liveTasks.reduce((a, t) => a + t.progress, 0) / liveTasks.length : 0,
    dueSoon: all.filter((t) => t.due && !t.final && t.counted && t.due.days <= 7).sort((a, b) => a.due.days - b.due.days),
  };
  project.pending = project.planned - project.selected;
  project.over = project.limit > 0 && project.planned > project.limit;

  const storeNames = [...new Set(options.map((o) => (o.store || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'uk'));
  const spotNames = [...new Set(tasks.map((t) => (t.spot || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'uk'));

  // Намальований план
  const rooms = live.filter((r) => r.type === 'room').map((r) => ({ room: r, pts: parsePts(r.pts), info: spaceInfo.get(r.spaceId) || null }))
    .filter((r) => r.pts.length >= 3);
  const ipins = live.filter((r) => r.type === 'ipin' && taskInfo.has(r.taskId)).map((p) => ({ pin: p, task: taskInfo.get(p.taskId) }));
  const acts = live.filter((r) => r.type === 'act').sort((a, b) => b.at - a.at).slice(0, 80);

  return {
    spaces: spaceList, spaceInfo, taskInfo, project, cfg, plan, pins, storeNames, spotNames, rooms, ipins, acts,
    shop: { groups, items, remaining: groups.reduce((a, g) => a + g.remaining, 0), total: groups.reduce((a, g) => a + g.total, 0) },
    spaceById,
  };
}
