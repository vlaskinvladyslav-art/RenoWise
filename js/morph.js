// Мікро-morph: оновлює існуючий DOM за новим HTML, не пересоздаючи вузли, що не змінилися.
// Завдяки цьому працюють CSS-переходи (акордеон, смужки, перемикачі), зберігаються фокус і скрол.
//
// Керуючі атрибути:
//   data-key="…"        — ключ вузла (стабільна ідентичність у списках)
//   data-keep           — не чіпати style/class (ними керує JS: слайдер сегмента тощо)
//   data-count="123"    — число, яке анімує JS; вміст не чіпаємо
//   data-static         — не заходити всередину (вміст контролює JS)

const isEl = (n) => n.nodeType === 1;
const keyOf = (n) => (isEl(n) ? n.getAttribute('data-key') : null);
const same = (a, b) => a.nodeType === b.nodeType && a.nodeName === b.nodeName;

export function morph(root, htmlString) {
  const tpl = document.createElement('template');
  tpl.innerHTML = htmlString;
  patchChildren(root, tpl.content);
}

function patchChildren(parent, source) {
  const oldNodes = Array.from(parent.childNodes);
  const keyed = new Map();
  const loose = [];
  for (const n of oldNodes) {
    const k = keyOf(n);
    if (k) keyed.set(k, n); else loose.push(n);
  }

  const kept = new Set();
  let li = 0;
  let ref = parent.firstChild;

  for (const s of Array.from(source.childNodes)) {
    let match = null;
    const k = keyOf(s);
    if (k) {
      const c = keyed.get(k);
      if (c && same(c, s) && !kept.has(c)) match = c;
    } else {
      const c = loose[li];
      if (c && same(c, s) && !kept.has(c)) { match = c; li++; }
    }

    if (match) {
      patchNode(match, s);
      kept.add(match);
      if (match === ref) ref = ref.nextSibling;
      else parent.insertBefore(match, ref);
    } else {
      parent.insertBefore(s, ref);
      kept.add(s);
    }
  }

  for (const n of oldNodes) if (!kept.has(n) && n.parentNode === parent) parent.removeChild(n);
}

function syncAttrs(old, src) {
  const keep = old.hasAttribute('data-keep');
  for (const a of Array.from(old.attributes)) {
    if (keep && (a.name === 'style' || a.name === 'class')) continue;
    if (!src.hasAttribute(a.name)) old.removeAttribute(a.name);
  }
  for (const a of Array.from(src.attributes)) {
    if (keep && (a.name === 'style' || a.name === 'class')) continue;
    if (old.getAttribute(a.name) !== a.value) old.setAttribute(a.name, a.value);
  }
}

function patchNode(old, src) {
  if (!isEl(old)) {
    if (old.nodeValue !== src.nodeValue) old.nodeValue = src.nodeValue;
    return;
  }
  syncAttrs(old, src);
  const tag = old.nodeName;

  if (old.hasAttribute('data-count') || old.hasAttribute('data-static')) return;

  if (tag === 'TEXTAREA') {
    const v = src.textContent;
    if (document.activeElement !== old && old.value !== v) old.value = v;
    return;
  }
  if (tag === 'INPUT') {
    if (old.type === 'checkbox' || old.type === 'radio') {
      old.checked = src.hasAttribute('checked');
    } else if (document.activeElement !== old) {
      const v = src.getAttribute('value') ?? '';
      if (old.value !== v) old.value = v;
    }
    return;
  }

  patchChildren(old, src);

  if (tag === 'SELECT') {
    const want = src.getAttribute('data-value');
    if (want != null && old.value !== want) old.value = want;
  }
}
