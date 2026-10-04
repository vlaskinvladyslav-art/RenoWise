// Фото: стиснення через Canvas, підтягування за посиланням (Open Graph або прямий лінк).
import { uid } from './util.js';
import { putMedia } from './store.js';

const readAsDataURL = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = () => rej(r.error);
  r.readAsDataURL(blob);
});

async function toBitmap(blob) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch { /* fallback нижче */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('Не вдалося прочитати зображення'));
      img.src = url;
    });
  } finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
}

// Стискає зображення: довша сторона ≤ maxDim, JPEG. SVG зберігається як є.
export async function compress(blob, { maxDim = 1280, quality = 0.74 } = {}) {
  if (blob.type === 'image/svg+xml') {
    if (blob.size > 1.5e6) throw new Error('SVG завеликий (понад 1.5 МБ)');
    return readAsDataURL(blob);
  }
  const bmp = await toBitmap(blob);
  const w = bmp.width, h = bmp.height;
  const k = Math.min(1, maxDim / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; // прозорі PNG → білий фон
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return c.toDataURL('image/jpeg', quality);
}

export async function saveBlobAsMedia(blob, opts) {
  const data = await compress(blob, opts);
  const id = uid();
  await putMedia(id, data);
  return { id, data };
}

// ── За посиланням ──
const IMG_RE = /\.(jpe?g|png|webp|gif|avif|svg)(\?.*)?$/i;
export const looksLikeImage = (u) => IMG_RE.test(u.split('#')[0]);

export const DEFAULT_OG_PROXY = 'https://api.microlink.io/?url={url}';

async function withTimeout(url, ms = 9000, init) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctl.signal }); } finally { clearTimeout(t); }
}

// Повертає { title, image, publisher } або кидає помилку. Потрібен проксі: браузер не дозволяє
// читати чужі HTML-сторінки напряму (CORS), тому використовується сервіс на зразок microlink.
export async function fetchOG(url, proxy) {
  if (looksLikeImage(url)) return { title: '', description: '', image: url, publisher: '' };
  if (!proxy) throw new Error('Парсинг сторінок вимкнено в налаштуваннях — вставте пряме посилання на зображення');
  const res = await withTimeout(proxy.replace('{url}', encodeURIComponent(url)));
  if (!res.ok) throw new Error(`Сервіс відповів ${res.status}`);
  const type = res.headers.get('content-type') || '';
  if (type.includes('json')) {
    const j = await res.json();
    const d = j.data || j;
    return {
      title: d.title || '',
      description: d.description || '',
      image: d.image?.url || d.image || d.logo?.url || '',
      publisher: d.publisher || '',
    };
  }
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  const meta = (p) => doc.querySelector(`meta[property="${p}"],meta[name="${p}"]`)?.getAttribute('content') || '';
  const img = meta('og:image') || meta('twitter:image');
  return {
    title: meta('og:title') || doc.title || '',
    description: meta('og:description') || meta('description'),
    image: img ? new URL(img, url).href : '',
    publisher: meta('og:site_name'),
  };
}

// Картинку з чужого сайту можна скопіювати лише якщо сервер дозволяє CORS. Якщо ні — пробуємо
// сервіс-посередник (за замовчуванням images.weserv.nl); порожнє поле в налаштуваннях вимикає його.
async function fetchImageBlob(imageUrl, proxy) {
  const tries = [imageUrl];
  if (proxy) tries.push(proxy.replace('{url}', encodeURIComponent(imageUrl)));
  for (const u of tries) {
    try {
      const res = await withTimeout(u, 14000, { mode: 'cors', referrerPolicy: 'no-referrer' });
      if (!res.ok) continue;
      const blob = await res.blob();
      if (blob.type.startsWith('image/')) return blob;
    } catch { /* наступна спроба */ }
  }
  return null;
}

// Зберегти картинку локально (щоб працювала офлайн і щоб її можна було обрізати). Невдача → null.
export async function localizeImage(imageUrl, proxy) {
  const blob = await fetchImageBlob(imageUrl, proxy);
  return blob ? saveBlobAsMedia(blob) : null;
}

// Те саме, але без збереження: dataURL для редактора обрізання.
export async function imageToData(imageUrl, proxy) {
  const blob = await fetchImageBlob(imageUrl, proxy);
  return blob ? compress(blob, { maxDim: 1600, quality: 0.86 }) : null;
}
