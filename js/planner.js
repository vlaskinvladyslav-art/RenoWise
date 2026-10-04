// Намальований план квартири: геометрія, SVG-рендер і редактор (кімнати як багатокутники в метрах).
// Кімнату можна намалювати прямокутником або довільним контуром, перетягувати, прив'язати до простору,
// а площу/периметр — одним тапом застосувати до формул. Речі з завдань ставляться маркерами.
import { html, raw, esc, fmt, parsePts, ptsToStr, num, uid, clamp, moneyShort } from './util.js';
import { icon, iconInner, iconKey } from './icons.js';
import { state, create, update, requestRender, mediaSrc, log } from './store.js';
import { getDerived } from './derived.js';
import { ui } from './ui.js';

// ───────────── Геометрія ─────────────
export const polyArea = (p) => Math.abs(p.reduce((a, [x, y], i) => { const [x2, y2] = p[(i + 1) % p.length]; return a + (x * y2 - x2 * y); }, 0)) / 2;
export const polyPerim = (p) => p.reduce((a, [x, y], i) => { const [x2, y2] = p[(i + 1) % p.length]; return a + Math.hypot(x2 - x, y2 - y); }, 0);
export function bbox(pts) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys), x2 = Math.max(...xs), y2 = Math.max(...ys);
  return { x, y, x2, y2, w: x2 - x, h: y2 - y };
}
export const rectPts = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
export function pointInPoly([px, py], p) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function isRect(p) {
  if (p.length !== 4) return false;
  const e = 1e-6, [a, b, c, d] = p;
  return (Math.abs(a[0] - b[0]) < e && Math.abs(b[1] - c[1]) < e && Math.abs(c[0] - d[0]) < e && Math.abs(d[1] - a[1]) < e)
    || (Math.abs(a[1] - b[1]) < e && Math.abs(b[0] - c[0]) < e && Math.abs(c[1] - d[1]) < e && Math.abs(d[0] - a[0]) < e);
}
export function centroid(p) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length], f = x1 * y2 - x2 * y1;
    a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
  }
  const b = bbox(p);
  if (Math.abs(a) < 1e-9) return [b.x + b.w / 2, b.y + b.h / 2];
  const c = [cx / (3 * a), cy / (3 * a)];
  return pointInPoly(c, p) ? c : [b.x + b.w / 2, b.y + b.h / 2];
}
const sn = (v, step) => +(Math.round(v / step) * step).toFixed(3);

// Із розмірів кімнат одним тапом отримуємо чернетку креслення: прямокутники в рядки.
export function autoLayout(spaces) {
  const rooms = spaces.filter((s) => s.space.kind !== 'category').map((s) => {
    const v = s.vars;
    let w = v.L, h = v.W;
    if (!(w > 0 && h > 0)) { const side = v.S > 0 ? Math.sqrt(v.S) : 3; w = side; h = side; }
    return { spaceId: s.space.id, w: sn(w, 0.05), h: sn(h, 0.05) };
  });
  const total = rooms.reduce((a, r) => a + r.w * r.h, 0);
  const maxRow = Math.max(8, Math.sqrt(total) * 1.7);
  const gap = 0.2;
  let x = 0, y = 0, rowH = 0;
  return rooms.map((r) => {
    if (x > 0 && x + r.w > maxRow) { x = 0; y += rowH + gap; rowH = 0; }
    const out = { id: uid(), spaceId: r.spaceId, pts: rectPts(sn(x, 0.05), sn(y, 0.05), r.w, r.h) };
    x += r.w + gap; rowH = Math.max(rowH, r.h);
    return out;
  });
}

// Площа/периметр кімнат простору → поля простору (L×W або ручні перевизначення).
export function dimsFromRooms(rooms, doorW = 0) {
  if (!rooms.length) return null;
  if (rooms.length === 1 && isRect(rooms[0].pts)) {
    const b = bbox(rooms[0].pts);
    return { l: +b.w.toFixed(2), w: +b.h.toFixed(2), areaOv: '', perimOv: '' };
  }
  const area = rooms.reduce((a, r) => a + polyArea(r.pts), 0);
  const perim = rooms.reduce((a, r) => a + polyPerim(r.pts), 0);
  return { areaOv: +area.toFixed(2), perimOv: +Math.max(0, perim - doorW).toFixed(2) };
}

// ───────────── Рендер плану (перегляд) ─────────────
const STATUS_CLASS = (info) => (info ? `st-${info.status}` : 'st-none');

function iconG(name, cx, cy, size, cls = '') {
  const k = size / 24;
  return `<g class="${cls}" transform="translate(${(cx - size / 2).toFixed(3)} ${(cy - size / 2).toFixed(3)}) scale(${k.toFixed(4)})" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${iconInner(name)}</g>`;
}

export function planBounds(rooms, ipins, margin = 0.8) {
  const pts = [...rooms.flatMap((r) => r.pts), ...ipins.map((p) => [p.pin.x, p.pin.y])];
  if (!pts.length) return { x: 0, y: 0, w: 12, h: 8 };
  const b = bbox(pts);
  return { x: b.x - margin, y: b.y - margin, w: Math.max(4, b.w + margin * 2), h: Math.max(3, b.h + margin * 2) };
}

function badgeText(info) {
  if (!info) return '';
  if (ui.planMode === 'cost') return moneyShort(info.planned);
  if (ui.planMode === 'progress') return `${Math.round(info.progress * 100)}%`;
  return info.status === 'done' ? '✓' : String(info.activeCount);
}

export function planSvg(d) {
  const b = planBounds(d.rooms, d.ipins);
  const u = Math.max(b.w, b.h * 1.2) / 38; // базова одиниця для підписів (метри)
  const fs = clamp(u, 0.26, 0.7);

  const roomsSvg = d.rooms.map(({ room, pts, info }) => {
    const pstr = pts.map((p) => p.join(',')).join(' ');
    const bb = bbox(pts), [cx, cy] = centroid(pts);
    const small = bb.w < fs * 5 || bb.h < fs * 4;
    const name = info ? info.space.name : 'Кімната?';
    const maxCh = Math.max(4, Math.floor(bb.w / (fs * 0.62)));
    const label = name.length > maxCh ? `${name.slice(0, Math.max(3, maxCh - 1))}…` : name;
    const area = polyArea(pts);
    const bx = clamp(bb.x2 - fs * 0.9, cx, bb.x2), by = bb.y + fs * 0.9;
    return `<g class="room ${STATUS_CLASS(info)}" data-act="room-tap" data-id="${esc(room.id)}">
      <polygon class="wall" vector-effect="non-scaling-stroke" points="${pstr}"/>
      <polygon class="fill" vector-effect="non-scaling-stroke" points="${pstr}"/>
      ${info && !small ? iconG(iconKey(info.space.icon), cx, cy - fs * 1.15, fs * 1.7, 'rico') : ''}
      <text class="rname" x="${cx}" y="${cy + (info && !small ? fs * 0.55 : fs * 0.3)}" font-size="${fs}" text-anchor="middle">${esc(label)}</text>
      ${!small ? `<text class="rarea" x="${cx}" y="${cy + fs * (info ? 1.75 : 1.5)}" font-size="${fs * 0.78}" text-anchor="middle">${fmt(area, 1)} м²</text>` : ''}
      ${info ? `<g class="rbadge"><circle cx="${bx}" cy="${by}" r="${fs * 0.72}"/><text x="${bx}" y="${by + fs * 0.27}" font-size="${fs * 0.72}" text-anchor="middle">${esc(badgeText(info))}</text></g>` : ''}
    </g>`;
  }).join('');

  const itemsSvg = ui.planItems ? d.ipins.map(({ pin, task }) => {
    const r = fs * 0.78;
    const src = mediaSrc(task.selected?.opt.imageId) || '';
    const ic = task.task.icon || 'box';
    const id = `ic${pin.id}`;
    return `<g class="ipin st-${task.status}" data-act="ipin-tap" data-id="${esc(pin.id)}">
      <circle class="ip-bg" vector-effect="non-scaling-stroke" cx="${pin.x}" cy="${pin.y}" r="${r}"/>
      ${src ? `<clipPath id="${id}"><circle cx="${pin.x}" cy="${pin.y}" r="${r * 0.86}"/></clipPath><image href="${src}" x="${pin.x - r}" y="${pin.y - r}" width="${r * 2}" height="${r * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`
        : iconG(iconKey(ic), pin.x, pin.y, r * 1.15, 'ip-ic')}
      <text class="ip-l" x="${pin.x}" y="${pin.y + r + fs * 0.85}" font-size="${fs * 0.68}" text-anchor="middle">${esc(task.task.title.length > 14 ? `${task.task.title.slice(0, 13)}…` : task.task.title)}</text>
    </g>`;
  }).join('') : '';

  return html`<svg class="plansvg" viewBox="${b.x} ${b.y} ${b.w} ${b.h}" style="aspect-ratio:${(b.w / b.h).toFixed(4)}" role="img" aria-label="План квартири">${raw(roomsSvg + itemsSvg)}</svg>`;
}

// ───────────── Редактор ─────────────
const clone = (x) => JSON.parse(JSON.stringify(x));
const snap = (ed) => ({ rooms: clone(ed.rooms), ipins: clone(ed.ipins) });
const stepFor = (ed) => (ed.k > 140 ? 0.05 : 0.1);

export function newEditor(d) {
  const ed = {
    rooms: d.rooms.map((r) => ({ id: r.room.id, spaceId: r.room.spaceId || '', pts: clone(r.pts) })),
    ipins: d.ipins.map((p) => ({ id: p.pin.id, taskId: p.pin.taskId, x: p.pin.x, y: p.pin.y })),
    gone: { rooms: [], ipins: [] },
    tool: 'select', sel: null, draw: null,
    vb: { x: -1, y: -1, w: 14 }, k: 40, undo: [], redo: [], changed: false, needFit: true,
  };
  return ed;
}
const editorOverlay = () => ui.overlays.find((o) => o.kind === 'editor');
const topIsEditor = () => ui.overlay && ui.overlay.kind === 'editor';

export function pushUndo(ed) {
  ed.undo.push(snap(ed));
  if (ed.undo.length > 60) ed.undo.shift();
  ed.redo = [];
  ed.changed = true;
}
function restore(ed, s) {
  ed.rooms = clone(s.rooms); ed.ipins = clone(s.ipins);
  if (ed.sel && !(ed.sel.kind === 'room' ? ed.rooms : ed.ipins).some((x) => x.id === ed.sel.id)) ed.sel = null;
}
export function edUndo(ed) { if (!ed.undo.length) return; ed.redo.push(snap(ed)); restore(ed, ed.undo.pop()); repaint(ed); }
export function edRedo(ed) { if (!ed.redo.length) return; ed.undo.push(snap(ed)); restore(ed, ed.redo.pop()); repaint(ed); }

export function edFit(ed, host = document.querySelector('.pl-host')) {
  if (!host) return;
  const W = host.clientWidth || 360, H = host.clientHeight || 400;
  const pts = [...ed.rooms.flatMap((r) => r.pts), ...ed.ipins.map((p) => [p.x, p.y])];
  let b = { x: 0, y: 0, w: 12, h: 8 };
  if (pts.length) { const bb = bbox(pts); b = { x: bb.x, y: bb.y, w: Math.max(bb.w, 3), h: Math.max(bb.h, 3) }; }
  const m = 1.2;
  const w = Math.max((b.w + m * 2), (b.h + m * 2) * (W / H));
  ed.vb = { x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - (w * H / W) / 2, w };
  repaint(ed);
}
export function edZoom(ed, factor, cx = null, cy = null) {
  const host = document.querySelector('.pl-host');
  if (!host) return;
  const W = host.clientWidth, H = host.clientHeight, h = ed.vb.w * H / W;
  const px = cx ?? ed.vb.x + ed.vb.w / 2, py = cy ?? ed.vb.y + h / 2;
  const w2 = clamp(ed.vb.w * factor, 2, 80), h2 = w2 * H / W;
  ed.vb = { x: px - ((px - ed.vb.x) / ed.vb.w) * w2, y: py - ((py - ed.vb.y) / h) * h2, w: w2 };
  repaint(ed);
}

// Привʼязка до сітки та до вершин сусідніх кімнат (щоб стіни збігались).
function snapPt(ed, x, y, ignore = null) {
  const thr = 14 / ed.k;
  let best = null, bd = thr;
  for (const r of ed.rooms) {
    r.pts.forEach((p, i) => {
      if (ignore && ignore.roomId === r.id && (ignore.idx === i || ignore.all)) return;
      const dd = Math.hypot(p[0] - x, p[1] - y);
      if (dd < bd) { bd = dd; best = p; }
    });
  }
  if (best) return { x: best[0], y: best[1], magnet: true };
  const s = stepFor(ed);
  return { x: sn(x, s), y: sn(y, s), magnet: false };
}

// ── Малювання SVG редактора ──
function edSvg(ed, d, W, H) {
  const { vb } = ed, k = ed.k, h = vb.w * H / W;
  const px = (n) => n / k; // піксель → метри
  const x0 = Math.floor(vb.x), x1 = Math.ceil(vb.x + vb.w), y0 = Math.floor(vb.y), y1 = Math.ceil(vb.y + h);
  let minor = '', major = '';
  const showMinor = k > 18;
  for (let x = x0; x <= x1; x++) { const s = `M${x} ${y0}V${y1}`; if (x % 5 === 0) major += s; else if (showMinor) minor += s; }
  for (let y = y0; y <= y1; y++) { const s = `M${x0} ${y}H${x1}`; if (y % 5 === 0) major += s; else if (showMinor) minor += s; }

  const status = (r) => { const info = d.spaceInfo.get(r.spaceId); return info ? `st-${info.status}` : 'st-none'; };
  const sel = ed.sel;
  const rooms = ed.rooms.map((r) => {
    const info = d.spaceInfo.get(r.spaceId);
    const pstr = r.pts.map((p) => p.join(',')).join(' ');
    const [cx, cy] = centroid(r.pts), fs = px(13);
    const isSel = sel?.kind === 'room' && sel.id === r.id;
    return `<g class="room ${status(r)} ${isSel ? 'sel' : ''}">
      <polygon class="wall" vector-effect="non-scaling-stroke" points="${pstr}"/>
      <polygon class="fill" vector-effect="non-scaling-stroke" data-hit="room:${esc(r.id)}" points="${pstr}"/>
      <text class="rname" x="${cx}" y="${cy}" font-size="${fs}" text-anchor="middle">${esc(info ? info.space.name : 'Кімната?')}</text>
      <text class="rarea" x="${cx}" y="${cy + fs * 1.25}" font-size="${fs * 0.82}" text-anchor="middle">${fmt(polyArea(r.pts), 1)} м²</text>
    </g>`;
  }).join('');

  let handles = '';
  if (sel?.kind === 'room') {
    const r = ed.rooms.find((x) => x.id === sel.id);
    if (r) {
      const fs = px(11.5);
      r.pts.forEach((p, i) => {
        const q = r.pts[(i + 1) % r.pts.length], len = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (len * k > 46) {
          const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
          handles += `<text class="edge" x="${mx}" y="${my - px(6)}" font-size="${fs}" text-anchor="middle">${fmt(len, 2)}</text>`;
        }
      });
      handles += r.pts.map((p, i) => `<circle class="vh" vector-effect="non-scaling-stroke" data-hit="v:${esc(r.id)}:${i}" cx="${p[0]}" cy="${p[1]}" r="${px(9)}"/>`).join('');
    }
  }

  const ipins = ed.ipins.map((p) => {
    const t = d.taskInfo.get(p.taskId);
    const r = px(15), isSel = sel?.kind === 'ipin' && sel.id === p.id;
    const src = t ? mediaSrc(t.selected?.opt.imageId) : '';
    const ic = t?.task.icon || 'box';
    const cid = `ec${p.id}`;
    return `<g class="ipin ${isSel ? 'sel' : ''}" data-hit="ip:${esc(p.id)}">
      <circle class="ip-bg" vector-effect="non-scaling-stroke" cx="${p.x}" cy="${p.y}" r="${r}"/>
      ${src ? `<clipPath id="${cid}"><circle cx="${p.x}" cy="${p.y}" r="${r * 0.86}"/></clipPath><image href="${src}" x="${p.x - r}" y="${p.y - r}" width="${r * 2}" height="${r * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${cid})"/>` : iconG(iconKey(ic), p.x, p.y, r * 1.15, 'ip-ic')}
      <text class="ip-l" x="${p.x}" y="${p.y + r + px(13)}" font-size="${px(11)}" text-anchor="middle">${esc(t ? (t.task.title.length > 14 ? `${t.task.title.slice(0, 13)}…` : t.task.title) : '?')}</text>
    </g>`;
  }).join('');

  let draw = '';
  const dr = ed.draw;
  if (dr?.kind === 'rect' && dr.b) {
    const x = Math.min(dr.a[0], dr.b[0]), y = Math.min(dr.a[1], dr.b[1]), w = Math.abs(dr.b[0] - dr.a[0]), hh = Math.abs(dr.b[1] - dr.a[1]);
    draw = `<rect class="draw" vector-effect="non-scaling-stroke" x="${x}" y="${y}" width="${w}" height="${hh}"/>
      <text class="edge big" x="${x + w / 2}" y="${y + hh / 2}" font-size="${px(14)}" text-anchor="middle">${fmt(w, 2)} × ${fmt(hh, 2)} м</text>`;
  } else if (dr?.kind === 'poly') {
    const pts = dr.cur ? [...dr.pts, dr.cur] : dr.pts;
    draw = `<polyline class="draw" vector-effect="non-scaling-stroke" points="${pts.map((p) => p.join(',')).join(' ')}"/>`
      + dr.pts.map((p, i) => `<circle class="vh ${i === 0 ? 'first' : ''}" vector-effect="non-scaling-stroke" cx="${p[0]}" cy="${p[1]}" r="${px(i === 0 ? 10 : 6)}"/>`).join('');
    if (dr.cur && dr.pts.length) {
      const l = dr.pts[dr.pts.length - 1];
      draw += `<text class="edge big" x="${(l[0] + dr.cur[0]) / 2}" y="${(l[1] + dr.cur[1]) / 2 - px(8)}" font-size="${px(13)}" text-anchor="middle">${fmt(Math.hypot(dr.cur[0] - l[0], dr.cur[1] - l[1]), 2)} м</text>`;
    }
  }
  if (ed.cursor && ['rect', 'poly', 'item'].includes(ed.tool) && !ed.draw?.kind) {
    draw += `<circle class="cur" cx="${ed.cursor.x}" cy="${ed.cursor.y}" r="${px(5)}"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.x} ${vb.y} ${vb.w} ${h}" width="${W}" height="${H}">
    <path class="grid" vector-effect="non-scaling-stroke" d="${minor}"/><path class="grid major" vector-effect="non-scaling-stroke" d="${major}"/>
    <path class="origin" vector-effect="non-scaling-stroke" d="M${x0} 0H${x1}M0 ${y0}V${y1}"/>
    ${rooms}${ipins}${draw}${handles}</svg>`;
}

export function repaint(ed, host = document.querySelector('.pl-host')) {
  if (!host) return;
  const W = host.clientWidth, H = host.clientHeight;
  if (!W || !H) return;
  ed.k = W / ed.vb.w;
  host.innerHTML = edSvg(ed, getDerived(), W, H);
  host._ed = ed;
}

// Викликається після кожного рендера застосунку: монтує/перемальовує редактор.
export function mountEditor() {
  const o = editorOverlay();
  const host = document.querySelector('.pl-host');
  if (!o || !host) return;
  const ed = o.ed;
  if (ed.needFit && host.clientWidth) { ed.needFit = false; edFit(ed, host); return; }
  repaint(ed, host);
}

// ── Дії над виділеним ──
export function edToolSet(ed, tool) {
  ed.tool = tool; ed.draw = null; ed.cursor = null;
  if (tool !== 'select') ed.sel = null;
  repaint(ed);
}
export function edSelected(ed) {
  if (!ed.sel) return null;
  return ed.sel.kind === 'room' ? ed.rooms.find((r) => r.id === ed.sel.id) : ed.ipins.find((r) => r.id === ed.sel.id);
}
export function edDelete(ed) {
  const s = ed.sel;
  if (!s) return;
  pushUndo(ed);
  if (s.kind === 'room') { ed.rooms = ed.rooms.filter((r) => r.id !== s.id); ed.gone.rooms.push(s.id); }
  else { ed.ipins = ed.ipins.filter((r) => r.id !== s.id); ed.gone.ipins.push(s.id); }
  ed.sel = null;
  repaint(ed);
}
export function edAssign(ed, spaceId) {
  const r = edSelected(ed);
  if (!r || ed.sel.kind !== 'room') return;
  pushUndo(ed);
  r.spaceId = spaceId;
  repaint(ed);
}
export function edSetRect(ed, w, h) {
  const r = edSelected(ed);
  if (!r || ed.sel.kind !== 'room' || !isRect(r.pts)) return;
  const b = bbox(r.pts);
  pushUndo(ed);
  r.pts = rectPts(b.x, b.y, clamp(num(w) || b.w, 0.3, 60), clamp(num(h) || b.h, 0.3, 60));
  repaint(ed);
}
export function edPolyFinish(ed) {
  const dr = ed.draw;
  if (dr?.kind !== 'poly' || dr.pts.length < 3) return null;
  pushUndo(ed);
  const room = { id: uid(), spaceId: '', pts: dr.pts };
  ed.rooms.push(room);
  ed.sel = { kind: 'room', id: room.id };
  ed.draw = null; ed.tool = 'select';
  repaint(ed);
  return room;
}
export function edPolyUndo(ed) {
  const dr = ed.draw;
  if (dr?.kind !== 'poly') return;
  dr.pts.pop();
  if (!dr.pts.length) ed.draw = null;
  repaint(ed);
}
export function edPlaceItem(ed, taskId, x, y) {
  pushUndo(ed);
  const p = { id: uid(), taskId, x, y };
  ed.ipins.push(p);
  ed.sel = { kind: 'ipin', id: p.id };
  ed.tool = 'select';
  repaint(ed);
}
export function edAutoFill(ed, d) {
  pushUndo(ed);
  const have = new Set(ed.rooms.map((r) => r.spaceId));
  const fresh = autoLayout(d.spaces.filter((s) => !have.has(s.space.id)));
  // нові ставимо нижче за наявні
  let dy = 0;
  if (ed.rooms.length) dy = bbox(ed.rooms.flatMap((r) => r.pts)).y2 + 1;
  fresh.forEach((r) => { r.pts = r.pts.map(([x, y]) => [x, +(y + dy).toFixed(2)]); ed.rooms.push(r); });
  edFit(ed);
  return fresh.length;
}

// Записати чернетку редактора у сховище (створити/оновити/видалити).
export function commitEditor(ed) {
  const existing = (id) => state.data[id] && !state.data[id].deleted;
  for (const r of ed.rooms) {
    const f = { spaceId: r.spaceId || '', pts: ptsToStr(r.pts) };
    if (existing(r.id)) {
      const cur = state.data[r.id];
      if (cur.pts !== f.pts || cur.spaceId !== f.spaceId) update(r.id, f);
    } else create('room', { id: r.id, ...f });
  }
  for (const id of ed.gone.rooms) if (existing(id)) update(id, { deleted: true });
  for (const p of ed.ipins) {
    const f = { taskId: p.taskId, x: +p.x.toFixed(2), y: +p.y.toFixed(2) };
    if (existing(p.id)) { const c = state.data[p.id]; if (c.x !== f.x || c.y !== f.y) update(p.id, f); } else create('ipin', { id: p.id, ...f });
  }
  for (const id of ed.gone.ipins) if (existing(id)) update(id, { deleted: true });
  // розміри з креслення → простори (формули одразу використають нову площу)
  for (const [spaceId, dims] of Object.entries(ed.apply || {})) if (existing(spaceId)) update(spaceId, dims);
  if (ed.changed) log('оновлено план квартири');
}

// ───────────── Жести (вказівник) ─────────────
let G = null;
const PTR = new Map();

function toWorld(host, ed, e) {
  const r = host.getBoundingClientRect();
  const h = ed.vb.w * r.height / r.width;
  return [ed.vb.x + ((e.clientX - r.left) / r.width) * ed.vb.w, ed.vb.y + ((e.clientY - r.top) / r.height) * h];
}

function pinchState(host) {
  const [a, b] = [...PTR.values()];
  const r = host.getBoundingClientRect();
  return { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2 - r.left, cy: (a.y + b.y) / 2 - r.top };
}

function onDown(e) {
  const host = e.target.closest?.('.pl-host');
  if (!host || !topIsEditor()) return;
  const ed = ui.overlay.ed;
  e.preventDefault();
  try { host.setPointerCapture?.(e.pointerId); } catch { /* синтетична подія */ }
  PTR.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (PTR.size === 2) {
    const p = pinchState(host);
    G = { type: 'pinch', ...p, vb: { ...ed.vb } };
    return;
  }
  const hit = e.target.closest('[data-hit]')?.dataset.hit || '';
  const [wx, wy] = toWorld(host, ed, e);
  const base = { sx: e.clientX, sy: e.clientY, wx, wy, moved: false, vb: { ...ed.vb }, host };

  if (ed.tool === 'select') {
    if (hit.startsWith('v:')) {
      const [, id, idx] = hit.split(':');
      const room = ed.rooms.find((r) => r.id === id);
      G = { ...base, type: 'vertex', id, idx: +idx, orig: clone(room.pts) };
    } else if (hit.startsWith('room:')) {
      const id = hit.slice(5);
      ed.sel = { kind: 'room', id };
      G = { ...base, type: 'room', id, orig: clone(ed.rooms.find((r) => r.id === id).pts) };
      requestRender(); repaint(ed, host);
    } else if (hit.startsWith('ip:')) {
      const id = hit.slice(3);
      ed.sel = { kind: 'ipin', id };
      const p = ed.ipins.find((x) => x.id === id);
      G = { ...base, type: 'ipin', id, ox: p.x, oy: p.y };
      requestRender(); repaint(ed, host);
    } else G = { ...base, type: 'pan' };
  } else if (ed.tool === 'rect') {
    const s = snapPt(ed, wx, wy);
    ed.draw = { kind: 'rect', a: [s.x, s.y], b: [s.x, s.y] };
    G = { ...base, type: 'rect' };
  } else {
    G = { ...base, type: 'tap' };
  }
}

function onMove(e) {
  const host = document.querySelector('.pl-host');
  if (!host || !topIsEditor()) return;
  const ed = ui.overlay.ed;
  if (PTR.has(e.pointerId)) PTR.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (!G) { // курсор-підказка для інструментів малювання
    if (['rect', 'poly', 'item'].includes(ed.tool) && e.target.closest?.('.pl-host') && e.pointerType === 'mouse') {
      const [wx, wy] = toWorld(host, ed, e);
      const s = snapPt(ed, wx, wy);
      ed.cursor = { x: s.x, y: s.y };
      if (ed.draw?.kind === 'poly') ed.draw.cur = [s.x, s.y];
      repaint(ed, host);
    }
    return;
  }
  if (G.type === 'pinch' && PTR.size >= 2) {
    const p = pinchState(host), W = host.clientWidth, H = host.clientHeight;
    const w2 = clamp(G.vb.w * (G.dist / p.dist), 2, 80), h0 = G.vb.w * H / W, h2 = w2 * H / W;
    const wx = G.vb.x + (G.cx / W) * G.vb.w, wy = G.vb.y + (G.cy / H) * h0;
    ed.vb = { x: wx - (p.cx / W) * w2, y: wy - (p.cy / H) * h2, w: w2 };
    repaint(ed, host);
    return;
  }
  const dxp = e.clientX - G.sx, dyp = e.clientY - G.sy;
  if (!G.moved && Math.hypot(dxp, dyp) < 5) return;
  const first = !G.moved;
  G.moved = true;
  const [wx, wy] = toWorld(host, ed, e);

  switch (G.type) {
    case 'pan': {
      const W = host.clientWidth;
      ed.vb = { ...G.vb, x: G.vb.x - dxp / (W / G.vb.w), y: G.vb.y - dyp / (W / G.vb.w) };
      repaint(ed, host);
      break;
    }
    case 'tap': { // у режимах «Контур»/«Речі» перетягування = панорама
      const W = host.clientWidth;
      ed.vb = { ...G.vb, x: G.vb.x - dxp / (W / G.vb.w), y: G.vb.y - dyp / (W / G.vb.w) };
      repaint(ed, host);
      break;
    }
    case 'rect': {
      const s = snapPt(ed, wx, wy);
      ed.draw.b = [s.x, s.y];
      repaint(ed, host);
      break;
    }
    case 'room': {
      if (first) pushUndo(ed);
      const room = ed.rooms.find((r) => r.id === G.id);
      let ox = wx - G.wx, oy = wy - G.wy;
      // магніт: вирівнюємо вершини кімнати по вершинах сусідів, інакше — по сітці
      const thr = 14 / ed.k;
      let best = null;
      for (const p of G.orig) {
        for (const r of ed.rooms) {
          if (r.id === G.id) continue;
          for (const q of r.pts) {
            const ddx = q[0] - (p[0] + ox), ddy = q[1] - (p[1] + oy), dd = Math.hypot(ddx, ddy);
            if (dd < thr && (!best || dd < best.dd)) best = { dd, ddx, ddy };
          }
        }
      }
      if (best) { ox += best.ddx; oy += best.ddy; } else { const s = stepFor(ed); ox = sn(G.orig[0][0] + ox, s) - G.orig[0][0]; oy = sn(G.orig[0][1] + oy, s) - G.orig[0][1]; }
      room.pts = G.orig.map(([x, y]) => [+(x + ox).toFixed(3), +(y + oy).toFixed(3)]);
      repaint(ed, host);
      break;
    }
    case 'vertex': {
      if (first) pushUndo(ed);
      const room = ed.rooms.find((r) => r.id === G.id);
      const s = snapPt(ed, wx, wy, { roomId: G.id, idx: G.idx, all: false });
      if (isRect(G.orig)) {
        const opp = G.orig[(G.idx + 2) % 4];
        const x = Math.min(opp[0], s.x), y = Math.min(opp[1], s.y), w = Math.max(0.3, Math.abs(s.x - opp[0])), h = Math.max(0.3, Math.abs(s.y - opp[1]));
        room.pts = rectPts(x, y, w, h);
      } else room.pts = G.orig.map((p, i) => (i === G.idx ? [s.x, s.y] : p));
      repaint(ed, host);
      break;
    }
    case 'ipin': {
      if (first) pushUndo(ed);
      const p = ed.ipins.find((x) => x.id === G.id);
      const s = stepFor(ed);
      p.x = sn(G.ox + (wx - G.wx), s); p.y = sn(G.oy + (wy - G.wy), s);
      repaint(ed, host);
      break;
    }
    default:
  }
}

function onUp(e) {
  const host = document.querySelector('.pl-host');
  PTR.delete(e.pointerId);
  if (!G || !host || !topIsEditor()) { if (!PTR.size) G = null; return; }
  const ed = ui.overlay.ed;
  if (G.type === 'pinch') { if (PTR.size < 2) G = null; return; }
  const g = G;
  G = null;
  const [wx, wy] = toWorld(host, ed, e);

  if (g.type === 'rect') {
    const dr = ed.draw; ed.draw = null;
    if (dr) {
      const x = Math.min(dr.a[0], dr.b[0]), y = Math.min(dr.a[1], dr.b[1]), w = Math.abs(dr.b[0] - dr.a[0]), h = Math.abs(dr.b[1] - dr.a[1]);
      if (w >= 0.5 && h >= 0.5) {
        pushUndo(ed);
        const room = { id: uid(), spaceId: '', pts: rectPts(x, y, w, h) };
        ed.rooms.push(room);
        ed.sel = { kind: 'room', id: room.id };
        ed.tool = 'select';
        ui.edNeedAssign = room.id;
      }
    }
    repaint(ed, host); requestRender();
    return;
  }
  if (g.type === 'pan') {
    if (!g.moved) { ed.sel = null; requestRender(); }
    repaint(ed, host);
    return;
  }
  if (g.type === 'tap' && !g.moved) {
    const s = snapPt(ed, wx, wy);
    if (ed.tool === 'poly') {
      const dr = (ed.draw ||= { kind: 'poly', pts: [] });
      const f = dr.pts[0];
      if (f && dr.pts.length >= 3 && Math.hypot(f[0] - s.x, f[1] - s.y) < 16 / ed.k) { edPolyFinish(ed); ui.edNeedAssign = ed.sel?.id; }
      else if (!dr.pts.length || dr.pts[dr.pts.length - 1][0] !== s.x || dr.pts[dr.pts.length - 1][1] !== s.y) dr.pts.push([s.x, s.y]);
      dr.cur = null;
    } else if (ed.tool === 'item') {
      const at = { x: sn(wx, stepFor(ed)), y: sn(wy, stepFor(ed)) };
      if (ed.pendingTask) { edPlaceItem(ed, ed.pendingTask, at.x, at.y); ed.pendingTask = null; } else ui.edPlace = at;
    }
    repaint(ed, host); requestRender();
    return;
  }
  if (g.moved || g.type === 'room' || g.type === 'ipin' || g.type === 'vertex') { repaint(ed, host); requestRender(); }
}

function onWheel(e) {
  const host = e.target.closest?.('.pl-host');
  if (!host || !topIsEditor()) return;
  e.preventDefault();
  const ed = ui.overlay.ed;
  const [wx, wy] = toWorld(host, ed, e);
  edZoom(ed, e.deltaY > 0 ? 1.12 : 1 / 1.12, wx, wy);
}

function onKey(e) {
  if (!topIsEditor()) return;
  const ed = ui.overlay.ed;
  if (e.target.matches?.('input,textarea,select')) return;
  if ((e.key === 'Delete' || e.key === 'Backspace') && ed.sel) { edDelete(ed); requestRender(); e.preventDefault(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { (e.shiftKey ? edRedo : edUndo)(ed); requestRender(); e.preventDefault(); }
  else if (e.key === 'Enter' && ed.draw?.kind === 'poly') { const r = edPolyFinish(ed); if (r) ui.edNeedAssign = r.id; requestRender(); }
}

export function initPlanner() {
  document.addEventListener('pointerdown', onDown, { passive: false });
  document.addEventListener('pointermove', onMove, { passive: false });
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onUp);
  document.addEventListener('wheel', onWheel, { passive: false });
  document.addEventListener('keydown', onKey);
  addEventListener('resize', () => { const o = editorOverlay(); if (o) repaint(o.ed); });
}

// ───────────── Розмітка панелі редактора (morph) ─────────────
const TOOLS = [
  ['select', 'cursor', 'Вибір'], ['rect', 'square', 'Кімната'], ['poly', 'polygon', 'Контур'], ['item', 'box', 'Речі'],
];
const HINTS = {
  select: 'Тапніть кімнату, щоб змінити її. Тягніть кімнату чи кутки, щоб перемістити або змінити розмір.',
  rect: 'Потягніть пальцем по плану, щоб намалювати прямокутну кімнату.',
  poly: 'Тапайте кути кімнати по черзі. Щоб замкнути — тапніть перший кут (або «Готово»).',
  item: 'Тапніть місце на плані, щоб поставити річ із ваших завдань.',
};

export function editorView(o, d) {
  const ed = o.ed;
  const sel = edSelected(ed);
  const room = sel && ed.sel.kind === 'room' ? sel : null;
  const ip = sel && ed.sel.kind === 'ipin' ? sel : null;
  const info = room ? d.spaceInfo.get(room.spaceId) : null;
  const rect = room && isRect(room.pts) ? bbox(room.pts) : null;
  const poly = ed.draw?.kind === 'poly' ? ed.draw : null;

  return html`
  <section class="editor ${o.closing ? 'out' : ''}" data-key="editor" role="dialog" aria-modal="true" aria-label="Редактор плану">
    <header class="ed-top">
      <button class="btn ghost" data-act="ed-cancel">Скасувати</button>
      <b>Креслення квартири</b>
      <button class="btn primary sm" data-act="ed-done">Готово</button>
    </header>

    <div class="ed-canvas">
      <div class="pl-host" data-static></div>
      <div class="ed-zoom">
        <button class="btn icon" data-act="ed-zoom" data-v="1" aria-label="Збільшити">${icon('zoomIn', 20)}</button>
        <button class="btn icon" data-act="ed-zoom" data-v="-1" aria-label="Зменшити">${icon('zoomOut', 20)}</button>
        <button class="btn icon" data-act="ed-fit" aria-label="Показати все">${icon('fit', 20)}</button>
      </div>
      ${!ed.rooms.length && !poly ? html`
        <div class="ed-empty"><p>Порожньо. Оберіть «Кімната» й намалюйте першу — або створіть чернетку з розмірів ваших просторів.</p>
          <button class="btn primary sm" data-act="ed-autofill">${icon('sparkle', 16)} Згенерувати з розмірів</button></div>` : ''}
    </div>

    <div class="ed-panel">
      ${poly ? html`
        <div class="ed-row"><span class="ed-h">${icon('polygon', 16)} Контур: ${poly.pts.length} ${poly.pts.length === 1 ? 'кут' : 'кутів'}</span>
          <span class="ed-btns"><button class="btn sm" data-act="ed-poly-undo">${icon('undo', 16)} Крок назад</button>
          <button class="btn sm primary" data-act="ed-poly-done" ${poly.pts.length < 3 ? 'disabled' : ''}>${icon('check', 16)} Готово</button></span></div>`
      : room ? html`
        <div class="ed-row">
          <button class="ed-sp ${info ? '' : 'none'}" data-act="ed-assign">
            ${info ? html`<span class="emo sm">${icon(info.space.icon, 20)}</span>` : html`<span class="emo sm">${icon('plus', 18)}</span>`}
            <span><small>Простір</small><b>${info ? info.space.name : 'Призначити простір'}</b></span>${icon('chevR', 16)}
          </button>
          <button class="btn icon ghost danger" data-act="ed-delete" aria-label="Видалити кімнату">${icon('trash', 20)}</button>
        </div>
        <div class="ed-stats">
          <span><small>Площа</small><b>${fmt(polyArea(room.pts), 2)} м²</b></span>
          <span><small>Периметр</small><b>${fmt(polyPerim(room.pts), 2)} м</b></span>
          ${rect ? html`
            <label><small>Довжина, м</small><input class="in" inputmode="decimal" data-change="ed-rect-w" value="${+rect.w.toFixed(2)}"></label>
            <label><small>Ширина, м</small><input class="in" inputmode="decimal" data-change="ed-rect-h" value="${+rect.h.toFixed(2)}"></label>` : ''}
        </div>
        ${info ? html`<button class="btn sm wide" data-act="ed-apply">${icon('ruler', 16)} Застосувати розміри до «${info.space.name}»</button>` : ''}`
      : ip ? html`
        <div class="ed-row"><span class="ed-h">${icon(d.taskInfo.get(ip.taskId)?.task.icon || 'box', 18)} ${d.taskInfo.get(ip.taskId)?.task.title || 'Річ'}</span>
          <button class="btn icon ghost danger" data-act="ed-delete" aria-label="Прибрати з плану">${icon('trash', 20)}</button></div>
        <p class="ed-hint">Перетягніть маркер у потрібне місце.</p>`
      : html`<p class="ed-hint">${HINTS[ed.tool]}</p>`}
    </div>

    <nav class="ed-tools">
      ${TOOLS.map(([k, ic, label]) => html`
        <button class="edt ${ed.tool === k ? 'on' : ''}" data-act="ed-tool" data-v="${k}">${icon(ic, 22)}<span>${label}</span></button>`)}
      <i class="edt-sep"></i>
      <button class="edt" data-act="ed-undo" ${ed.undo.length ? '' : 'disabled'}>${icon('undo', 22)}<span>Назад</span></button>
      <button class="edt" data-act="ed-redo" ${ed.redo.length ? '' : 'disabled'}>${icon('redo', 22)}<span>Вперед</span></button>
    </nav>
  </section>`;
}
