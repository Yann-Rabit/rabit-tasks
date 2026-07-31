/* ============================================================
   Popover engine + every picker built on it.
   ============================================================
   One menu implementation, so a status picker in a row, in a
   board card, and in the drawer behave identically.

   Craft notes:
   · Rendered to document.body and positioned fixed, so it never
     gets clipped by an overflow:auto ancestor.
   · transform-origin is set from the trigger, so it scales out
     of the thing you clicked (Emil).
   · Full keyboard: arrows, Home/End, type-to-filter, Enter,
     Escape, and focus returns to the trigger on close.
   ============================================================ */

import { $, $$, esc, icon, h, fuzzy } from '../util.js';
import { STATUS, STATUS_ORDER, PRIORITY, PRIORITY_ORDER, PROJECT, PROJECT_ORDER } from '../types.js';
import { initials, todayISO, addDays, fmtDate } from '../util.js';

let open = null;   // { el, trigger, onClose }

export function closeMenu() {
  if (!open) return;
  const { el, trigger, onClose } = open;
  open = null;
  el.remove();
  document.removeEventListener('keydown', onKey, true);
  document.removeEventListener('mousedown', onOutside, true);
  window.removeEventListener('resize', closeMenu);
  window.removeEventListener('scroll', closeMenu, true);
  trigger?.setAttribute('aria-expanded', 'false');
  trigger?.focus?.({ preventScroll: true });
  onClose?.();
}

function onOutside(e) {
  if (open && !open.el.contains(e.target) && e.target !== open.trigger) closeMenu();
}

function onKey(e) {
  if (!open) return;
  const items = $$('.menu__item:not([hidden])', open.el);
  const at = items.findIndex((i) => i.dataset.active === 'true');

  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); return; }
  if (e.key === 'Tab') { e.preventDefault(); closeMenu(); return; }

  if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
    e.preventDefault();
    if (!items.length) return;
    let next;
    if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    else next = at < 0 ? (e.key === 'ArrowDown' ? 0 : items.length - 1)
                       : (at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items.forEach((i) => { i.dataset.active = 'false'; });
    items[next].dataset.active = 'true';
    items[next].scrollIntoView({ block: 'nearest' });
    return;
  }

  if (e.key === 'Enter') {
    e.preventDefault();
    items[at < 0 ? 0 : at]?.click();
  }
}

/**
 * @param {HTMLElement} trigger
 * @param {{items: Array<any>, label?: string, filter?: boolean, align?: 'left'|'right',
 *          activeIndex?: number, onClose?: () => void}} opts
 * @param {(value:any)=>void} [onPick]
 */
export function openMenu(trigger, opts, onPick) {
  closeMenu();

  const { items, label = '', filter = false, align = 'left' } = opts;
  const el = h(`<div class="menu" role="menu" ${label ? `aria-label="${esc(label)}"` : ''}>
    ${filter ? '<input class="menu__filter input" type="text" placeholder="Search…" aria-label="Filter options">' : ''}
    ${label && !filter ? `<div class="menu__label">${esc(label)}</div>` : ''}
    <div class="menu__items"></div>
  </div>`);

  const host = $('.menu__items', el);
  host.innerHTML = items.map((it, i) => it.sep
    ? '<div class="menu__sep"></div>'
    : `<button class="menu__item${it.danger ? ' menu__item--danger' : ''}" role="menuitem"
         data-i="${i}" data-active="${i === (opts.activeIndex ?? -1)}"
         ${it.checked !== undefined ? `aria-checked="${!!it.checked}" role="menuitemradio"` : ''}>
        ${it.icon ? icon(it.icon) : it.glyph ?? ''}
        <span class="menu__sp">${esc(it.label)}</span>
        ${it.hint ? `<span class="menu__hint">${esc(it.hint)}</span>` : ''}
        ${it.checked !== undefined ? `<span class="menu__tick">${icon('check', 'i--sm')}</span>` : ''}
      </button>`).join('');

  document.body.appendChild(el);

  // Position: below the trigger, flipped when it would leave the viewport.
  const r = trigger.getBoundingClientRect();
  const mw = el.offsetWidth;
  const mh = el.offsetHeight;
  const gap = 5;
  let left = align === 'right' ? r.right - mw : r.left;
  let top = r.bottom + gap;
  let originY = 'top';

  if (top + mh > window.innerHeight - 8) {
    if (r.top - mh - gap > 8) { top = r.top - mh - gap; originY = 'bottom'; }
    else { top = Math.max(8, window.innerHeight - mh - 8); }
  }
  left = Math.min(Math.max(8, left), window.innerWidth - mw - 8);

  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
  el.style.setProperty('--origin', `${originY} ${align === 'right' ? 'right' : 'left'}`);

  trigger.setAttribute('aria-expanded', 'true');
  open = { el, trigger, onClose: opts.onClose };

  el.addEventListener('click', (e) => {
    const btn = e.target.closest('.menu__item');
    if (!btn) return;
    const item = items[Number(btn.dataset.i)];
    closeMenu();
    item?.onSelect ? item.onSelect() : onPick?.(item?.value);
  });

  if (filter) {
    const input = $('.menu__filter', el);
    input.addEventListener('input', () => {
      const q = input.value;
      $$('.menu__item', el).forEach((btn) => {
        const it = items[Number(btn.dataset.i)];
        btn.hidden = fuzzy(it.label, q) === 0;
      });
      const first = $$('.menu__item:not([hidden])', el)[0];
      $$('.menu__item', el).forEach((b) => { b.dataset.active = 'false'; });
      if (first) first.dataset.active = 'true';
    });
    input.focus();
  } else {
    const first = $$('.menu__item', el).find((b) => b.dataset.active === 'true') || $$('.menu__item', el)[0];
    if (first) { first.dataset.active = 'true'; }
    el.focus?.();
  }

  document.addEventListener('keydown', onKey, true);
  document.addEventListener('mousedown', onOutside, true);
  window.addEventListener('resize', closeMenu);
  window.addEventListener('scroll', closeMenu, true);
  return el;
}

/* ============================================================
   Pickers
   ============================================================ */

export function statusPicker(trigger, current, onPick) {
  openMenu(trigger, {
    label: 'Status',
    activeIndex: STATUS_ORDER.indexOf(current),
    items: STATUS_ORDER.map((k) => ({
      value: k,
      label: STATUS[k].label,
      glyph: `<span data-tone="${STATUS[k].tone}">${icon(STATUS[k].glyph, 'sglyph')}</span>`,
      checked: k === current,
    })),
  }, onPick);
}

export function priorityPicker(trigger, current, onPick) {
  openMenu(trigger, {
    label: 'Priority',
    activeIndex: PRIORITY_ORDER.indexOf(current),
    items: PRIORITY_ORDER.map((k) => ({
      value: k,
      label: PRIORITY[k].label,
      glyph: `<span class="prio-wrap" data-tone="${PRIORITY[k].tone}"><span class="prio">${
        [1, 2, 3].map((n) => `<i class="${n <= PRIORITY[k].bars ? 'on' : ''}"></i>`).join('')
      }</span></span>`,
      checked: k === current,
    })),
  }, onPick);
}

export function assigneePicker(trigger, state, current, onPick) {
  const items = [
    ...state.members.map((m) => ({
      value: m.id,
      label: m.name,
      glyph: `<span class="avatar" style="width:18px;height:18px;font-size:9px">${esc(initials(m.name))}</span>`,
      checked: m.id === current,
    })),
    { value: null, label: 'Unassigned', icon: 'user', checked: current == null },
  ];
  openMenu(trigger, { label: 'Assignee', items }, onPick);
}

export function projectPicker(trigger, current, onPick) {
  openMenu(trigger, {
    label: 'Project',
    items: [
      ...PROJECT_ORDER.map((k) => ({ value: k, label: PROJECT[k].label, icon: 'folder', checked: k === current })),
      { value: null, label: 'No project', icon: 'x', checked: current == null },
    ],
  }, onPick);
}

/** Relative shortcuts first — a founder sets "tomorrow" far more than a date. */
export function duePicker(trigger, current, onPick) {
  const t = todayISO();
  const presets = [
    { value: t, label: 'Today', hint: fmtDate(t) },
    { value: addDays(t, 1), label: 'Tomorrow', hint: fmtDate(addDays(t, 1)) },
    { value: addDays(t, 7), label: 'Next week', hint: fmtDate(addDays(t, 7)) },
    { value: addDays(t, 14), label: 'In two weeks', hint: fmtDate(addDays(t, 14)) },
    { sep: true },
    { value: '__pick__', label: 'Pick a date…', icon: 'calendar' },
  ];
  if (current) presets.push({ sep: true }, { value: null, label: 'Clear due date', icon: 'x' });

  openMenu(trigger, { label: 'Due', items: presets }, (value) => {
    if (value !== '__pick__') { onPick(value); return; }

    // Native date input, positioned under the trigger and opened at once.
    const wrap = h(`<div class="menu" style="padding:8px"><input class="input" type="date" value="${esc(current ?? '')}" aria-label="Due date"></div>`);
    document.body.appendChild(wrap);
    const r = trigger.getBoundingClientRect();
    wrap.style.left = `${Math.round(Math.min(r.left, window.innerWidth - wrap.offsetWidth - 8))}px`;
    wrap.style.top = `${Math.round(r.bottom + 5)}px`;
    const input = $('input', wrap);
    const done = (v) => { wrap.remove(); document.removeEventListener('mousedown', away, true); if (v !== undefined) onPick(v); };
    const away = (e) => { if (!wrap.contains(e.target)) done(); };
    input.addEventListener('change', () => done(input.value || null));
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') done(); });
    document.addEventListener('mousedown', away, true);
    input.focus();
    input.showPicker?.();
  });
}
