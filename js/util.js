/* Shared helpers: DOM, dates, ids, icons. No dependencies. */

/** @returns {HTMLElement|null} */
export const $  = (sel, root = document) => /** @type {HTMLElement|null} */ (root.querySelector(sel));
/** @returns {HTMLElement[]} */
export const $$ = (sel, root = document) => /** @type {HTMLElement[]} */ (Array.from(root.querySelectorAll(sel)));

/** Escape for safe interpolation into a template string. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

/** @returns {HTMLElement} */
export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return /** @type {HTMLElement} */ (t.content.firstElementChild);
}

export function uid(prefix = 'id') {
  const r = crypto.getRandomValues(new Uint32Array(2));
  return `${prefix}_${r[0].toString(36)}${r[1].toString(36)}`;
}

export const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);

/* ---------- dates ----------
   Calendar days as YYYY-MM-DD strings in local time. Never instants,
   so timezone maths never applies. */

export const DAY_MS = 86400000;

export const todayISO = () => toISO(new Date());

export function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function fromISO(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function addDays(iso, n) {
  const d = fromISO(iso);
  if (!d) return null;
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function daysBetween(aISO, bISO) {
  const a = fromISO(aISO); const b = fromISO(bISO);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

export function startOfWeek(iso) {
  const d = fromISO(iso);
  if (!d) return null;
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toISO(d);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDate(iso) {
  const d = fromISO(iso);
  if (!d) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return sameYear ? `${MONTHS[d.getMonth()]} ${d.getDate()}` : `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function fmtDateLong(iso) {
  const d = fromISO(iso);
  return d ? `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}` : '';
}

/** Relative due label plus a severity for styling. */
export function dueLabel(iso, today = todayISO()) {
  if (!iso) return null;
  const diff = daysBetween(today, iso);
  if (diff < -1)   return { text: `${Math.abs(diff)}d overdue`, tone: 'late' };
  if (diff === -1) return { text: 'Yesterday', tone: 'late' };
  if (diff === 0)  return { text: 'Today', tone: 'soon' };
  if (diff === 1)  return { text: 'Tomorrow', tone: 'soon' };
  if (diff <= 6)   return { text: fmtDate(iso), tone: 'soon' };
  return { text: fmtDate(iso), tone: 'normal' };
}

/** "3 minutes ago" for activity and comments. */
export function ago(isoInstant) {
  const then = new Date(isoInstant).getTime();
  if (Number.isNaN(then)) return '';
  const s = Math.round((Date.now() - then) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const hr = Math.round(m / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  if (d < 30) return `${d}d ago`;
  return fmtDate(isoInstant.slice(0, 10));
}

/* ---------- text ---------- */

export function initials(name) {
  const p = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** Case-insensitive subsequence match, for search and pickers. */
export function fuzzy(haystack, needle) {
  const hay = String(haystack).toLowerCase();
  const n = String(needle).toLowerCase().trim();
  if (!n) return 1;
  const at = hay.indexOf(n);
  if (at === 0) return 100;
  if (at > 0) return 70 - Math.min(at, 40);
  let i = 0;
  for (const ch of hay) { if (ch === n[i]) i += 1; if (i === n.length) return 20; }
  return 0;
}

export function debounce(fn, ms = 180) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* ---------- icons ----------
   Lucide path data, inlined so the app is fully offline and makes
   no CDN request. Status glyphs are shape-distinct on purpose:
   status must read without colour. */

const ICONS = {
  /* status */
  'circle-dashed': '<path d="M10.1 2.2a10 10 0 0 0-3.5 1.5M3.7 6.6a10 10 0 0 0-1.5 3.5M2.2 13.9a10 10 0 0 0 1.5 3.5M6.6 20.3a10 10 0 0 0 3.5 1.5M13.9 21.8a10 10 0 0 0 3.5-1.5M20.3 17.4a10 10 0 0 0 1.5-3.5M21.8 10.1a10 10 0 0 0-1.5-3.5M17.4 3.7a10 10 0 0 0-3.5-1.5"/>',
  'circle':        '<circle cx="12" cy="12" r="9"/>',
  'circle-half':   '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none"/>',
  'circle-slash':  '<circle cx="12" cy="12" r="9"/><path d="m8.5 8.5 7 7"/>',
  'circle-check':  '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',

  /* nav */
  home:     '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z"/>',
  user:     '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  inbox:    '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13a2 2 0 0 1 1.8 1.1l2.5 5A2 2 0 0 1 23 12v6a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2v-6a2 2 0 0 1 .2-.9l2.5-5A2 2 0 0 1 5.5 5Z"/>',
  list:     '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  columns:  '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18M15 3v18"/>',
  check:    '<polyline points="20 6 9 17 4 12"/>',
  gantt:    '<path d="M8 6h10M6 12h10M10 18h8M3 4v16"/>',
  users:    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',

  /* actions */
  plus:      '<path d="M5 12h14M12 5v14"/>',
  search:    '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  x:         '<path d="M18 6 6 18M6 6l12 12"/>',
  trash:     '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6"/>',
  archive:   '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/>',
  more:      '<circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>',
  filter:    '<path d="M3 5h18l-7 8v6l-4 2v-8Z"/>',
  sort:      '<path d="M3 6h11M3 12h8M3 18h5M17 8l3-3 3 3M20 5v14"/>',
  group:     '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/>',
  calendar:  '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  chevron:   '<path d="m6 9 6 6 6-6"/>',
  chevronL:  '<path d="m15 18-6-6 6-6"/>',
  chevronR:  '<path d="m9 18 6-6-6-6"/>',
  panelLeft: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>',
  arrow:     '<path d="M5 12h14M12 5l7 7-7 7"/>',
  sun:       '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon:      '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  alert:     '<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z"/><path d="M12 9v4M12 17h.01"/>',
  clock:     '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  message:   '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/>',
  send:      '<path d="M14.5 9.5 21 3M21 3l-6.5 18-4-9-9-4Z"/>',
  slack:     '<rect width="3" height="8" x="13" y="2" rx="1.5"/><path d="M19 8.5V10h1.5A1.5 1.5 0 1 0 19 8.5"/><rect width="3" height="8" x="8" y="14" rx="1.5"/><path d="M5 15.5V14H3.5A1.5 1.5 0 1 0 5 15.5"/><rect width="8" height="3" x="14" y="13" rx="1.5"/><path d="M15.5 19H14v1.5a1.5 1.5 0 1 0 1.5-1.5"/><rect width="8" height="3" x="2" y="8" rx="1.5"/><path d="M8.5 5H10V3.5A1.5 1.5 0 1 0 8.5 5"/>',
  download:  '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  upload:    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  mail:      '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  tag:       '<path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.8 8.8a2 2 0 0 0 2.8 0l7.2-7.2a2 2 0 0 0 0-2.8Z"/><circle cx="7" cy="7" r="1.2"/>',
  folder:    '<path d="M4 20a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2Z"/>',
  drag:      '<circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/>',
  sparkle:   '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>',
};

export function icon(name, cls = 'i') {
  const path = ICONS[name];
  if (!path) return '';
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}
