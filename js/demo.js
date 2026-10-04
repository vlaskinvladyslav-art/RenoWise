// Демо-дані та швидкий старт. Допомагають одразу побачити, як працює застосунок.
import { bulkPut, state, log } from './store.js';
import { defaultCalc } from './calc.js';
import { uid, ptsToStr } from './util.js';
import { rectPts } from './planner.js';

const calc = (type, over = {}) => ({ ...defaultCalc(type), ...over });
const unit = (price, qty = 1) => calc('unit', { price, qty });
const nextSpaceOrder = () => Math.max(-1, ...Object.values(state.data).filter((r) => r.type === 'space' && !r.deleted).map((r) => r.order ?? 0)) + 1;
const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export function quickRooms() {
  const base = nextSpaceOrder();
  const defs = [
    ['Кухня', 'kitchen', 'room'], ['Вітальня', 'sofa', 'room'], ['Спальня', 'bed', 'room'],
    ['Ванна', 'bath', 'room'], ['Коридор', 'door', 'room'], ['Техніка', 'plug', 'category'],
  ];
  bulkPut(defs.map(([name, icon, kind], i) => ({
    id: uid(), type: 'space', name, icon, kind, order: base + i, l: '', w: '', h: 2.7, doorW: 0.9,
  })));
}

export async function loadDemo() {
  const S = { k: uid(), b: uid(), v: uid(), w: uid(), t: uid() };
  const recs = [];
  const space = (id, name, icon, kind, extra, order) => recs.push({ id, type: 'space', name, icon, kind, order, ...extra });
  const task = (id, spaceId, title, o = {}) => recs.push({
    id, type: 'task', spaceId, title, kind: 'work', status: 'search', icon: '', spot: '', due: '', work: { mode: 'fixed', price: 0 },
    selectedId: null, spentActual: null, note: '', ...o,
  });
  const opt = (taskId, title, store, c, extra = {}, extras = []) => {
    const id = uid();
    recs.push({ id, type: 'option', taskId, title, desc: '', store, url: '', imageId: '', imageUrl: '', note: '', calc: c, extras: extras.map((e) => ({ id: uid(), ...e })), ...extra });
    return id;
  };
  const choose = (taskId, optId, status = 'chosen') => { const t = recs.find((r) => r.id === taskId); t.selectedId = optId; t.status = status; };

  const base = nextSpaceOrder();
  space(S.k, 'Кухня', 'kitchen', 'room', { l: 4.2, w: 3.1, h: 2.7, doorW: 0.9, budget: 140000 }, base);
  space(S.b, 'Спальня', 'bed', 'room', { l: 3.8, w: 3.4, h: 2.7, doorW: 0.8 }, base + 1);
  space(S.w, 'Ванна', 'bath', 'room', { l: 2.4, w: 1.9, h: 2.6, doorW: 0.7 }, base + 2);
  space(S.v, 'Вітальня', 'sofa', 'room', { l: 5.2, w: 3.6, h: 2.7, doorW: 0.9 }, base + 3);
  space(S.t, 'Велика техніка', 'plug', 'category', {}, base + 4);

  // ── Кухня: ремонт з розрахунками ──
  const kFloor = uid();
  task(kFloor, S.k, 'Підлога', { icon: 'floor', work: { mode: 'floor', price: 250 } });
  const lam = opt(kFloor, 'Ламінат Quick-Step 33 кл.', 'Епіцентр', calc('area', { price: 640, pack: 2.4, waste: 8 }), { desc: 'Дуб світлий, 8 мм, замковий' }, [
    { title: 'Підкладка 3 мм', calc: calc('area', { price: 38, pack: 10, waste: 5 }) },
  ]);
  opt(kFloor, 'Вініл SPC Wineo', 'Нова Лінія', calc('area', { price: 890, pack: 2.2, waste: 8 }), { desc: 'Водостійкий, 5 мм' }, [
    { title: 'Підкладка 1.5 мм', calc: calc('area', { price: 55, pack: 7.5, waste: 5 }), store: 'Епіцентр' },
  ]);
  opt(kFloor, 'Керамограніт 60×60', 'Епіцентр', calc('area', { price: 780, pack: 1.44, waste: 12 }), { desc: 'Під бетон, матовий' }, [
    { title: 'Клей для плитки', calc: calc('bag', { price: 320, bagKg: 25, rate: 1.5, thickness: 4 }) },
    { title: 'Затирка', calc: calc('unit', { price: 150, qty: 3 }) },
  ]);
  choose(kFloor, lam);

  const kLevel = uid();
  task(kLevel, S.k, 'Вирівнювання підлоги', { icon: 'sack', work: { mode: 'fixed', price: 2800 } });
  const lv = opt(kLevel, 'Ceresit CN 68', 'Епіцентр', calc('bag', { price: 410, bagKg: 25, rate: 1.5, thickness: 6 }), { desc: 'Самовирівнювальна суміш' });
  opt(kLevel, 'Knauf Boden 30', 'Нова Лінія', calc('bag', { price: 365, bagKg: 25, rate: 1.6, thickness: 6 }));
  choose(kLevel, lv, 'done');

  const kWalls = uid();
  task(kWalls, S.k, 'Фарбування стін', { icon: 'roller', work: { mode: 'walls', price: 90 } });
  opt(kWalls, 'Tikkurila Euro 7', 'Епіцентр', calc('coverage', { price: 1450, cover: 12, coats: 2, waste: 7 }), { desc: 'Матова, миється' }, [
    { title: 'Ґрунтовка', calc: calc('coverage', { price: 520, cover: 40, coats: 1, waste: 5 }) },
  ]);
  opt(kWalls, 'Dulux Diamond Matt', 'Нова Лінія', calc('coverage', { price: 1780, cover: 13, coats: 2, waste: 7 }), { desc: 'Стійка до плям' }, [
    { title: 'Ґрунтовка', calc: calc('coverage', { price: 520, cover: 40, coats: 1, waste: 5 }) },
  ]);

  const kBase = uid();
  task(kBase, S.k, 'Плінтус', { icon: 'ruler', work: { mode: 'fixed', price: 600 } });
  const bs = opt(kBase, 'Плінтус МДФ 2.5 м', 'Епіцентр', calc('linear', { price: 145, len: 2.5, spare: 1 }), { desc: 'Білий, під фарбування' });
  opt(kBase, 'Плінтус ПВХ 2.2 м', 'Епіцентр', calc('linear', { price: 85, len: 2.2, spare: 1 }));
  choose(kBase, bs, 'bought');

  // ── Кухня: прості речі (без розмірів і формул) ──
  const toaster = uid();
  task(toaster, S.k, 'Тостер', { kind: 'item', icon: 'toaster', spot: 'На стільниці біля вікна' });
  opt(toaster, 'Philips HD2581', 'Comfy', unit(1499), { desc: '2 слоти, 830 Вт, 8 режимів' });
  opt(toaster, 'Bosch TAT3A113', 'Rozetka', unit(1799), { desc: 'Нержавійка, підігрів булочок' });
  opt(toaster, 'Tefal Includeo', 'Фокстрот', unit(2399), { desc: 'Для сендвічів, 1000 Вт' });

  const pillows = uid();
  task(pillows, S.k, 'Подушки на стільці', { kind: 'item', icon: 'pillow', spot: 'Кухонні стільці', due: inDays(5) });
  choose(pillows, opt(pillows, 'Подушки-сидіння льняні', 'JYSK', unit(280, 4), { desc: 'Сірі, 40×40, зі зав’язками' }));

  // ── Спальня ──
  const bFloor = uid();
  task(bFloor, S.b, 'Підлога', { icon: 'floor', work: { mode: 'floor', price: 280 } });
  opt(bFloor, 'Паркетна дошка дуб', 'Нова Лінія', calc('area', { price: 1450, pack: 1.8, waste: 7 }), { desc: 'Масив, 14 мм' }, [
    { title: 'Підкладка під паркет', calc: calc('area', { price: 62, pack: 10, waste: 5 }) },
  ]);
  const bl = opt(bFloor, 'Ламінат 32 кл. Egger', 'Епіцентр', calc('area', { price: 520, pack: 2.4, waste: 8 }), { desc: 'Сірий дуб' }, [
    { title: 'Підкладка 3 мм', calc: calc('area', { price: 38, pack: 10, waste: 5 }) },
  ]);
  choose(bFloor, bl);

  const bWall = uid();
  task(bWall, S.b, 'Шпалери', { icon: 'wall', work: { mode: 'walls', price: 110 } });
  opt(bWall, 'Флізелінові Erismann', 'Епіцентр', calc('area', { basis: 'walls', price: 420, pack: 5.3, waste: 12 }), { desc: 'Під фарбування' }, [
    { title: 'Клей для флізелінових', calc: calc('unit', { price: 185, qty: 3 }) },
  ]);
  opt(bWall, 'Вінілові Marburg', 'Нова Лінія', calc('area', { basis: 'walls', price: 690, pack: 5.3, waste: 12 }), { desc: 'Мийні, рельєфні' });

  const curtains = uid();
  task(curtains, S.b, 'Штори в спальню', { kind: 'item', icon: 'curtain', spot: 'Вікно на південь' });
  opt(curtains, 'Блекаут IKEA', 'IKEA', unit(1290), { desc: 'Щільні, 2 полотна 145×250' });
  opt(curtains, 'Льон + тюль', 'JYSK', unit(1850), { desc: 'Комплект, натуральний льон' });

  // ── Ванна ──
  const wTile = uid();
  task(wTile, S.w, 'Плитка на стіни', { icon: 'tile', work: { mode: 'walls', price: 650 } });
  opt(wTile, 'Плитка 30×60 біла матова', 'Епіцентр', calc('area', { basis: 'walls', price: 560, pack: 1.26, waste: 12 }), { desc: 'Ректифікована' }, [
    { title: 'Клей для плитки', calc: calc('bag', { basis: 'walls', price: 320, bagKg: 25, rate: 1.5, thickness: 4 }) },
  ]);
  opt(wTile, 'Плитка 25×75 «мармур»', 'Нова Лінія', calc('area', { basis: 'walls', price: 820, pack: 1.31, waste: 12 }), { desc: 'Глянець' }, [
    { title: 'Клей для плитки', calc: calc('bag', { basis: 'walls', price: 320, bagKg: 25, rate: 1.5, thickness: 4 }) },
  ]);

  const wWc = uid();
  task(wWc, S.w, 'Унітаз', { kind: 'item', icon: 'wc', spot: 'Біля вікна', work: { mode: 'fixed', price: 1200 } });
  choose(wWc, opt(wWc, 'Унітаз підвісний Cersanit', 'Нова Лінія', unit(4900), { desc: 'Безободковий, Soft-close' }), 'ordered');

  // ── Вітальня ──
  const sofa = uid();
  task(sofa, S.v, 'Диван', { kind: 'item', icon: 'sofa', spot: 'Біля вікна, навпроти ТВ', due: inDays(21) });
  opt(sofa, 'Диван Hemnes 3-місний', 'IKEA', unit(18990), { desc: 'Розкладний, тканина графіт' });
  opt(sofa, 'Диван Манчестер', 'Нова Лінія', unit(23400), { desc: 'Кутовий, велюр' });

  const todoE = uid();
  task(todoE, S.v, 'Викликати електрика', { kind: 'todo', icon: 'bolt', status: 'open', due: inDays(2), note: 'Розетки в вітальні — 6 шт., вимикач біля дверей' });

  // ── Техніка ──
  const tWash = uid();
  task(tWash, S.t, 'Пральна машина', { kind: 'item', icon: 'laundry', spot: 'Ванна, під стільницею' });
  const lg = opt(tWash, 'LG F2V5HS0W', 'Comfy', unit(20999), { desc: '8 кг, пара, інвертор' });
  opt(tWash, 'Bosch WGE03408', 'Rozetka', unit(25499), { desc: '9 кг, EcoSilence' });
  opt(tWash, 'Samsung WW80AGAS21', 'Фокстрот', unit(18999), { desc: '8 кг, AI Control' });
  choose(tWash, lg);

  const tFridge = uid();
  task(tFridge, S.t, 'Холодильник', { kind: 'item', icon: 'fridge', spot: 'Кухня, ліворуч від вікна' });
  opt(tFridge, 'Samsung RB38T', 'Comfy', unit(27999), { desc: 'No Frost, 385 л, інвертор' });
  opt(tFridge, 'Bosch KGN39VL', 'Rozetka', unit(29999), { desc: 'No Frost, 366 л, нержавійка' });

  const tHood = uid();
  task(tHood, S.t, 'Витяжка', { kind: 'item', icon: 'plug', spot: 'Над плитою', work: { mode: 'fixed', price: 800 } });
  choose(tHood, opt(tHood, 'Витяжка Pyramida 60', 'Епіцентр', unit(3400), { desc: '60 см, 650 м³/год' }), 'bought');

  // Порядок завдань усередині простору та варіантів у завданні
  const perSpace = {}, perTask = {};
  for (const r of recs) {
    if (r.type === 'task') r.order = perSpace[r.spaceId] = (perSpace[r.spaceId] ?? -1) + 1;
    if (r.type === 'option') r.order = perTask[r.taskId] = (perTask[r.taskId] ?? -1) + 1;
  }

  // Креслення квартири (метри) + речі на плані
  const room = (spaceId, x, y, w, h) => recs.push({ id: uid(), type: 'room', spaceId, pts: ptsToStr(rectPts(x, y, w, h)) });
  room(S.k, 0, 0, 4.2, 3.1);
  room(S.b, 4.4, 0, 3.8, 3.4);
  room(S.w, 0, 3.3, 2.4, 1.9);
  room(S.v, 2.6, 3.6, 5.2, 3.6);
  const ipin = (taskId, x, y) => recs.push({ id: uid(), type: 'ipin', taskId, x, y });
  ipin(toaster, 3.5, 0.5); ipin(tFridge, 0.5, 0.6); ipin(pillows, 2.0, 2.0); ipin(sofa, 5.2, 5.6); ipin(curtains, 7.9, 1.6);

  bulkPut(recs);
  log('додано демо-дані');
}
