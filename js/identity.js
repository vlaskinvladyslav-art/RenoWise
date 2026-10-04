// Хто зараз працює в застосунку і хто ще живе в цьому домі.
import { colorFor } from './util.js';

export const me = { uid: 'local', name: 'Я', photo: '' };
export const members = {}; // uid → { name, photo, role }

export function setMe(u) { Object.assign(me, { uid: 'local', name: 'Я', photo: '' }, u || {}); }
export function setMembers(m) {
  for (const k of Object.keys(members)) delete members[k];
  Object.assign(members, m || {});
}

export function personOf(uid, fallbackName = '') {
  // записи, зроблені до входу в акаунт (uid 'local'), — теж мої
  if (uid === me.uid || uid === 'local') return { uid: me.uid, name: me.name, photo: me.photo, me: true, color: colorFor(me.uid) };
  const m = members[uid];
  return { uid, name: m?.name || fallbackName || 'Хтось із дому', photo: m?.photo || '', me: false, color: colorFor(uid || '') };
}
export const memberList = () => Object.entries(members).map(([uid, m]) => ({ uid, role: m.role, ...personOf(uid), joinedAt: m.at }));
