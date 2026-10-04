// Обрізання фото: рамка з 8 ручками, пропорції (вільно / 1:1 / 4:3 / 16:9), поворот.
// Працює на canvas, результат стискається й кладеться в медіа-сховище.
import { clamp, uid } from './util.js';
import { ui } from './ui.js';
import { putMedia } from './store.js';

const MIN = 0.06;
const cropOverlay = () => ui.overlays.find((x) => x.kind === 'crop');

export const loadImage = (src) => new Promise((res, rej) => {
  const im = new Image();
  im.onload = () => res(im);
  im.onerror = () => rej(new Error('Не вдалося відкрити зображення'));
  im.src = src;
});

// Початковий стан оверлею обрізання з dataURL-джерела.
export async function cropState(data) {
  const im = await loadImage(data);
  return { data, natW: im.naturalWidth, natH: im.naturalHeight, rect: { x: 0.06, y: 0.06, w: 0.88, h: 0.88 }, aspect: 0 };
}

function style(box, r) {
  box.style.left = `${r.x * 100}%`; box.style.top = `${r.y * 100}%`;
  box.style.width = `${r.w * 100}%`; box.style.height = `${r.h * 100}%`;
}

// Викликається після кожного рендера: будує рамку й чіпляє жести.
export function mountCrop() {
  const host = document.querySelector('.crop-host');
  const o = cropOverlay();
  if (!host || !o) return;
  if (host._o !== o || host._data !== o.data) {
    host._o = o; host._data = o.data;
    host.innerHTML = `<div class="crop-stage"><img src="${o.data}" alt="" draggable="false">
      <div class="crop-box" data-h="move"><span class="cg"></span>
        ${['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((h) => `<i class="ch ${h}" data-h="${h}"></i>`).join('')}
      </div></div>`;
    if (!host._bound) { bind(host); host._bound = true; }
  }
  const box = host.querySelector('.crop-box');
  box.classList.toggle('locked', o.aspect > 0);
  style(box, o.rect);
}

function bind(host) {
  let drag = null;
  host.addEventListener('pointerdown', (e) => {
    const h = e.target.closest('[data-h]')?.dataset.h;
    const o = cropOverlay();
    if (!h || !o) return;
    e.preventDefault();
    try { host.setPointerCapture(e.pointerId); } catch { /* синтетична подія */ }
    drag = { h, sx: e.clientX, sy: e.clientY, r: { ...o.rect }, stage: host.querySelector('.crop-stage').getBoundingClientRect(), o };
  });
  host.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const { o, r, stage, h } = drag;
    const dx = (e.clientX - drag.sx) / stage.width, dy = (e.clientY - drag.sy) / stage.height;
    let { x, y, w, h: hh } = r;
    if (h === 'move') {
      x = clamp(x + dx, 0, 1 - w); y = clamp(y + dy, 0, 1 - hh);
    } else {
      let l = x, t = y, rr = x + w, b = y + hh;
      if (h.includes('w')) l = clamp(x + dx, 0, rr - MIN);
      if (h.includes('e')) rr = clamp(x + w + dx, l + MIN, 1);
      if (h.includes('n')) t = clamp(y + dy, 0, b - MIN);
      if (h.includes('s')) b = clamp(y + hh + dy, t + MIN, 1);
      if (o.aspect > 0 && h.length === 2) { // пропорції — тільки з кутових ручок
        const fa = (o.aspect * o.natH) / o.natW; // w_f / h_f
        let nw = rr - l, nh = nw / fa;
        if (h.includes('n')) { if (b - nh < 0) { nh = b; nw = nh * fa; } t = b - nh; } else { if (t + nh > 1) { nh = 1 - t; nw = nh * fa; } b = t + nh; }
        if (h.includes('w')) l = rr - nw; else rr = l + nw;
      }
      x = l; y = t; w = rr - l; hh = b - t;
    }
    o.rect = { x, y, w, h: hh };
    style(host.querySelector('.crop-box'), o.rect);
  });
  const end = () => { drag = null; };
  host.addEventListener('pointerup', end);
  host.addEventListener('pointercancel', end);
}

// Пропорції: найбільша рамка потрібного формату навколо центру поточної.
export function cropAspect(o, a) {
  o.aspect = a;
  if (!a) return;
  const fa = (a * o.natH) / o.natW;
  const cx = o.rect.x + o.rect.w / 2, cy = o.rect.y + o.rect.h / 2;
  let h = Math.min(1, o.rect.h * 1.05), w = h * fa;
  if (w > 1) { w = 1; h = w / fa; }
  o.rect = { x: clamp(cx - w / 2, 0, 1 - w), y: clamp(cy - h / 2, 0, 1 - h), w, h };
}

export async function cropRotate(o) {
  const im = await loadImage(o.data);
  const c = document.createElement('canvas');
  c.width = im.naturalHeight; c.height = im.naturalWidth;
  const x = c.getContext('2d');
  x.translate(c.width / 2, c.height / 2); x.rotate(Math.PI / 2);
  x.drawImage(im, -im.naturalWidth / 2, -im.naturalHeight / 2);
  o.data = c.toDataURL('image/jpeg', 0.9);
  [o.natW, o.natH] = [c.width, c.height];
  o.rect = { x: 0.06, y: 0.06, w: 0.88, h: 0.88 };
  if (o.aspect) cropAspect(o, o.aspect);
}

// Вирізати вибрану область → нове медіа. Повертає { id, data }.
export async function cropApply(o, { maxDim = 1280, quality = 0.82 } = {}) {
  const im = await loadImage(o.data);
  const sx = o.rect.x * im.naturalWidth, sy = o.rect.y * im.naturalHeight;
  const sw = o.rect.w * im.naturalWidth, sh = o.rect.h * im.naturalHeight;
  const k = Math.min(1, maxDim / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw * k)); c.height = Math.max(1, Math.round(sh * k));
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  x.drawImage(im, sx, sy, sw, sh, 0, 0, c.width, c.height);
  const data = c.toDataURL('image/jpeg', quality);
  const id = uid();
  await putMedia(id, data);
  return { id, data };
}
