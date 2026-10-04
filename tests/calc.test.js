import test from 'node:test';
import assert from 'node:assert/strict';
import { roomVars, calcItem, calcWork, defaultCalc } from '../js/calc.js';
import { derive } from '../js/model.js';

const room = { l: 4, w: 3, h: 2.5, doorW: 0.9 };
const v = roomVars(room);

test('змінні кімнати: S, P, Sw', () => {
  assert.equal(v.S, 12);
  assert.ok(Math.abs(v.P - 13.1) < 1e-9);       // (4+3)*2 - 0.9
  assert.ok(Math.abs(v.Sw - 32.75) < 1e-9);     // P * H
});

test('ручні перевизначення площі та периметра', () => {
  const r = roomVars({ areaOv: '10,5', perimOv: 14, h: 2 });
  assert.equal(r.S, 10.5);
  assert.equal(r.P, 14);
  assert.equal(r.Sw, 28);
});

test('покриття: запас, пачки вгору, вартість за повні пачки', () => {
  const r = calcItem({ type: 'area', basis: 'floor', price: 500, pack: 2.4, waste: 10 }, v);
  // 12 * 1.1 = 13.2 → 13.2 / 2.4 = 5.5 → 6 пачок → 14.4 м² × 500
  assert.equal(r.qty, 6);
  assert.equal(r.unit, 'пач.');
  assert.ok(Math.abs(r.cost - 7200) < 1e-6);
});

test('покриття: float-похибка не додає зайву пачку', () => {
  const r = calcItem({ type: 'area', basis: 'custom', custom: 12, price: 1, pack: 2.4, waste: 0 }, v);
  assert.equal(r.qty, 5); // 12 / 2.4 = 5.000000000000001
});

test('покриття без пачок рахується за м²', () => {
  const r = calcItem({ type: 'area', basis: 'floor', price: 100, pack: 0, waste: 5 }, v);
  assert.ok(Math.abs(r.cost - 12 * 1.05 * 100) < 1e-6);
  assert.equal(r.unit, 'м²');
});

test('суміш: кг = S × товщина × витрата, мішки вгору', () => {
  const r = calcItem({ type: 'bag', basis: 'floor', price: 300, bagKg: 25, rate: 1.5, thickness: 5 }, v);
  // 12 * 5 * 1.5 = 90 кг → 3.6 → 4 мішки
  assert.equal(r.qty, 4);
  assert.equal(r.cost, 1200);
});

test('погонаж: периметр / довжина вгору + запас', () => {
  const r = calcItem({ type: 'linear', basis: 'perim', price: 80, len: 2.5, spare: 1, priceBy: 'piece' }, v);
  // 13.1 / 2.5 = 5.24 → 6 + 1 = 7
  assert.equal(r.qty, 7);
  assert.equal(r.cost, 560);
});

test('погонаж: ціна за метр', () => {
  const r = calcItem({ type: 'linear', basis: 'perim', price: 10, len: 2, spare: 0, priceBy: 'meter' }, v);
  // 13.1 / 2 = 6.55 → 7 шт × 2 м × 10
  assert.equal(r.qty, 7);
  assert.equal(r.cost, 140);
});

test('фарба: площа стін × шари + запас', () => {
  const r = calcItem({ type: 'coverage', basis: 'walls', price: 900, cover: 10, coats: 2, waste: 5 }, v);
  // 32.75 * 2 * 1.05 = 68.775 → 6.8775 → 7 банок
  assert.equal(r.qty, 7);
  assert.equal(r.cost, 6300);
});

test('штуки', () => {
  const r = calcItem({ type: 'unit', price: 15000, qty: 2 }, v);
  assert.equal(r.cost, 30000);
});

test('без розмірів — попередження, а не NaN', () => {
  const r = calcItem(defaultCalc('area'), roomVars({}));
  assert.equal(r.cost, 0);
  assert.ok(r.warn);
});

test('робота: фіксована та за м²', () => {
  assert.equal(calcWork({ mode: 'fixed', price: 3000 }, v).cost, 3000);
  assert.equal(calcWork({ mode: 'floor', price: 250 }, v).cost, 3000);
});

// ── Агрегація бюджету ──
function fixture() {
  const mk = (r) => ({ updatedAt: 1, ...r });
  const data = {};
  for (const r of [
    { id: 's1', type: 'space', name: 'Кухня', kind: 'room', ...room, order: 0 },
    { id: 't1', type: 'task', spaceId: 's1', title: 'Підлога', work: { mode: 'fixed', price: 3000 }, selectedId: 'o1', stage: 0, order: 0 },
    { id: 'o1', type: 'option', taskId: 't1', title: 'Ламінат', store: 'Епіцентр', order: 0,
      calc: { type: 'area', basis: 'floor', price: 500, pack: 2.4, waste: 10 },
      extras: [{ id: 'e1', title: 'Підкладка', calc: { type: 'area', basis: 'floor', price: 40, pack: 10, waste: 5 } }] },
    { id: 'o2', type: 'option', taskId: 't1', title: 'Вініл', store: 'Нова Лінія', order: 1,
      calc: { type: 'area', basis: 'floor', price: 700, pack: 2.2, waste: 10 }, extras: [] },
    { id: 't2', type: 'task', spaceId: 's1', title: 'Пральна машина', work: { mode: 'fixed', price: 0 }, selectedId: null, stage: 0, order: 1 },
    { id: 'o3', type: 'option', taskId: 't2', title: 'LG', store: 'Comfy', order: 0, calc: { type: 'unit', price: 20000, qty: 1 }, extras: [] },
    { id: 'o4', type: 'option', taskId: 't2', title: 'Bosch', store: 'Comfy', order: 1, calc: { type: 'unit', price: 25000, qty: 1 }, extras: [] },
  ]) data[r.id] = mk(r);
  return data;
}

test('вартість завдання = робота + обрана опція + розхідники', () => {
  const d = derive(fixture());
  const t1 = d.taskInfo.get('t1');
  // ламінат 7200 + підкладка (12*1.05=12.6 → 2 рулони × 10 м² × 40 = 800) + робота 3000
  assert.equal(t1.optionCost, 8000);
  assert.equal(t1.total, 11000);
  assert.equal(t1.estimated, false);
});

test('зміна вибору миттєво змінює бюджет простору й проєкту', () => {
  const data = fixture();
  const before = derive(data).project.planned;
  data.t1.selectedId = 'o2';
  const d = derive(data);
  // вініл: 13.2 / 2.2 = 6 пачок × 2.2 × 700 = 9240; без розхідників
  assert.equal(d.taskInfo.get('t1').total, 3000 + 9240);
  assert.notEqual(d.project.planned, before);
  assert.equal(d.spaceInfo.get('s1').planned, d.project.planned);
});

test('завдання без вибору оцінюється за найдешевшим варіантом', () => {
  const d = derive(fixture());
  const t2 = d.taskInfo.get('t2');
  assert.equal(t2.estimated, true);
  assert.equal(t2.total, 20000);
  assert.equal(d.project.searching.length, 1);
  // «затверджено» не включає завдання без вибору
  assert.equal(d.project.selected, d.taskInfo.get('t1').total);
  assert.equal(d.project.planned, d.project.selected + 20000);
});

test('етапи: «Куплено» враховує матеріали, «Готово» — усе', () => {
  const data = fixture();
  data.t1.stage = 1;
  let d = derive(data);
  assert.equal(d.taskInfo.get('t1').spent, 8000);
  data.t1.stage = 2;
  d = derive(data);
  assert.equal(d.taskInfo.get('t1').spent, 11000);
  data.t1.spentActual = 10500;
  d = derive(data);
  assert.equal(d.taskInfo.get('t1').spent, 10500);
});

test('видалені записи ігноруються', () => {
  const data = fixture();
  data.o2.deleted = true;
  data.t2.deleted = true;
  const d = derive(data);
  assert.equal(d.taskInfo.size, 1);
  assert.equal(d.taskInfo.get('t1').options.length, 1);
});

test('список покупок групується за магазинами', () => {
  const d = derive(fixture());
  const stores = d.shop.groups.map((g) => g.store);
  assert.deepEqual(stores, ['Епіцентр']); // t2 без вибору — ще не в списку
  assert.equal(d.shop.groups[0].items.length, 2); // ламінат + підкладка
});
