import test from 'node:test';
import assert from 'node:assert/strict';
import { derive, statusOf, SEQ } from '../js/model.js';
import { parsePts, ptsToStr, dueInfo, timeAgo } from '../js/util.js';
import { suggestIcon, iconKey } from '../js/icons.js';
import { polyArea, polyPerim, isRect, rectPts, centroid, pointInPoly, dimsFromRooms, autoLayout, bbox } from '../js/planner.js';

const base = (extra = []) => {
  const data = {};
  for (const r of [
    { id: 's1', type: 'space', name: 'Кухня', kind: 'room', l: 4, w: 3, h: 2.5, doorW: 0.9, order: 0 },
    { id: 's2', type: 'space', name: 'Техніка', kind: 'category', order: 1 },
    ...extra,
  ]) data[r.id] = { updatedAt: 1, ...r };
  return data;
};
const unit = (price, qty = 1) => ({ type: 'unit', basis: 'floor', custom: 0, price, qty });

test('проста річ: ціна × кількість, без розмірів і формул', () => {
  const d = derive(base([
    { id: 't1', type: 'task', spaceId: 's1', kind: 'item', title: 'Подушки', status: 'chosen', selectedId: 'o1', work: { mode: 'fixed', price: 0 } },
    { id: 'o1', type: 'option', taskId: 't1', title: 'Льон', calc: unit(280, 4), extras: [] },
  ]));
  const t = d.taskInfo.get('t1');
  assert.equal(t.kind, 'item');
  assert.equal(t.total, 1120);
  assert.equal(t.status, 'chosen');
});

test('статуси: шукаю → обрано → замовлено → куплено; для ремонту ще й «готово»', () => {
  assert.deepEqual(SEQ.item, ['search', 'chosen', 'ordered', 'bought']);
  assert.deepEqual(SEQ.work, ['search', 'chosen', 'ordered', 'bought', 'done']);
  assert.deepEqual(SEQ.todo, ['open', 'done']);
});

test('старі записи зі stage читаються як статуси', () => {
  assert.equal(statusOf({ stage: 0, selectedId: null }, 'work'), 'search');
  assert.equal(statusOf({ stage: 0, selectedId: 'x' }, 'work'), 'chosen');
  assert.equal(statusOf({ stage: 1 }, 'work'), 'bought');
  assert.equal(statusOf({ stage: 2 }, 'work'), 'done');
  assert.equal(statusOf({ stage: 2 }, 'item'), 'bought'); // у речі немає «готово»
  assert.equal(statusOf({ status: 'done' }, 'item'), 'bought');
  assert.equal(statusOf({ status: 'search' }, 'todo'), 'open');
});

test('прогрес залежить від типу: куплена річ = 100%, обраний ремонт = 25%', () => {
  const d = derive(base([
    { id: 't1', type: 'task', spaceId: 's2', kind: 'item', title: 'Тостер', status: 'bought', selectedId: 'o1', work: { mode: 'fixed', price: 0 } },
    { id: 'o1', type: 'option', taskId: 't1', title: 'Philips', calc: unit(1500), extras: [] },
    { id: 't2', type: 'task', spaceId: 's1', kind: 'work', title: 'Підлога', status: 'chosen', work: { mode: 'fixed', price: 3000 } },
  ]));
  assert.equal(d.taskInfo.get('t1').progress, 1);
  assert.equal(d.taskInfo.get('t2').progress, 0.25);
  assert.equal(d.taskInfo.get('t1').spent, 1500);
});

test('«відкладено» не рахується в плані, але видно окремо', () => {
  const d = derive(base([
    { id: 't1', type: 'task', spaceId: 's2', kind: 'item', title: 'Диван', status: 'later', selectedId: 'o1', work: { mode: 'fixed', price: 0 } },
    { id: 'o1', type: 'option', taskId: 't1', title: 'Hemnes', calc: unit(18990), extras: [] },
  ]));
  assert.equal(d.project.planned, 0);
  assert.equal(d.project.postponed, 18990);
});

test('«шукаю» не потрапляє в «затверджено»; діапазон цін по варіантах', () => {
  const d = derive(base([
    { id: 't1', type: 'task', spaceId: 's2', kind: 'item', title: 'Тостер', status: 'search', work: { mode: 'fixed', price: 0 } },
    { id: 'o1', type: 'option', taskId: 't1', title: 'A', calc: unit(1500), extras: [] },
    { id: 'o2', type: 'option', taskId: 't1', title: 'B', calc: unit(2400), extras: [] },
  ]));
  const t = d.taskInfo.get('t1');
  assert.deepEqual([t.priceRange.lo, t.priceRange.hi, t.priceRange.n], [1500, 2400, 2]);
  assert.equal(d.project.selected, 0);
  assert.equal(d.project.planned, 1500); // оцінка за найдешевшим
  assert.equal(d.project.searching.length, 1);
});

test('справа без грошей: статус open → done, у бюджет не входить', () => {
  const d = derive(base([{ id: 't1', type: 'task', spaceId: 's1', kind: 'todo', title: 'Викликати електрика', status: 'open' }]));
  assert.equal(d.taskInfo.get('t1').total, 0);
  assert.equal(d.taskInfo.get('t1').status, 'open');
});

test('список покупок: тільки ухвалені рішення; куплене — внизу групи', () => {
  const d = derive(base([
    { id: 't1', type: 'task', spaceId: 's2', kind: 'item', title: 'Тостер', status: 'bought', selectedId: 'o1', work: { mode: 'fixed', price: 0 } },
    { id: 'o1', type: 'option', taskId: 't1', title: 'Philips', store: 'Comfy', calc: unit(1500), extras: [] },
    { id: 't2', type: 'task', spaceId: 's2', kind: 'item', title: 'Чайник', status: 'chosen', selectedId: 'o2', work: { mode: 'fixed', price: 0 } },
    { id: 'o2', type: 'option', taskId: 't2', title: 'Bosch', store: 'Comfy', calc: unit(1100), extras: [] },
    { id: 't3', type: 'task', spaceId: 's2', kind: 'item', title: 'Фен', status: 'search', work: { mode: 'fixed', price: 0 } },
    { id: 'o3', type: 'option', taskId: 't3', title: 'Dyson', store: 'Comfy', calc: unit(9000), extras: [] },
  ]));
  const g = d.shop.groups[0];
  assert.equal(g.items.length, 2);                 // «Шукаю» у списку немає
  assert.equal(g.items[0].title, 'Bosch');         // не куплене — першим
  assert.equal(g.remaining, 1100);
});

test('кімнати плану й речі на плані читаються з записів', () => {
  const d = derive(base([
    { id: 'r1', type: 'room', spaceId: 's1', pts: ptsToStr(rectPts(0, 0, 4, 3)) },
    { id: 't1', type: 'task', spaceId: 's1', kind: 'item', title: 'Тостер', status: 'chosen', work: { mode: 'fixed', price: 0 } },
    { id: 'p1', type: 'ipin', taskId: 't1', x: 1, y: 1 },
  ]));
  assert.equal(d.rooms.length, 1);
  assert.equal(d.rooms[0].info.space.name, 'Кухня');
  assert.equal(d.ipins.length, 1);
});

// ── Геометрія плану ──
test('площа, периметр, прямокутність, центр', () => {
  const r = rectPts(1, 2, 4, 3);
  assert.equal(polyArea(r), 12);
  assert.equal(polyPerim(r), 14);
  assert.ok(isRect(r));
  assert.deepEqual(centroid(r), [3, 3.5]);
  const L = [[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]]; // Г-подібна кімната
  assert.equal(polyArea(L), 12);
  assert.ok(!isRect(L));
  assert.ok(pointInPoly(centroid(L), L)); // центр лежить усередині, навіть у вигнутої форми
  assert.ok(!pointInPoly([3, 3], L));
});

test('розміри з креслення: прямокутник → L×W, складна форма → ручні площа й периметр', () => {
  const rect = dimsFromRooms([{ pts: rectPts(0, 0, 4.2, 3.1) }], 0.9);
  assert.deepEqual([rect.l, rect.w], [4.2, 3.1]);
  const L = dimsFromRooms([{ pts: [[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]] }], 0.9);
  assert.equal(L.areaOv, 12);
  assert.equal(L.perimOv, 16 - 0.9);
});

test('автоматичне розкладання кімнат не накладає їх одна на одну', () => {
  const spaces = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ space: { id, kind: 'room' }, vars: { L: 3 + i, W: 2.5 + i / 2, S: (3 + i) * (2.5 + i / 2) } }));
  const rooms = autoLayout(spaces);
  assert.equal(rooms.length, 5);
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = bbox(rooms[i].pts), b = bbox(rooms[j].pts);
      const overlap = a.x < b.x2 - 1e-6 && b.x < a.x2 - 1e-6 && a.y < b.y2 - 1e-6 && b.y < a.y2 - 1e-6;
      assert.ok(!overlap, `кімнати ${i} і ${j} перетинаються`);
    }
  }
});

test('рядок точок: туди й назад', () => {
  const pts = [[0, 0], [4.25, 0], [4.25, 3.1], [0, 3.1]];
  assert.deepEqual(parsePts(ptsToStr(pts)), pts);
  assert.deepEqual(parsePts(''), []);
});

// ── Дрібниці ──
test('підказка іконки за назвою речі', () => {
  assert.equal(suggestIcon('Тостер'), 'toaster');
  assert.equal(suggestIcon('Подушки на стільці'), 'pillow');
  assert.equal(suggestIcon('Пральна машина'), 'laundry');
  assert.equal(suggestIcon('Ламінат у спальню'), 'floor');
  assert.equal(suggestIcon('щось незрозуміле'), null);
  assert.equal(suggestIcon('Вирівнювання підлоги'), 'floor'); // «Вирівню-ванн-я» — не ванна
  assert.equal(suggestIcon('Фарбування стін'), 'roller');
  assert.equal(suggestIcon('Екран'), null);                    // «кран» усередині слова не рахується
  assert.equal(iconKey('🍳'), 'kitchen'); // старі емодзі з даних → нові іконки
  assert.equal(iconKey('kitchen'), 'kitchen');
});

test('термін виконання і відносний час', () => {
  const now = new Date(2026, 9, 4);
  assert.equal(dueInfo('2026-10-04', now).label, 'сьогодні');
  assert.equal(dueInfo('2026-10-05', now).label, 'завтра');
  assert.ok(dueInfo('2026-10-01', now).overdue);
  assert.ok(dueInfo('2026-10-09', now).soon);
  assert.equal(dueInfo('', now), null);
  assert.equal(timeAgo(1000, 1000 + 10 * 1000), 'щойно');
  assert.equal(timeAgo(0, 5 * 60 * 1000), '5 хв тому');
});
