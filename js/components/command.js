/* ============================================================
   CommandMenu — search and every action, from the keyboard.
   ============================================================
   Deliberately has NO open/close animation. It is used dozens of
   times a day; animating it would make the app feel slower every
   single time (Emil's frequency rule). Raycast does the same.

   Typing something that matches nothing offers to create it, so
   the shortest path from thought to tracked task is ⌘K, type,
   Enter.
   ============================================================ */

import { $, $$, esc, icon, h, fuzzy } from '../util.js';
import { STATUS, PRIORITY, VIEWS } from '../types.js';
import { taskKey, isOpen, memberOf } from '../store.js';
import { statusGlyph } from './ui.js';

let dlg = null;
let items = [];
let cursor = 0;
let onCreate = null;

function ensure() {
  if (dlg) return dlg;
  dlg = h(`<dialog class="cmd-dialog">
    <div class="cmd">
      <label class="sr-only" for="cmd-input">Search tasks or run a command</label>
      <input class="cmd__input" id="cmd-input" role="combobox" aria-expanded="true"
             aria-controls="cmd-list" aria-autocomplete="list" autocomplete="off" spellcheck="false"
             placeholder="Search tasks, or type to create one…">
      <div class="cmd__list" id="cmd-list" role="listbox" aria-label="Results"></div>
    </div>
  </dialog>`);
  document.body.appendChild(dlg);

  const input = $('#cmd-input', dlg);
  const list = $('#cmd-list', dlg);

  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => { input.value = ''; });
  input.addEventListener('input', () => refresh(input.value));

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Home') { e.preventDefault(); cursor = 0; paint(); }
    else if (e.key === 'End') { e.preventDefault(); cursor = items.length - 1; paint(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const it = items[cursor];
      if (it) { dlg.close(); it.run(input.value.trim()); }
    }
  });

  list.addEventListener('click', (e) => {
    const opt = e.target.closest('[data-i]');
    if (!opt) return;
    const it = items[Number(opt.dataset.i)];
    if (it) { dlg.close(); it.run(input.value.trim()); }
  });

  return dlg;
}

function move(delta) {
  if (!items.length) return;
  cursor = (cursor + delta + items.length) % items.length;
  paint();
  $(`[data-i="${cursor}"]`, dlg)?.scrollIntoView({ block: 'nearest' });
}

let commands = [];

function refresh(query) {
  const q = query.trim();

  // No query → authored order, groups stay contiguous.
  items = q
    ? commands
      .map((c) => ({ ...c, _s: fuzzy(`${c.label} ${c.hint ?? ''} ${c.keywords ?? ''}`, q) }))
      .filter((c) => c._s > 0)
      .sort((a, b) => b._s - a._s || a.order - b.order)
      .slice(0, 40)
    : commands.slice(0, 40);

  if (q && !items.some((i) => i.exact)) {
    items.unshift({
      group: 'Create', label: `Create task “${q}”`, icon: 'plus', hint: 'Enter',
      run: (text) => onCreate?.(text),
    });
  }
  cursor = 0;
  paint();
}

function paint() {
  const list = $('#cmd-list', dlg);
  const input = $('#cmd-input', dlg);

  if (!items.length) {
    list.innerHTML = `<p style="padding:18px 12px;font-size:var(--fs-ui);color:var(--text-3)">No match.</p>`;
    input.removeAttribute('aria-activedescendant');
    return;
  }

  let html = '';
  let group = null;
  items.forEach((it, i) => {
    if (it.group !== group) {
      group = it.group;
      html += `<div class="menu__label">${esc(group ?? '')}</div>`;
    }
    html += `<button class="menu__item" role="option" id="cmd-opt-${i}" data-i="${i}"
               aria-selected="${i === cursor}" data-active="${i === cursor}">
        ${it.glyph ?? icon(it.icon ?? 'arrow')}
        <span class="menu__sp">${esc(it.label)}</span>
        ${it.hint ? `<span class="menu__hint">${esc(it.hint)}</span>` : ''}
      </button>`;
  });
  list.innerHTML = html;
  input.setAttribute('aria-activedescendant', `cmd-opt-${cursor}`);
}

/**
 * @param {object} cfg
 * @param {any} cfg.state
 * @param {(id:string)=>void} cfg.go
 * @param {(kind:string, arg?:any)=>void} cfg.act
 * @param {(title:string)=>void} cfg.create
 */
export function openCommand(cfg) {
  ensure();
  onCreate = cfg.create;
  commands = build(cfg);
  $('#cmd-input', dlg).value = '';
  refresh('');
  if (!dlg.open) dlg.showModal();
  $('#cmd-input', dlg).focus();
}

function build({ state, go, act }) {
  const out = [];

  VIEWS.forEach((v, i) => out.push({
    group: 'Go to', label: v.label, icon: v.icon, hint: String(i + 1),
    keywords: 'view navigate open', run: () => go(v.id),
  }));

  out.push(
    { group: 'Create', label: 'New task', icon: 'plus', hint: 'C', keywords: 'add task', run: () => act('new') },
  );

  out.push(
    { group: 'Actions', label: 'Toggle light and dark', icon: 'moon', keywords: 'theme dark mode', run: () => act('theme') },
    { group: 'Actions', label: 'Export workspace', icon: 'download', keywords: 'backup save json', run: () => act('export') },
    { group: 'Actions', label: 'Keyboard shortcuts', icon: 'sparkle', hint: '?', keywords: 'help keys', run: () => act('shortcuts') },
  );

  state.tasks.filter(isOpen).slice(0, 200).forEach((t) => {
    const m = memberOf(state, t.assignee);
    out.push({
      group: 'Tasks',
      label: t.title,
      glyph: statusGlyph(t.status),
      hint: taskKey(t),
      keywords: `${taskKey(t)} ${STATUS[t.status].label} ${PRIORITY[t.priority].label} ${m?.name ?? ''} ${t.labels.join(' ')}`,
      exact: true,
      run: () => act('open', t.id),
    });
  });

  return out.map((c, i) => ({ ...c, order: i }));
}

/** The ? sheet. */
export function shortcutsDialog() {
  const rows = [
    ['⌘K', 'Search tasks and run commands'],
    ['C', 'New task'],
    ['/', 'Focus quick-add'],
    ['J K', 'Move down / up'],
    ['Enter', 'Open task'],
    ['E', 'Toggle done'],
    ['X', 'Select for bulk actions'],
    ['S P A D', 'Status · Priority · Assignee · Due'],
    ['1 – 4', 'Today · Tasks · Board · Settings'],
    ['⌘Z', 'Undo last change'],
    ['Esc', 'Close'],
  ];
  const d = h(`<dialog class="dlg">
    <div class="dlg__panel" style="width:min(440px,calc(100vw - 32px))">
      <h2 class="dlg__title">Keyboard</h2>
      <div style="display:flex;flex-direction:column;gap:2px;margin-top:12px">
        ${rows.map(([k, label]) => `
          <div style="display:flex;align-items:center;gap:12px;padding:5px 0">
            <span style="flex:1;font-size:var(--fs-ui)">${esc(label)}</span>
            <span style="display:flex;gap:3px">${k.split(' ').map((p) => `<span class="kbd">${esc(p)}</span>`).join('')}</span>
          </div>`).join('')}
      </div>
      <div class="dlg__foot"><button class="btn btn--primary" data-close>Close</button></div>
    </div>
  </dialog>`);
  document.body.appendChild(d);
  const dismiss = () => { try { d.close(); } catch { /* closed */ } d.remove(); };
  d.addEventListener('close', () => d.remove());
  d.addEventListener('cancel', (e) => { e.preventDefault(); dismiss(); });
  d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) dismiss(); });
  d.showModal();
}
