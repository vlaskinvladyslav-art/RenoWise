// Рушій розрахунків: чисті функції (без DOM і сховища).
// Простір → змінні (S, P, Sw) → формули опцій/розхідників/роботи.
import { num, fmt as f, money } from './util.js';

// Округлення вгору з поправкою на похибку float (12 / 2.4 = 5.000000000000001 → 5, а не 6).
const ceil = (x) => Math.ceil(x - 1e-9);
// Гроші — до копійок, щоб суми не накопичували хвости на кшталт 7999.999999999999.
export const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

export const BASES = {
  floor: 'Площа підлоги',
  walls: 'Площа стін',
  perim: 'Периметр',
  custom: 'Своє значення',
};

export const CALC_TYPES = {
  area: {
    label: 'Покриття', icon: 'tile', hint: 'Ламінат, плитка, шпалери, вініл', basis: 'floor',
    fields: [
      { key: 'price', label: 'Ціна за м²', unit: '₴/м²', def: 0 },
      { key: 'pack', label: 'М² в пачці', unit: 'м²', def: 0, hint: '0 — продається на м²' },
      { key: 'waste', label: 'Запас на підрізку', unit: '%', def: 10 },
    ],
  },
  bag: {
    label: 'Суміш', icon: 'sack', hint: 'Стяжка, клей, штукатурка', basis: 'floor',
    fields: [
      { key: 'price', label: 'Ціна мішка', unit: '₴', def: 0 },
      { key: 'bagKg', label: 'Вага мішка', unit: 'кг', def: 25 },
      { key: 'rate', label: 'Витрата (1 мм, 1 м²)', unit: 'кг', def: 1.5 },
      { key: 'thickness', label: 'Товщина шару', unit: 'мм', def: 5 },
    ],
  },
  linear: {
    label: 'Погонаж', icon: 'ruler', hint: 'Плінтус, багет, кабель', basis: 'perim',
    fields: [
      { key: 'price', label: 'Ціна за 1 шт.', unit: '₴', def: 0 },
      { key: 'len', label: 'Довжина 1 шт.', unit: 'м', def: 2.5 },
      { key: 'spare', label: 'Запас', unit: 'шт.', def: 1 },
      { key: 'priceBy', label: 'Ціна вказана за', type: 'select', def: 'piece', options: { piece: 'штуку', meter: 'метр' } },
    ],
  },
  coverage: {
    label: 'Фарба', icon: 'roller', hint: 'Фарба, ґрунтовка, лак', basis: 'walls',
    fields: [
      { key: 'price', label: 'Ціна банки', unit: '₴', def: 0 },
      { key: 'cover', label: 'Покриття банки (1 шар)', unit: 'м²', def: 10 },
      { key: 'coats', label: 'Кількість шарів', unit: '', def: 2 },
      { key: 'waste', label: 'Запас', unit: '%', def: 5 },
    ],
  },
  unit: {
    label: 'Штуки', icon: 'box', hint: 'Техніка, сантехніка, меблі', basis: null,
    fields: [
      { key: 'price', label: 'Ціна за 1 шт.', unit: '₴', def: 0 },
      { key: 'qty', label: 'Кількість', unit: 'шт.', def: 1 },
    ],
  },
};

export function defaultCalc(type = 'area') {
  const t = CALC_TYPES[type] || CALC_TYPES.area;
  const c = { type, basis: t.basis || 'floor', custom: '' };
  for (const fld of t.fields) c[fld.key] = fld.def;
  return c;
}

export function roomVars(space) {
  if (!space) return { L: 0, W: 0, H: 0, D: 0, S: 0, P: 0, Sw: 0 };
  const L = num(space.l), W = num(space.w), H = num(space.h), D = num(space.doorW);
  const S = num(space.areaOv) > 0 ? num(space.areaOv) : L * W;
  // P = (L + W) × 2 − ширина дверей; Sw = P × H
  const P = num(space.perimOv) > 0 ? num(space.perimOv) : (L > 0 && W > 0 ? Math.max(0, (L + W) * 2 - D) : 0);
  return { L, W, H, D, S, P, Sw: P * H };
}

function baseOf(c, v) {
  switch (c.basis) {
    case 'walls': return v.Sw;
    case 'perim': return v.P;
    case 'custom': return num(c.custom);
    default: return v.S;
  }
}

export function calcItem(c, v) {
  const out = calcItemRaw(c, v);
  out.cost = r2(out.cost);
  return out;
}

function calcItemRaw(c, v) {
  c = c || {};
  const t = c.type || 'unit';
  const price = num(c.price);
  const out = { type: t, base: 0, need: 0, qty: 0, unit: '', cost: 0, detail: '', warn: '' };

  if (t === 'unit') {
    const q = num(c.qty);
    out.qty = q; out.unit = 'шт.'; out.cost = q * price;
    out.detail = `${f(q, 2)} шт. × ${money(price)}`;
    return out;
  }

  const base = baseOf(c, v);
  out.base = base;
  if (!(base > 0)) {
    out.warn = c.basis === 'custom' ? 'Вкажіть своє значення' : 'Вкажіть розміри простору';
    out.detail = out.warn;
    return out;
  }

  if (t === 'area') {
    const waste = num(c.waste), pack = num(c.pack);
    const need = base * (1 + waste / 100);
    out.need = need;
    if (pack > 0) {
      const packs = ceil(need / pack), billed = packs * pack;
      out.qty = packs; out.unit = 'пач.'; out.cost = billed * price;
      out.detail = `${f(base, 2)} м² + ${f(waste, 1)}% = ${f(need, 2)} м² → ${packs} пач. × ${f(pack, 2)} м² = ${f(billed, 2)} м²`;
    } else {
      out.qty = need; out.unit = 'м²'; out.cost = need * price;
      out.detail = `${f(base, 2)} м² + ${f(waste, 1)}% = ${f(need, 2)} м²`;
    }
  } else if (t === 'bag') {
    const bagKg = num(c.bagKg), th = num(c.thickness), rate = num(c.rate);
    if (!(bagKg > 0)) { out.warn = 'Вкажіть вагу мішка'; out.detail = out.warn; return out; }
    const kg = base * th * rate, bags = ceil(kg / bagKg);
    out.need = kg; out.qty = bags; out.unit = 'мішк.'; out.cost = bags * price;
    out.detail = `${f(base, 2)} м² × ${f(th, 1)} мм × ${f(rate, 2)} кг = ${f(kg, 1)} кг → ${bags} мішк. × ${f(bagKg, 1)} кг`;
  } else if (t === 'linear') {
    const len = num(c.len), spare = num(c.spare);
    if (!(len > 0)) { out.warn = 'Вкажіть довжину штуки'; out.detail = out.warn; return out; }
    const pieces = ceil(base / len), n = pieces + spare;
    out.need = base; out.qty = n; out.unit = 'шт.';
    out.cost = c.priceBy === 'meter' ? n * len * price : n * price;
    out.detail = `${f(base, 2)} м ÷ ${f(len, 2)} м = ${pieces} шт. + ${f(spare, 0)} запас = ${n} шт.`;
  } else if (t === 'coverage') {
    const cover = num(c.cover), coats = num(c.coats) || 1, waste = num(c.waste);
    if (!(cover > 0)) { out.warn = 'Вкажіть покриття банки'; out.detail = out.warn; return out; }
    const need = base * coats * (1 + waste / 100), cans = ceil(need / cover);
    out.need = need; out.qty = cans; out.unit = 'банок'; out.cost = cans * price;
    out.detail = `${f(base, 2)} м² × ${f(coats, 0)} шар. + ${f(waste, 1)}% = ${f(need, 2)} м² → ${cans} банок × ${f(cover, 1)} м²`;
  }
  return out;
}

export const WORK_MODES = {
  fixed: 'Фіксована',
  floor: 'За м² підлоги',
  walls: 'За м² стін',
  perim: 'За метр периметра',
};

export function calcWork(w, v) {
  const price = num(w?.price), mode = w?.mode || 'fixed';
  if (mode === 'fixed') return { cost: price, detail: 'Фіксована ціна', warn: '' };
  const base = mode === 'walls' ? v.Sw : mode === 'perim' ? v.P : v.S;
  const unit = mode === 'perim' ? 'м' : 'м²';
  if (!(base > 0)) return { cost: 0, detail: 'Вкажіть розміри простору', warn: 'Вкажіть розміри простору' };
  return { cost: r2(price * base), detail: `${f(base, 2)} ${unit} × ${money(price)}`, warn: '' };
}
