// Власний набір SVG-іконок RenoWise (сітка 24×24).
// Лінійні UI-іконки + двотонні «предметні» іконки: елементи з class="f" малюються напівпрозорою заливкою.
import { raw } from './util.js';

const R = (d, c = '') => `<path${c ? ` class="${c}"` : ''} d="${d}"/>`;
const FS = (d) => R(d, 'f') + R(d); // заливка + контур однієї фігури
const rect = (x, y, w, h, r = 1.6, fill = true) =>
  (fill ? `<rect class="f" x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/>` : '') + `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/>`;
const circ = (cx, cy, r, fill = false) => (fill ? `<circle class="f" cx="${cx}" cy="${cy}" r="${r}"/>` : '') + `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
const dot = (x, y) => R(`M${x} ${y}h.01`);

// ── Інтерфейс ──
const UI = {
  home: R('M3 11.2L12 4l9 7.2') + R('M5.5 9.8V20h13V9.8') + R('M10 20v-5.5h4V20'),
  grid: rect(3.5, 3.5, 7.2, 7.2, 2, false) + rect(13.3, 3.5, 7.2, 7.2, 2, false) + rect(3.5, 13.3, 7.2, 7.2, 2, false) + rect(13.3, 13.3, 7.2, 7.2, 2, false),
  map: R('M9 4L3 6.2v13.6L9 17.6l6 2.2 6-2.2V4.2L15 6.4z') + R('M9 4v13.6M15 6.4v13.4'),
  cart: circ(9, 20, 1.4) + circ(18, 20, 1.4) + R('M2.5 3.5h2.8l2.5 11.4a2 2 0 002 1.6h7.8a2 2 0 002-1.5L21 8H6.2'),
  sliders: R('M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1') + circ(15, 6, 2) + circ(9, 12, 2) + circ(17, 18, 2),
  plus: R('M12 5v14M5 12h14'),
  minus: R('M5 12h14'),
  x: R('M6 6l12 12M18 6L6 18'),
  check: R('M5 12.5l4.5 4.5L19 7.5'),
  chevD: R('M6 9l6 6 6-6'),
  chevU: R('M6 15l6-6 6 6'),
  chevL: R('M15 6l-6 6 6 6'),
  chevR: R('M9 6l6 6-6 6'),
  trash: R('M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3'),
  edit: R('M4 20h4L19 9l-4-4L4 16v4z') + R('M13.5 6.5l4 4'),
  camera: R('M4 8h3l2-3h6l2 3h3v11H4z') + circ(12, 13, 3.5),
  image: rect(3, 4, 18, 16, 2, false) + circ(9, 10, 1.7) + R('M21 16l-5-5-8 9'),
  link: R('M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1') + R('M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1'),
  store: R('M4 9l1.5-5h13L20 9') + R('M4 9a2.7 2.7 0 005.3 0 2.7 2.7 0 005.4 0A2.7 2.7 0 0020 9') + R('M5 12v8h14v-8'),
  undo: R('M9 14L4 9l5-5') + R('M4 9h10a6 6 0 010 12h-4'),
  redo: R('M15 14l5-5-5-5') + R('M20 9H10a6 6 0 000 12h4'),
  cloud: R('M7 18a4.5 4.5 0 01-.5-9A6 6 0 0118 10a4 4 0 01-1 8H7z'),
  cloudOff: R('M3 3l18 18') + R('M7 18a4.5 4.5 0 01-.9-8.9M9.5 5.6A6 6 0 0118 10a4 4 0 012 6.3'),
  download: R('M12 4v11M7 11l5 5 5-5M5 20h14'),
  upload: R('M12 16V5M7 9l5-5 5 5M5 20h14'),
  zoomIn: circ(11, 11, 6.5) + R('M20 20l-4.5-4.5M8.5 11h5M11 8.5v5'),
  zoomOut: circ(11, 11, 6.5) + R('M20 20l-4.5-4.5M8.5 11h5'),
  fit: R('M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4'),
  list: R('M9 6h11M9 12h11M9 18h11') + R('M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2'),
  pin: R('M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.8 12 21 12 21z') + circ(12, 9.5, 2.5),
  sun: circ(12, 12, 4) + R('M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4'),
  sparkle: R('M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z') + R('M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z'),
  user: circ(12, 8, 4) + R('M4 21c1-4 4-6 8-6s7 2 8 6'),
  users: circ(9, 8, 3.5) + R('M2.5 20c.8-3.6 3.2-5.5 6.5-5.5s5.7 1.9 6.5 5.5') + R('M15.5 4.6a3.5 3.5 0 010 6.8M17.5 14.7c2 .6 3.4 2.3 4 5.3'),
  copy: rect(8, 8, 12, 12, 2, false) + R('M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2'),
  refresh: R('M20 11a8 8 0 00-14.5-4M4 4v4h4M4 13a8 8 0 0014.5 4M20 20v-4h-4'),
  ext: R('M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5'),
  alert: R('M12 4l9 16H3z') + R('M12 10v4M12 17h.01'),
  coins: `<ellipse cx="12" cy="6" rx="7" ry="3"/>` + R('M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6'),
  ruler: R('M3 17L17 3l4 4L7 21z') + R('M7 13l2 2M10 10l2 2M13 7l2 2'),
  layers: R('M12 3.5l9 4.8-9 4.8-9-4.8z') + R('M3 12.6l9 4.8 9-4.8') + R('M3 16.8l9 4.8 9-4.8'),
  tag: R('M3.5 12V4.5h7.5l9.5 9.5-7.5 7.5z') + circ(7.7, 8.7, 1.2),
  search: circ(11, 11, 6.5) + R('M20 20l-4.4-4.4'),
  target: circ(12, 12, 9) + circ(12, 12, 5) + dot(12, 12),
  truck: R('M2.5 6.5h11v10h-11z') + R('M13.5 10h4.2l2.8 3v3.5h-7') + circ(7, 18, 1.8) + circ(17, 18, 1.8),
  pause: circ(12, 12, 9) + R('M10 9v6M14 9v6'),
  checkCircle: circ(12, 12, 9) + R('M8 12.4l2.8 2.8L16 9.6'),
  calendar: rect(3.5, 5, 17, 15.5, 2.5, false) + R('M3.5 10h17M8 3v4M16 3v4'),
  activity: R('M3 12h4l3-8 4 16 3-8h4'),
  pen: R('M4 20l3.5-1 11.2-11.2-2.5-2.5L5 16.5z') + R('M14.2 6.8l2.5 2.5'),
  square: rect(4.5, 4.5, 15, 15, 1.5, false),
  polygon: R('M12 3.5l8 5.8-3 9.7H7L4 9.3z'),
  cursor: R('M6 3.5l12 6.2-5.2 1.6L11 17z'),
  crop: R('M6 2.5V16a2 2 0 002 2h13.5') + R('M2.5 6H16a2 2 0 012 2v13.5'),
  rotate: R('M20 11a8 8 0 10-2.3 6') + R('M20 4.5V11h-6.5'),
  logout: R('M10 4H6a2 2 0 00-2 2v12a2 2 0 002 2h4M15 8l4 4-4 4M19 12H9'),
  share: circ(6, 12, 2.4) + circ(18, 6, 2.4) + circ(18, 18, 2.4) + R('M8.1 10.8l7.8-3.6M8.1 13.2l7.8 3.6'),
  key: circ(8, 15, 4) + R('M11 12l8-8M16 7l2.5 2.5M14 9l2 2'),
  clock: circ(12, 12, 9) + R('M12 7v5l3.5 2'),
  flag: R('M5 21V4M5 4h11l-2 4 2 4H5'),
  bell: R('M6 17V11a6 6 0 0112 0v6l1.5 2h-15z') + R('M10 21h4'),
  lock: rect(5, 11, 14, 9.5, 2.2, false) + R('M8 11V8a4 4 0 018 0v3'),
  move: R('M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3'),
  eye: R('M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z') + circ(12, 12, 3),
  chat: R('M4 5h16v11H9l-5 4z'),
  info: circ(12, 12, 9) + R('M12 11v5M12 8h.01'),
  hand: R('M8 12V5.5a1.5 1.5 0 013 0V11M11 10V4.5a1.5 1.5 0 013 0V11M14 10V6a1.5 1.5 0 013 0v7a6 6 0 01-6 6h-.5A5.5 5.5 0 015 13.5v-1a1.5 1.5 0 013 0'),
};

// ── Предметні двотонні іконки (кімнати, категорії, речі) ──
const OBJ = {
  home: FS('M5.5 10v10h13V10L12 4.6z') + R('M3 11.2L12 4l9 7.2') + R('M10 20v-5.5h4V20'),
  kitchen: FS('M5 11h14v6a3 3 0 01-3 3H8a3 3 0 01-3-3z') + R('M7 11a5 5 0 0110 0') + R('M3 12.5h2M19 12.5h2') + R('M10 2.4c-.7 1 .7 1.6 0 2.6M14 2.4c-.7 1 .7 1.6 0 2.6'),
  bed: R('M3 15h18v4H3z', 'f') + R('M3 19V6M21 19v-5a3 3 0 00-3-3h-7v4') + R('M3 15h18') + circ(7.5, 11.2, 1.9),
  sofa: FS('M3 13a2 2 0 014 0v1.5h10V13a2 2 0 014 0v5H3z') + R('M5 11V9a3 3 0 013-3h8a3 3 0 013 3v2') + R('M6 18v2M18 18v2'),
  bath: FS('M3 12h18v2a5 5 0 01-5 5H8a5 5 0 01-5-5z') + R('M6 12V6.5A2.5 2.5 0 018.5 4H10') + R('M7.5 19l-1 2M16.5 19l1 2') + dot(13, 7.5) + dot(16, 6) + dot(17.5, 8.5),
  door: FS('M6 21V4.5A1.5 1.5 0 017.5 3h9A1.5 1.5 0 0118 4.5V21z') + R('M4 21h16') + dot(15, 12.5),
  kids: circ(12, 13.5, 6.5, true) + circ(6.8, 6.8, 2.2) + circ(17.2, 6.8, 2.2) + dot(9.5, 12.5) + dot(14.5, 12.5) + R('M10.8 16c.8.7 1.6.7 2.4 0'),
  desk: rect(4, 4, 16, 10, 1.6) + R('M12 14v3.5M8.5 19h7') + R('M7.5 8h5'),
  balcony: circ(17.5, 6.5, 3, true) + R('M3 11h18M3 20h18M5 11v9M9.5 11v9M14 11v9M18.5 11v9'),
  garage: FS('M3 15l1.7-4.8A2.5 2.5 0 017 8.5h10a2.5 2.5 0 012.3 1.7L21 15v3.5H3z') + R('M3 15h18') + circ(7.5, 18.5, 1.7) + circ(16.5, 18.5, 1.7),
  laundry: rect(4.5, 3, 15, 18, 2) + circ(12, 13.5, 4.3) + dot(8, 6.5) + dot(11, 6.5) + R('M15 6.5h2') + R('M9.8 13.5c.8-.8 1.6-.8 2.4 0s1.6.8 2.4 0'),
  wardrobe: rect(4.5, 2.5, 15, 18, 1.5) + R('M12 2.5v18M9.5 11v2.5M14.5 11v2.5M7 20.5V22M17 20.5V22'),
  wc: rect(7, 2.5, 9, 6, 1.2) + FS('M5 10.5h14c0 4.2-2.6 6.7-5.2 7.3V21h-3.6v-3.2C7.6 17.2 5 14.7 5 10.5z'),
  plug: FS('M6 8h12v3a6 6 0 01-12 0z') + R('M9 3v5M15 3v5M12 17v4'),
  fridge: rect(6.5, 2.5, 11, 19, 2) + R('M6.5 10h11M9.5 5.5v2M9.5 12.5v3.5'),
  tv: rect(2.5, 5, 19, 12, 2) + R('M8 21h8M12 17v4'),
  lamp: FS('M12 3a6 6 0 00-3.6 10.8c.7.5 1.1 1.2 1.1 2V16h5v-.2c0-.8.4-1.5 1.1-2A6 6 0 0012 3z') + R('M9.8 19h4.4M10.6 21.5h2.8'),
  chair: FS('M7.5 3h9v8h-9z') + R('M5.5 11h13v3h-13z') + R('M7.5 14v7M16.5 14v7'),
  table: rect(3, 8, 18, 3, 1) + R('M6 11v9M18 11v9'),
  plant: FS('M8 15h8l-1 6H9z') + R('M12 15v-5') + R('M12 12c0-3.3-2.2-5.5-5.5-5.5 0 3.3 2.2 5.5 5.5 5.5zM12 10c0-3.3 2.2-5.5 5.5-5.5 0 3.3-2.2 5.5-5.5 5.5z'),
  pillow: FS('M4 7.2c3.2-1.4 12.8-1.4 16 0 1.3 3.2 1.3 6.4 0 9.6-3.2 1.4-12.8 1.4-16 0-1.3-3.2-1.3-6.4 0-9.6z') + dot(12, 12) + R('M4.6 6.6L7 9M19.4 6.6L17 9M4.6 17.4L7 15M19.4 17.4L17 15'),
  toaster: FS('M4 11a2 2 0 012-2h12a2 2 0 012 2v7a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 18z') + R('M8 9V6.5a1.5 1.5 0 013 0V9M13 9V6.5a1.5 1.5 0 013 0V9') + R('M17 14h1.5'),
  kettle: FS('M5 20h11l1-9a5.5 5.5 0 00-5.5-5.5h-1A5.5 5.5 0 004 11z') + R('M17 10.5L20.5 7') + R('M4.6 10C2 10 2 16 4.6 16') + R('M10 3.2h2'),
  tools: R('M10 6.5l3-3 7.5 7.5-3 3z', 'f') + R('M10 6.5l3-3 7.5 7.5-3 3z') + R('M12.5 11.5L5 19a1.5 1.5 0 002.1 2.1l7.4-7.4'),
  roller: rect(4, 3.5, 13, 5.5, 1.5) + R('M17 6.2h2.5v5.3H11.5V15') + rect(10, 15, 3, 6, 1),
  tile: rect(3.5, 3.5, 7.5, 7.5, 1.2) + rect(13, 3.5, 7.5, 7.5, 1.2, false) + rect(3.5, 13, 7.5, 7.5, 1.2, false) + rect(13, 13, 7.5, 7.5, 1.2) + R('M5.5 8.5l3-3'),
  floor: rect(3, 5, 18, 14, 1.5) + R('M3 9.7h18M3 14.3h18M9 5v4.7M15 9.7v4.6M8 14.3V19'),
  wall: rect(3, 4, 18, 16, 1.5) + R('M3 9.3h18M3 14.7h18M12 4v5.3M7.5 9.3v5.4M16.5 9.3v5.4M12 14.7V20'),
  faucet: R('M3 10h11a4 4 0 014 4v1.5') + R('M8.5 10V6M6 6h5') + FS('M18 18.5c-1 1.4-1.6 2-1.6 3a1.6 1.6 0 003.2 0c0-1-.6-1.6-1.6-3z'),
  bolt: FS('M13 2.5L5 13.5h6l-1 8 8-11h-6z'),
  window: rect(4, 3, 16, 18, 1.5) + R('M12 3v18M4 12h16'),
  curtain: R('M3 4h18') + FS('M5 4c0 6-.8 12-2 16h6c.8-4 1-10 0-16z') + FS('M19 4c0 6 .8 12 2 16h-6c-.8-4-1-10 0-16z'),
  frame: rect(3.5, 3.5, 17, 17, 1.5) + R('M7 16l3.5-4 2.5 2.5 2.5-3 1.5 2') + circ(9, 8.5, 1.2),
  rug: rect(3, 6.5, 18, 11, 2) + rect(6, 9.5, 12, 5, 1, false) + R('M3 9H1.5M3 12H1.5M3 15H1.5M21 9h1.5M21 12h1.5M21 15h1.5'),
  shelf: rect(5, 3, 14, 18, 1) + R('M5 9h14M5 15h14') + R('M8 9V6M11 9V5M14.5 9V6.5M8.5 15v-3M12 15v-4M15.5 15v-3'),
  box: FS('M12 3l8 4.5v9L12 21l-8-4.5v-9z') + R('M12 12l8-4.5M12 12v9M12 12L4 7.5'),
  sack: FS('M7.5 7C7.5 4.8 9 4 12 4s4.5.8 4.5 3L19 19a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 015 19z') + R('M8 10.5h8') + R('M10 4V3M14 4V3'),
  checklist: rect(4, 3.5, 16, 17, 2.4) + R('M8 9l1.5 1.5L12.5 7.5M8 15l1.5 1.5 3-3M15 9h2M15 15h2'),
  gift: rect(4, 9, 16, 11, 1.5) + R('M3 9h18v-3H3zM12 6v14') + R('M12 6c-1-3-5-3.5-5-1.2C7 6 9.5 6 12 6zM12 6c1-3 5-3.5 5-1.2C17 6 14.5 6 12 6z'),
};

export const OBJ_ICON_KEYS = Object.keys(OBJ);
export const ROOM_ICONS = ['home', 'kitchen', 'bed', 'sofa', 'bath', 'wc', 'door', 'kids', 'desk', 'balcony', 'laundry', 'garage', 'wardrobe', 'window'];
export const ITEM_ICONS = ['box', 'toaster', 'kettle', 'fridge', 'laundry', 'tv', 'plug', 'lamp', 'chair', 'table', 'sofa', 'bed', 'pillow', 'rug', 'curtain', 'shelf', 'wardrobe', 'plant', 'frame', 'faucet', 'bath', 'wc', 'bolt', 'window', 'tools', 'roller', 'tile', 'floor', 'wall', 'sack', 'gift', 'checklist'];

// Емодзі зі старих даних → нові іконки.
const LEGACY = { '🍳': 'kitchen', '🛏️': 'bed', '🛏': 'bed', '🛋️': 'sofa', '🛋': 'sofa', '🛁': 'bath', '🚪': 'door', '🧺': 'laundry', '🧒': 'kids', '💼': 'desk', '🌿': 'plant', '🚗': 'garage', '🔌': 'plug', '🪟': 'window', '📦': 'box', '🏠': 'home', '🧰': 'tools', '💡': 'lamp' };
export const iconKey = (v) => (OBJ[v] ? v : LEGACY[v] || 'home');

// Підказка іконки за назвою речі: «Тостер» → toaster, «Подушки на стільці» → pillow…
const HINTS_SRC = [
  ['тостер', 'toaster'], ['чайник|кавоварк|кофеварк', 'kettle'], ['холодильник|морозил', 'fridge'], ['пральн|сушильн|стиральн', 'laundry'],
  ['телевіз|телевиз|монітор|монитор|tv(?![\\p{L}])', 'tv'], ['люстр|ламп|світильник|светильник|бра(?![\\p{L}])|торшер', 'lamp'], ['стіл(?:ець|ьц)|стул|крісл|кресл', 'chair'],
  ['стіл(?![\\p{L}])|столи|стол(?![\\p{L}])', 'table'], ['диван|софа', 'sofa'], ['ліжк|кроват|матрац|матрас', 'bed'], ['подушк|плед|ковдр|одеял', 'pillow'],
  ['килим|ковер', 'rug'], ['штор|жалюзі|жалюзи|тюль', 'curtain'], ['полиц|стелаж', 'shelf'], ['шаф|гардероб|комод', 'wardrobe'],
  ['рослин|квіт|цвет|вазон|горщик', 'plant'], ['картин|рамк|дзеркал|зеркал|постер|декор', 'frame'], ['змішувач|смеситель|кран(?![\\p{L}])|раковин|мийк|мойк', 'faucet'],
  ['ванн|душ(?![\\p{L}])|кабін', 'bath'], ['унітаз|унитаз|біде', 'wc'], ['розетк|вимикач|выключат|електр|электр|проводк|кабел', 'bolt'],
  ['вікн|окн|підвіконн', 'window'], ['ламінат|паркет|підлог|пол(?![\\p{L}])|вініл|линолеум', 'floor'], ['плитк|кераміч|керамич|мозаїк', 'tile'],
  ['шпалер|обої|штукатур|цегл|гіпсокартон', 'wall'], ['фарб|краск|ґрунт|грунт|валик', 'roller'], ['суміш|смесь|клей|цемент|стяжк|шпаклів|шпатлев', 'sack'],
  ['інструмент|инструмент|дриль|дрель|перфоратор|молоток', 'tools'], ['подарун|подарок', 'gift'],
  ['витяжк|вытяжк|плит(?![\\p{L}])|духов|мікрохвиль|микроволн|блендер|міксер|пилосос|пылесос|кондиціонер|кондиционер|обігрівач|обогреват', 'plug'],
];
// Збіг лише з початку слова: «Вирівнювання» — не «ванна».
const HINTS = HINTS_SRC.map(([src, k]) => [new RegExp(`(?<![\\p{L}])(?:${src})`, 'iu'), k]);
// Головним вважається перше слово («Подушки на стільці» — це подушки, а не стілець); далі — уся назва.
export function suggestIcon(title = '') {
  const t = String(title).trim();
  const first = t.split(/\s+/)[0] || '';
  for (const part of [first, t]) for (const [re, k] of HINTS) if (part && re.test(part)) return k;
  return null;
}
const wrap = (inner, size, cls) => `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

// icon('plus') — UI-іконка; icon('kitchen') — предметна; підтримує старі емодзі.
export const icon = (name, size = 20, cls = '') => raw(wrap(UI[name] ?? OBJ[name] ?? OBJ[iconKey(name)], size, cls));
// Внутрішня розмітка для вбудови в SVG-план (<g transform="translate() scale()">).
export const iconInner = (name) => UI[name] ?? OBJ[name] ?? OBJ[iconKey(name)];

// ── Логотип ──
// Будиночок із «іскрою розуму»: покрівля й стіни промальовуються, іскра мерехтить.
export const brandMark = (size = 34, cls = '') => raw(`
  <span class="brand-mark ${cls}" style="--s:${size}px"><svg viewBox="0 0 48 48" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path class="bm-roof" pathLength="1" d="M9.5 24.5L22 13l12.5 11.5"/>
    <path class="bm-body" pathLength="1" d="M13.5 22.5V35h17V22.5"/>
    <path class="bm-door" pathLength="1" d="M19.5 35v-7h5v7"/>
    <path class="bm-spark" d="M37 6.5l1.4 3.8 3.8 1.4-3.8 1.4L37 17l-1.4-3.9-3.8-1.4 3.8-1.4z" fill="#fff" stroke="none"/>
  </svg></span>`);

// Слово RenoWise: «Wise» переливається, під ним «рулетка» з поділками, що відмірюється при появі.
export const brandName = (cls = '') => raw(`
  <span class="brand-name ${cls}" aria-label="RenoWise"><span class="b-reno">Reno</span><span class="b-wise">Wise</span><i class="brand-ruler"></i></span>`);
