/* ============================================================
   Tasks — the working list.
   ============================================================
   No group-by picker, no sort picker, no filter popover. The
   list has one shape: In Progress, then Blocked, then Backlog,
   with Done collapsed at the bottom. Two controls only — the
   project chips and a Mine/All toggle — because those are the
   two questions two founders actually ask of a list.
   ============================================================ */

import { esc, icon, todayISO, plural } from '../util.js';
import { PROJECT, PROJECT_ORDER, STATUS, LIST_ORDER, PRIORITY } from '../types.js';
import { live, isOpen, isOverdue, sortTasks } from '../store.js';
import { section, quickAddRow, emptyState } from '../components/task-list.js';

export function filterTasks(state, ui) {
  return state.tasks.filter((t) => {
    if (!live(t)) return false;
    if (ui.project && (t.project ?? '__none__') !== ui.project) return false;
    if (ui.mine && t.assignee !== state.settings.me) return false;
    if (ui.query) {
      const hay = `${t.title} ${t.description}`.toLowerCase();
      if (!hay.includes(ui.query.toLowerCase())) return false;
    }
    return true;
  });
}

export function tasksToolbar(state, ui) {
  const counts = {};
  const liveTasks = state.tasks.filter((t) => live(t) && isOpen(t) && (!ui.mine || t.assignee === state.settings.me));
  PROJECT_ORDER.forEach((k) => { counts[k] = 0; });
  let unsorted = 0;
  liveTasks.forEach((t) => {
    if (t.project && counts[t.project] !== undefined) counts[t.project] += 1;
    if (!t.project) unsorted += 1;
  });

  const chip = (key, label, n) => `
    <button class="chip${ui.project === key ? ' on' : ''}" data-act="chip-project"
            data-project="${esc(key ?? '')}" aria-pressed="${ui.project === key}">
      ${esc(label)}${n ? ` <span class="chip__n">${n}</span>` : ''}
    </button>`;

  return `
    <div class="toolbar">
      ${chip(null, 'All', liveTasks.length)}
      ${PROJECT_ORDER.map((k) => chip(k, PROJECT[k].label, counts[k])).join('')}
      ${unsorted ? chip('__none__', 'Unsorted', unsorted) : ''}
      <span class="toolbar__spacer"></span>
      <div class="switch" role="group" aria-label="Owner">
        <button class="switch__opt" data-act="mine-set" data-value="0" aria-pressed="${!ui.mine}">All</button>
        <button class="switch__opt" data-act="mine-set" data-value="1" aria-pressed="${ui.mine}">Mine</button>
      </div>
    </div>`;
}

export function tasksView(state, ui) {
  const today = todayISO();
  const tasks = filterTasks(state, ui);
  const opts = { state, today, selection: ui.selection, cursorId: ui.cursorId };

  const open = tasks.filter((t) => t.status !== 'done');
  const done = tasks.filter((t) => t.status === 'done')
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));

  if (!tasks.length) {
    return quickAddRow() + emptyState({
      icon: ui.query ? 'search' : 'list',
      title: ui.query ? 'No task matches that search.'
        : ui.project || ui.mine ? 'Nothing here.' : 'The list is empty.',
      body: ui.query ? 'Try a shorter search, or create it from ⌘K.'
        : ui.project || ui.mine ? 'Clear a filter above, or add a task.'
        : 'Everything the two of you owe each other goes here. Type above, or press C.',
    });
  }

  // Sections in attention order. Overdue floats to the top of each.
  const bodySections = LIST_ORDER.map((key) => {
    const s = STATUS[key];
    const inSection = sortTasks(open.filter((t) => t.status === key), 'manual', today)
      .sort((a, b) => Number(isOverdue(b, today)) - Number(isOverdue(a, today)));
    if (!inSection.length && key !== 'backlog') return '';
    return section({
      key, label: s.label, glyph: s.glyph, tone: s.tone,
      tasks: inSection, ...opts, collapsed: null,
    });
  }).join('');

  const doneSection = done.length
    ? section({
        key: 'done', label: 'Done', glyph: STATUS.done.glyph, tone: STATUS.done.tone,
        tasks: done, ...opts, collapsed: !ui.showDone,
      })
    : '';

  return quickAddRow() + bodySections + doneSection;
}
