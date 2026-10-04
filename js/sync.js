// Опційна синхронізація: Firebase Realtime Database + Google Auth + «спільний дім».
// Застосунок повністю працює й без неї. SDK вантажиться з CDN лише якщо збережено конфіг.
//
// Дім — це квартира з кількома мешканцями (різні Google-акаунти). Структура бази:
//   users/{uid}/home            — до якого дому належить користувач
//   invites/{CODE}              — запрошення { homeId, by, at } (код знає лише той, кому його передали)
//   homes/{hid}/members/{uid}   — учасники { name, photo, role, at }
//   homes/{hid}/meta            — { name, owner }
//   homes/{hid}/records/{id}    — усі дані (простори, завдання, варіанти, кімнати, активність…)
//   homes/{hid}/media/{id}      — стиснені фото
// Локальна IndexedDB — джерело правди. Записи з _d відправляються пачкою, коли є мережа;
// записи з хмари застосовуються за правилом last-write-wins (updatedAt).
import { state, hooks, applyRemote, markClean, dirtyRecords, putMedia, requestRender, log } from './store.js';
import * as db from './db.js';
import { me, setMe, setMembers } from './identity.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
const LS_KEY = 'reno.fb';
const LS_HOME = 'reno.home';
const INVITE_TTL = 14 * 864e5;

export const sync = { status: 'off', user: null, error: '', homeId: null, home: {}, notify: null };
// status: off | signedout | connecting | nohome | online | offline | error

let fb = null;
let connected = false;
let live = false;
let listening = false;
let flushing = false;
let again = false;
let unsubs = [];
const mediaDirty = new Set();
const pulling = new Set();

const setStatus = (status, error = '') => { sync.status = status; sync.error = error; requestRender(); };

export const getConfig = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)); } catch { return null; } };
export const saveConfig = (cfg) => localStorage.setItem(LS_KEY, JSON.stringify(cfg));
export const forgetConfig = () => { localStorage.removeItem(LS_KEY); localStorage.removeItem(LS_HOME); };
export const isConfigured = () => !!getConfig();

// Приймає і чистий JSON, і шматок коду `const firebaseConfig = { apiKey: "…", … }` з консолі Firebase.
export function parseConfig(text) {
  text = String(text || '').trim();
  let obj = null;
  try { obj = JSON.parse(text); } catch { /* спробуємо як JS-об'єкт */ }
  if (!obj || typeof obj !== 'object') {
    obj = {};
    for (const m of text.matchAll(/["']?([A-Za-z]+)["']?\s*:\s*["'`]([^"'`]*)["'`]/g)) obj[m[1]] = m[2];
  }
  const miss = ['apiKey', 'authDomain', 'databaseURL', 'projectId'].filter((k) => !obj[k]);
  if (miss.length) throw new Error(`У конфігу бракує: ${miss.join(', ')}. Для Realtime Database потрібен databaseURL.`);
  return obj;
}

// Правила безпеки для вставки в Firebase → Realtime Database → Rules.
// emails (необов'язково) обмежують, хто може СТВОРЮВАТИ дім; приєднатися можна лише за кодом від учасника.
export function rulesText(emails = []) {
  const allow = emails.length ? ` && (${emails.map((e) => `auth.token.email === '${e}'`).join(' || ')})` : '';
  const member = "auth != null && root.child('homes').child($hid).child('members').child(auth.uid).exists()";
  const rules = {
    rules: {
      users: { $uid: { '.read': 'auth != null && auth.uid === $uid', '.write': 'auth != null && auth.uid === $uid' } },
      invites: {
        $code: {
          '.read': 'auth != null',
          '.write': "auth != null && ((!newData.exists() && data.child('by').val() === auth.uid) || (newData.exists() && !data.exists() && root.child('homes').child(newData.child('homeId').val()).child('members').child(auth.uid).exists()))",
        },
      },
      homes: {
        $hid: {
          members: {
            '.read': member,
            $uid: {
              '.write': `auth != null && ((auth.uid === $uid && (data.exists() || (newData.child('code').val() != null && root.child('invites').child(newData.child('code').val()).child('homeId').val() === $hid) || (!root.child('homes').child($hid).child('members').exists()${allow}))) || root.child('homes').child($hid).child('members').child(auth.uid).child('role').val() === 'owner')`,
            },
          },
          meta: { '.read': member, '.write': member },
          records: { '.read': member, '.write': member },
          media: { '.read': member, '.write': member },
        },
      },
    },
  };
  return JSON.stringify(rules, null, 2);
}

function explain(e) {
  const c = e?.code || '';
  if (/permission[_-]denied/i.test(c + e?.message)) return 'Доступ заборонено: перевірте правила бази (Налаштування → Спільний дім).';
  if (c === 'auth/unauthorized-domain') return 'Домен не дозволено: додайте його в Firebase → Authentication → Settings → Authorized domains.';
  if (c === 'auth/operation-not-allowed') return 'Увімкніть вхід через Google у Firebase → Authentication → Sign-in method.';
  return e?.message || String(e);
}

const rid = (n, alphabet) => Array.from(crypto.getRandomValues(new Uint32Array(n)), (x) => alphabet[x % alphabet.length]).join('');
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // без O/0/I/1

export async function init() {
  const cfg = getConfig();
  if (!cfg) return setStatus('off');
  if (fb) return;
  setStatus('connecting');
  try {
    const [app, auth, rtdb] = await Promise.all([
      import(SDK + 'firebase-app.js'),
      import(SDK + 'firebase-auth.js'),
      import(SDK + 'firebase-database.js'),
    ]);
    const a = app.initializeApp(cfg);
    fb = { auth, rtdb, authI: auth.getAuth(a), db: rtdb.getDatabase(a) };
    auth.onAuthStateChanged(fb.authI, (user) => {
      if (user) {
        sync.user = { uid: user.uid, email: user.email, name: user.displayName, photo: user.photoURL };
        setMe({ uid: user.uid, name: user.displayName || (user.email || '').split('@')[0] || 'Я', photo: user.photoURL || '' });
        resolveHome();
      } else {
        sync.user = null; setMe(null); setMembers({}); detach(); setStatus('signedout');
      }
    });
    auth.getRedirectResult(fb.authI).catch((e) => setStatus('error', explain(e)));
  } catch (e) {
    fb = null;
    setStatus(navigator.onLine ? 'error' : 'offline', navigator.onLine ? `Не вдалося завантажити Firebase: ${explain(e)}` : '');
  }
}

export async function signIn() {
  if (!fb) throw new Error('Спочатку збережіть конфіг Firebase');
  const provider = new fb.auth.GoogleAuthProvider();
  try {
    await fb.auth.signInWithPopup(fb.authI, provider);
  } catch (e) {
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'].includes(e.code)) {
      await fb.auth.signInWithRedirect(fb.authI, provider);
    } else if (!['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(e.code)) {
      throw new Error(explain(e));
    }
  }
}
export const signOut = () => fb?.auth.signOut(fb.authI);
export const syncNow = () => fullSync();

// ── Дім ──
async function resolveHome() {
  const u = fb.authI.currentUser;
  if (!u) return;
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(LS_HOME)); } catch { /* ігноруємо */ }
  if (cached?.uid === u.uid && cached.hid) return attach(cached.hid); // працює й без мережі
  setStatus('connecting');
  try {
    const { rtdb } = fb;
    const s = await rtdb.get(rtdb.ref(fb.db, `users/${u.uid}/home`));
    if (s.val()) attach(s.val()); else setStatus('nohome');
  } catch (e) {
    setStatus(navigator.onLine ? 'error' : 'offline', navigator.onLine ? explain(e) : '');
  }
}

function attach(hid) {
  detach();
  const { rtdb, db: d } = fb;
  sync.homeId = hid;
  const u = fb.authI.currentUser;
  try { localStorage.setItem(LS_HOME, JSON.stringify({ uid: u.uid, hid })); } catch { /* ігноруємо */ }
  setStatus('connecting');
  db.getAll('media').then((ms) => ms.filter((m) => m._d).forEach((m) => mediaDirty.add(m.id))).catch(() => {});

  unsubs.push(rtdb.onValue(rtdb.ref(d, '.info/connected'), (snap) => {
    connected = !!snap.val();
    if (connected) { setStatus('online'); fullSync(); } else setStatus('offline');
  }));
  unsubs.push(rtdb.onValue(rtdb.ref(d, `homes/${hid}/members`), (snap) => {
    setMembers(snap.val() || {});
    requestRender();
  }, (e) => { // нас прибрали з дому
    if (/permission/i.test(e?.message || '')) { leaveLocal(); setStatus('nohome', 'Вас видалено з дому або дім більше не існує.'); }
  }));
  unsubs.push(rtdb.onValue(rtdb.ref(d, `homes/${hid}/meta`), (snap) => { sync.home = snap.val() || {}; requestRender(); }));

  hooks.onChange = schedulePush;
  hooks.onMedia = (rec) => { mediaDirty.add(rec.id); schedulePush(); };
  hooks.onRemote = (rec, isNew) => {
    if (live && isNew && rec.type === 'act' && rec.by !== me.uid) sync.notify?.(rec);
  };
}

function detach() {
  unsubs.forEach((f) => { try { f(); } catch { /* ігноруємо */ } });
  unsubs = [];
  connected = false; live = false; listening = false;
  hooks.onChange = null; hooks.onMedia = null; hooks.onRemote = null;
  sync.homeId = null; sync.home = {};
}
function leaveLocal() { detach(); setMembers({}); try { localStorage.removeItem(LS_HOME); } catch { /* ігноруємо */ } }

const profile = () => ({ name: me.name, photo: me.photo || '' });

export async function createHome(name) {
  const u = fb?.authI.currentUser;
  if (!u) throw new Error('Спочатку увійдіть через Google');
  const { rtdb, db: d } = fb;
  const hid = rid(20, 'abcdefghijklmnopqrstuvwxyz0123456789');
  try {
    await rtdb.update(rtdb.ref(d), {
      [`homes/${hid}/members/${u.uid}`]: { ...profile(), role: 'owner', at: Date.now() },
      [`users/${u.uid}/home`]: hid,
    });
    await rtdb.set(rtdb.ref(d, `homes/${hid}/meta`), { name: (name || '').trim() || 'Наш дім', owner: u.uid, at: Date.now() });
  } catch (e) { throw new Error(explain(e)); }
  attach(hid);
}

export async function createInvite() {
  if (!sync.homeId) throw new Error('Спочатку створіть дім');
  const { rtdb, db: d } = fb;
  const code = rid(8, CODE_ALPHABET);
  try { await rtdb.set(rtdb.ref(d, `invites/${code}`), { homeId: sync.homeId, by: fb.authI.currentUser.uid, at: Date.now() }); } catch (e) { throw new Error(explain(e)); }
  return code;
}

export async function joinHome(rawCode) {
  const u = fb?.authI.currentUser;
  if (!u) throw new Error('Спочатку увійдіть через Google');
  const code = String(rawCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 6) throw new Error('Введіть код запрошення');
  const { rtdb, db: d } = fb;
  let inv;
  try { inv = (await rtdb.get(rtdb.ref(d, `invites/${code}`))).val(); } catch (e) { throw new Error(explain(e)); }
  if (!inv) throw new Error('Код не знайдено. Перевірте, чи правильно він введений.');
  if (Date.now() - inv.at > INVITE_TTL) throw new Error('Термін дії коду минув — попросіть новий.');
  try {
    await rtdb.update(rtdb.ref(d), {
      [`homes/${inv.homeId}/members/${u.uid}`]: { ...profile(), role: 'member', code, at: Date.now() },
      [`users/${u.uid}/home`]: inv.homeId,
    });
  } catch (e) { throw new Error(explain(e)); }
  attach(inv.homeId);
  log('приєднання до дому');
}

export async function leaveHome() {
  const u = fb?.authI.currentUser;
  if (!u || !sync.homeId) return;
  const { rtdb, db: d } = fb;
  const hid = sync.homeId;
  try {
    await rtdb.update(rtdb.ref(d), { [`homes/${hid}/members/${u.uid}`]: null, [`users/${u.uid}/home`]: null });
  } catch (e) { throw new Error(explain(e)); }
  leaveLocal();
  setStatus('nohome');
}

export async function removeMember(uid) {
  if (!sync.homeId) return;
  const { rtdb, db: d } = fb;
  try { await rtdb.set(rtdb.ref(d, `homes/${sync.homeId}/members/${uid}`), null); } catch (e) { throw new Error(explain(e)); }
}

export async function renameHome(name) {
  if (!sync.homeId) return;
  const { rtdb, db: d } = fb;
  try { await rtdb.update(rtdb.ref(d, `homes/${sync.homeId}/meta`), { name: name.trim() || 'Наш дім' }); } catch (e) { throw new Error(explain(e)); }
}

// ── Обмін даними ──
let pushTimer;
function schedulePush() { clearTimeout(pushTimer); pushTimer = setTimeout(flush, 350); }
let pullTimer;
function schedulePull() { clearTimeout(pullTimer); pullTimer = setTimeout(pullMissingMedia, 400); }

async function fullSync() {
  if (!fb?.authI.currentUser || !sync.homeId) return;
  const { rtdb, db: d } = fb;
  const base = `homes/${sync.homeId}`;
  try {
    const snap = await rtdb.get(rtdb.ref(d, `${base}/records`));
    for (const rec of Object.values(snap.val() || {})) applyRemote(rec);
    if (!listening) {
      listening = true;
      const r = rtdb.ref(d, `${base}/records`);
      const on = (s) => { if (applyRemote(s.val())) schedulePull(); };
      unsubs.push(rtdb.onChildAdded(r, on));
      unsubs.push(rtdb.onChildChanged(r, on));
    }
    await flush();
    await pullMissingMedia();
    live = true;
    if (connected) setStatus('online');
  } catch (e) {
    setStatus(connected ? 'error' : 'offline', connected ? explain(e) : '');
  }
}

async function flush() {
  if (!fb || !connected || !sync.homeId) return;
  if (flushing) { again = true; return; }
  flushing = true;
  const { rtdb, db: d } = fb;
  const base = `homes/${sync.homeId}`;
  try {
    do {
      again = false;
      const dirty = dirtyRecords();
      if (dirty.length) {
        const multi = {};
        const stamps = [];
        for (const rec of dirty) {
          const clean = JSON.parse(JSON.stringify(rec)); // прибирає undefined
          delete clean._d;
          multi[`${base}/records/${rec.id}`] = clean;
          stamps.push([rec.id, rec.updatedAt]);
        }
        await rtdb.update(rtdb.ref(d), multi);
        stamps.forEach(([id, t]) => markClean(id, t));
      }
      for (const id of [...mediaDirty]) {
        const data = state.media[id];
        if (data) {
          await rtdb.set(rtdb.ref(d, `${base}/media/${id}`), { data, updatedAt: Date.now() });
          await db.put('media', { id, data, updatedAt: Date.now() }).catch(() => {});
        }
        mediaDirty.delete(id);
      }
    } while (again);
    if (connected) setStatus('online');
  } catch (e) {
    setStatus(connected ? 'error' : 'offline', connected ? explain(e) : '');
  } finally {
    flushing = false;
    requestRender();
  }
}

// Фото, на які посилаються записи, але яких немає локально (додані з іншого пристрою).
async function pullMissingMedia() {
  if (!fb || !connected || !sync.homeId) return;
  const { rtdb, db: d } = fb;
  const need = new Set();
  for (const r of Object.values(state.data)) {
    if (!r.deleted && r.imageId && !state.media[r.imageId]) need.add(r.imageId);
  }
  for (const id of need) {
    if (pulling.has(id)) continue;
    pulling.add(id);
    try {
      const s = await rtdb.get(rtdb.ref(d, `homes/${sync.homeId}/media/${id}`));
      if (s.val()?.data) await putMedia(id, s.val().data, false);
    } catch { /* спробуємо наступного разу */ } finally { pulling.delete(id); }
  }
}

addEventListener('online', () => { if (fb && fb.authI.currentUser) fullSync(); else init(); });
