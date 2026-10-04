import { html, timeAgo } from '../util.js';
import { icon } from '../icons.js';
import { prefs } from '../prefs.js';
import { sync, getConfig, rulesText } from '../sync.js';
import { ui, seg, avatar } from '../ui.js';
import { dirtyRecords } from '../store.js';
import { me, memberList } from '../identity.js';

const STATUS_TEXT = {
  off: 'Не підключено — дані зберігаються лише на цьому пристрої',
  signedout: 'Підключено. Увійдіть через Google',
  connecting: 'З’єднання…',
  nohome: 'Ви увійшли. Створіть дім або приєднайтесь за кодом',
  online: 'Синхронізовано',
  offline: 'Немає мережі — зміни збережуться й відправляться пізніше',
  error: 'Помилка синхронізації',
};

function members() {
  const list = memberList().sort((a, b) => (b.role === 'owner') - (a.role === 'owner') || a.name.localeCompare(b.name, 'uk'));
  const iAmOwner = list.find((m) => m.uid === me.uid)?.role === 'owner';
  return html`
    <div class="members">
      ${list.map((m) => html`
        <div class="member" data-key="m-${m.uid}">
          ${avatar(m.uid, 38)}
          <span class="member-t"><b>${m.me ? `${m.name} (ви)` : m.name}</b><small>${m.role === 'owner' ? 'Власник дому' : 'Мешканець'}${m.joinedAt ? ` · додано ${timeAgo(m.joinedAt)}` : ''}</small></span>
          ${iAmOwner && !m.me ? html`<button class="btn icon ghost danger" data-act="member-remove" data-uid="${m.uid}" aria-label="Видалити учасника">${icon('x', 18)}</button>` : ''}
        </div>`)}
    </div>`;
}

function homeCard() {
  const cfg = getConfig();
  const pending = dirtyRecords().length;
  const email = sync.user?.email;
  const st = sync.status;
  return html`
  <section class="card set rise" style="--i:3">
    <h3>${icon('users', 18)} Спільний дім</h3>
    <p class="muted">Кілька людей — кілька акаунтів Google — ведуть одну квартиру й бачать зміни одне одного одразу. Без цього застосунок працює повністю, просто локально.</p>
    <div class="syncrow">
      <span class="dotl ${st}"></span>
      <div><b>${STATUS_TEXT[st] || ''}</b>
        ${pending && cfg && sync.homeId ? html`<small>Очікує відправки: ${pending}</small>` : ''}
        ${sync.error ? html`<small class="bad">${sync.error}</small>` : ''}
        ${email ? html`<small>${email}</small>` : ''}</div>
    </div>

    ${!cfg ? html`
      <label class="fld"><span class="fld-l">Конфіг Firebase</span>
        <textarea class="in" rows="5" data-ui="fbText" placeholder='Вставте сюди firebaseConfig з консолі Firebase (JSON або код)…'>${ui.fbText || ''}</textarea></label>
      <div class="row-btns"><button class="btn primary" data-act="fb-save">Зберегти конфіг</button></div>`
    : st === 'signedout' || !sync.user ? html`
      <div class="row-btns"><button class="btn primary" data-act="fb-signin">${icon('user', 18)} Увійти через Google</button>
        <button class="btn ghost danger" data-act="fb-forget">Забути конфіг</button></div>`
    : st === 'nohome' ? html`
      <div class="homebox">
        <b>${icon('home', 18)} Створити дім</b>
        <small class="muted">Ви станете власником і зможете запрошувати інших. Ваші локальні дані стануть спільними.</small>
        <div class="urlrow"><input class="in" data-ui="homeName" value="${ui.homeName || ''}" placeholder="Назва, напр. «Наша квартира»">
          <button class="btn primary sm" data-act="home-create">Створити</button></div>
      </div>
      <div class="homebox">
        <b>${icon('key', 18)} Приєднатися за кодом</b>
        <small class="muted">Попросіть у мешканця код запрошення. Ваші локальні дані додадуться до спільних.</small>
        <div class="urlrow"><input class="in code-in" data-ui="joinCode" value="${ui.joinCode || ''}" placeholder="КОД" maxlength="12" autocapitalize="characters">
          <button class="btn primary sm" data-act="home-join">Приєднатися</button></div>
      </div>
      <div class="row-btns"><button class="btn ghost" data-act="fb-signout">Вийти з акаунта</button></div>`
    : html`
      <label class="fld"><span class="fld-l">Назва дому</span>
        <input class="in" data-change="home-rename" value="${sync.home?.name ?? ''}" placeholder="Наш дім"></label>
      ${members()}
      <div class="row-btns">
        <button class="btn primary" data-act="home-invite">${icon('plus', 18)} Запросити</button>
        <button class="btn" data-act="fb-sync">${icon('refresh', 18)} Синхронізувати</button>
      </div>
      <div class="row-btns">
        <button class="btn ghost" data-act="fb-signout">Вийти з акаунта</button>
        <button class="btn ghost danger" data-act="home-leave">Вийти з дому</button>
      </div>`}

    <button class="link" data-act="toggle-ui" data-k="fbGuide">${ui.fbGuide ? 'Сховати' : 'Як налаштувати Firebase (5 хв, безкоштовно)'}</button>
    ${ui.fbGuide ? html`
      <ol class="guide">
        <li>Відкрийте <b>console.firebase.google.com</b> → «Add project» (тариф Spark безкоштовний).</li>
        <li><b>Build → Realtime Database → Create database</b> (будь-який регіон, режим Locked).</li>
        <li><b>Build → Authentication → Sign-in method</b> → увімкніть <b>Google</b>.</li>
        <li><b>Authentication → Settings → Authorized domains</b> → додайте домен застосунку (наприклад, <code>ваш-логін.github.io</code>).</li>
        <li><b>Project settings → Your apps → Web (&lt;/&gt;)</b> → скопіюйте <code>firebaseConfig</code> і вставте вище.</li>
        <li><b>Realtime Database → Rules</b> → вставте правила нижче. Вони пускають у дім лише його учасників, а приєднатися можна тільки за кодом від учасника.</li>
        <li>Увійдіть через Google → «Створити дім» → «Запросити» — і передайте код мешканцям.</li>
      </ol>
      <pre class="code">${rulesText([email].filter(Boolean))}</pre>
      <div class="row-btns"><button class="btn sm" data-act="copy-rules">${icon('copy', 16)} Копіювати правила</button></div>
      <p class="muted">Щоб лише вказані email могли створювати дім, дописані їх у правила (рядок із <code>auth.token.email</code> додається автоматично, коли ви вже увійшли). Фото зберігаються в Realtime Database (стиснені), тож платний тариф і Storage не потрібні.</p>` : ''}
  </section>`;
}

export function settingsView(d) {
  const cfg = d.cfg;
  return html`
  <section class="card set rise" style="--i:0">
    <h3>${icon('sun', 18)} Вигляд</h3>
    ${seg([{ v: 'auto', label: 'Авто' }, { v: 'dark', label: 'Темна' }, { v: 'light', label: 'Світла' }], prefs.theme, { act: 'theme' })}
  </section>

  <section class="card set rise" style="--i:1">
    <h3>${icon('coins', 18)} Бюджет</h3>
    <div class="fgrid">
      <label class="fld"><span class="fld-l">Загальний ліміт</span>
        <span class="inwrap has-unit"><input class="in" inputmode="decimal" data-change="cfg-budget" value="${cfg.totalBudget ?? ''}" placeholder="без ліміту"><em>${cfg.currency || '₴'}</em></span></label>
      <label class="fld"><span class="fld-l">Символ валюти</span>
        <input class="in" data-change="cfg-currency" value="${cfg.currency ?? '₴'}" maxlength="4"></label>
    </div>
    <p class="muted">Ліміт для окремого простору задається в його налаштуваннях (олівець на сторінці кімнати).</p>
  </section>

  <section class="card set rise" style="--i:2">
    <h3>${icon('link', 18)} Фото за посиланням</h3>
    <p class="muted">Щоб підтягнути фото й назву товару зі сторінки магазину, браузеру потрібен посередник (він бачить лише відкриту сторінку за вашим посиланням). Порожнє поле вимикає його — тоді працюють прямі посилання на зображення й власні фото.</p>
    <label class="fld"><span class="fld-l">Читання сторінки ({url} — місце для посилання)</span>
      <input class="in" data-change="cfg-og" value="${prefs.og ?? ''}" placeholder="https://api.microlink.io/?url={url}"></label>
    <label class="fld"><span class="fld-l">Копіювання фото для обрізання й офлайну</span>
      <input class="in" data-change="cfg-img" value="${prefs.img ?? ''}" placeholder="https://images.weserv.nl/?url={url}"></label>
  </section>

  ${homeCard()}

  <section class="card set rise" style="--i:4">
    <h3>${icon('download', 18)} Дані</h3>
    <div class="row-btns">
      <button class="btn" data-act="export">${icon('download', 18)} Експорт</button>
      <button class="btn" data-act="import">${icon('upload', 18)} Імпорт</button>
    </div>
    <div class="row-btns">
      <button class="btn ghost" data-act="quick-rooms">${icon('home', 18)} Типові кімнати</button>
      <button class="btn ghost" data-act="demo">${icon('sparkle', 18)} Демо-дані</button>
      <button class="btn ghost danger" data-act="wipe">${icon('trash', 18)} Видалити все</button>
    </div>
    ${ui.installEvt ? html`<div class="row-btns"><button class="btn primary" data-act="install">${icon('download', 18)} Встановити застосунок</button></div>` : ''}
  </section>

  <p class="foot rise" style="--i:5">RenoWise 2.0 · усе зберігається на пристрої${sync.homeId ? ' й у вашому спільному домі' : ''}</p>`;
}
