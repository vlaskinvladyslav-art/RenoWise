// Дрібні утиліти без залежностей від DOM (щоб їх можна було тестувати в Node).

let CUR = '₴';
export const setCurrency = (s) => { CUR = (s || '').trim() || '₴'; };
export const getCurrency = () => CUR;

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// Число з рядка: приймає і кому, і крапку; сміття → 0.
export const num = (v) => {
  const n = typeof v === 'string' ? parseFloat(v.replace(/\s/g, '').replace(',', '.')) : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const nfCache = {};
export const fmt = (n, d = 0) => {
  const nf = nfCache[d] ||= new Intl.NumberFormat('uk-UA', { maximumFractionDigits: d });
  return nf.format(n || 0);
};
export const money = (n) => `${fmt(Math.round(n || 0))} ${CUR}`;
export const moneyShort = (n) => {
  const a = Math.abs(n || 0);
  if (a >= 1e6) return `${fmt(n / 1e6, 1)}M`;
  if (a >= 1e4) return `${fmt(Math.round(n / 1000))}к`;
  if (a >= 1e3) return `${fmt(n / 1000, 1)}к`;
  return fmt(Math.round(n || 0));
};

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const pct = (a, b) => (b > 0 ? clamp((a / b) * 100, 0, 100) : 0);

export const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
};

export const getPath = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
export const setPath = (o, path, val) => {
  const ks = path.split('.');
  const last = ks.pop();
  const t = ks.reduce((a, k) => (a[k] ??= {}), o);
  t[last] = val;
};

// ── Безпечні HTML-шаблони: усе інтерпольоване екранується, окрім вкладених html`` ──
export class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(s);
const part = (v) => {
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(part).join('');
  if (v == null || v === false) return '';
  return esc(v);
};
export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += part(vals[i]) + strings[i + 1];
  return new Raw(out);
}

// ── Магазини ──
const STORE_HOSTS = {
  'epicentrk.ua': 'Епіцентр', 'rozetka.com.ua': 'Rozetka', 'comfy.ua': 'Comfy', 'foxtrot.ua': 'Фокстрот',
  'allo.ua': 'Allo', 'moyo.ua': 'MOYO', 'citrus.ua': 'Citrus', 'jysk.ua': 'JYSK', 'ikea.com': 'IKEA',
  'olx.ua': 'OLX', 'prom.ua': 'Prom', 'eldorado.ua': 'Ельдорадо', 'brain.com.ua': 'Brain',
};
export const STORE_PRESETS = ['Епіцентр', 'Нова Лінія', 'Rozetka', 'Comfy', 'Фокстрот', 'IKEA', 'JYSK', 'OLX', 'Ринок'];

export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}
export function storeFromUrl(url) {
  const h = hostOf(url);
  if (!h) return '';
  for (const k in STORE_HOSTS) if (h === k || h.endsWith('.' + k)) return STORE_HOSTS[k];
  const base = h.split('.').slice(0, -1).pop() || h;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export const debounce = (fn, ms) => {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};

// ── Час, люди, дати ──
export function timeAgo(ts, now = Date.now()) {
  const s = Math.max(0, (now - ts) / 1000);
  if (s < 45) return 'щойно';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} хв тому`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} год тому`;
  const d = Math.round(h / 24);
  if (d === 1) return 'вчора';
  if (d < 7) return `${d} дн. тому`;
  return new Date(ts).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
}

export const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map((w) => (w[0] || '').toUpperCase()).join('') || '•';

// Стабільний колір людини за ключем (без жовтих тонів).
const PEOPLE = ['#7c8cff', '#f472b6', '#2dd4bf', '#a78bfa', '#fb7185', '#38bdf8', '#4ade80', '#c084fc'];
export function colorFor(key = '') {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PEOPLE[h % PEOPLE.length];
}

// Термін виконання: { label, days, overdue, soon } для рядка YYYY-MM-DD.
export function dueInfo(iso, now = new Date()) {
  if (!iso) return null;
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return null;
  const t = new Date(y, m - 1, d), t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((t - t0) / 86400000);
  const label = days === 0 ? 'сьогодні' : days === 1 ? 'завтра' : days === -1 ? 'вчора'
    : t.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
  return { label, days, overdue: days < 0, soon: days >= 0 && days <= 7 };
}

// Рядок точок плану: "0,0;4.2,0;4.2,3.1;0,3.1" ↔ [[x,y],…] (метри). Рядок надійніше синхронізується, ніж вкладені масиви.
export const parsePts = (s) => String(s || '').split(';').map((p) => p.split(',').map(Number)).filter((p) => p.length === 2 && p.every(Number.isFinite));
export const ptsToStr = (pts) => pts.map(([x, y]) => `${+x.toFixed(2)},${+y.toFixed(2)}`).join(';');
