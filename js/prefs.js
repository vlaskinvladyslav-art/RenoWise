// Налаштування конкретного пристрою (не синхронізуються): тема, сервіси для фото за посиланням.
const KEY = 'reno.prefs';
export const DEFAULT_OG = 'https://api.microlink.io/?url={url}';
export const DEFAULT_IMG = 'https://images.weserv.nl/?url={url}';

export const prefs = { theme: 'auto', og: DEFAULT_OG, img: DEFAULT_IMG };
try { Object.assign(prefs, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* приватний режим */ }

export const savePrefs = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* ігноруємо */ } };

const mq = matchMedia('(prefers-color-scheme: light)');
export function applyTheme() {
  const t = prefs.theme === 'auto' ? (mq.matches ? 'light' : 'dark') : prefs.theme;
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'light' ? '#f3f5fb' : '#080b14');
}
mq.addEventListener?.('change', () => prefs.theme === 'auto' && applyTheme());
