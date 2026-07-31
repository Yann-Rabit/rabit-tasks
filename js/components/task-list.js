/* ============================================================
   TaskRow · section — the list, stripped to what a glance needs.
   ============================================================
   A row is: status glyph · title (+ blocked reason) · a priority
   mark only when it is loud · due date · owner. Nothing else.
   The ID, labels, comments, sub-task counts, and every other
   fact live one click away in the drawer — a list you read
   thirty times a day earns its calm by carrying less.
   ============================================================ */

import { esc, icon } from '../util.js';
import { STATUS, PRIORITY } from '../types.js';
import { taskKey, memberOf, isOverdue } from '../store.js';
import { avatar, statusGlyph, priorityBars, dueChip, emptyState } from './ui.js';

/**
 * @param {import('../types.js').Task} task
 */
export function taskRow(task, state, opts = {}) {
  const { today, selected = false, cursor = false } = opts;
  const member = memberOf(state, task.assignee);
  const s = STATUS[task.status] ?? STATUS.backlog;
  const p = PRIORITY[task.priority];
  const late = isOverdue(task, today);

  const spoken = [
    task.title,
    s.label,
    p.loud ? `${p.label} priority` : '',
    member ? member.name : 'unassigned',
    task.due ? (late ? `overdue ${task.due}` : `due ${task.due}`) : '',
    task.blockedReason ? `blocked on ${task.blockedReason}` : '',
  ].filter(Boolean).join(', ');

  return `
    <li class="row row--${esc(task.status)}${late ? ' row--late' : ''}"
        data-id="${esc(task.id)}" data-selected="${selected}" data-cursor="${cursor}">

      <button class="row__status" data-act="status" data-id="${esc(task.id)}"
              aria-label="Status: ${esc(s.label)}. Change status." aria-haspopup="menu" aria-expanded="false">
        ${statusGlyph(task.status)}
      </button>

      <span class="row__main">
        <button class="row__title" data-act="open" data-id="${esc(task.id)}"
                aria-label="${esc(spoken)}">${esc(task.title)}</button>
        ${task.status === 'blocked' && task.blockedReason
          ? `<span class="row__blocked" aria-hidden="true">${icon('alert', 'i--sm')}${esc(task.blockedReason)}</span>` : ''}
        ${opts.note ? `<span class="row__note" aria-hidden="true">${esc(opts.note)}</span>` : ''}
      </span>

      <span class="row__right" aria-hidden="true">
        ${p.loud ? priorityBars(task.priority) : ''}
        ${task.due
          ? `<button class="cell" data-act="due" data-id="${esc(task.id)}" tabindex="-1">${dueChip(task.due, today)}</button>`
          : ''}
        <button class="cell" data-act="assignee" data-id="${esc(task.id)}" tabindex="-1">${avatar(member)}</button>
      </span>
    </li>`;
}

/** A titled section of rows. Collapsible when `collapsed` is set. */
export function section({ key, label, glyph, tone, tasks, state, today, selection, cursorId, collapsed = null, note = '' }) {
  const rows = tasks.map((t) => taskRow(t, state, {
    today, selected: selection?.has(t.id), cursor: t.id === cursorId,
  })).join('');

  const head = `
    <header class="group__head">
      ${glyph ? `<span data-tone="${tone}">${icon(glyph, 'sglyph')}</span>` : ''}
      <h2 class="group__title">${esc(label)}</h2>
      <span class="group__count">${tasks.length}</span>
      ${note ? `<span class="group__note">${esc(note)}</span>` : ''}
      <span class="group__spacer"></span>
      ${collapsed === null ? `
        <button class="btn btn--ghost btn--icon btn--sm group__add" data-act="add-in" data-group="${esc(key)}"
                aria-label="Add a task in ${esc(label)}">${icon('plus', 'i--sm')}</button>` : ''}
    </header>`;

  if (collapsed !== null) {
    return `
      <section class="group" data-group="${esc(key)}">
        <button class="group__head group__head--toggle" data-act="toggle-section" data-group="${esc(key)}"
                aria-expanded="${!collapsed}">
          ${glyph ? `<span data-tone="${tone}">${icon(glyph, 'sglyph')}</span>` : ''}
          <h2 class="group__title">${esc(label)}</h2>
          <span class="group__count">${tasks.length}</span>
          <span class="group__spacer"></span>
          ${icon(collapsed ? 'chevronR' : 'chevron', 'i--sm')}
        </button>
        ${collapsed ? '' : `<ul class="group__body" data-zone="${esc(key)}" aria-label="${esc(label)}">${rows}</ul>`}
      </section>`;
  }

  return `
    <section class="group" data-group="${esc(key)}">
      ${head}
      <ul class="group__body" data-zone="${esc(key)}" aria-label="${esc(label)}">${rows}</ul>
    </section>`;
}

/** The quick-add row. */
export function quickAddRow() {
  return `
    <div class="quickadd">
      <span class="quickadd__icon">${icon('plus', 'i--sm')}</span>
      <input class="quickadd__input" id="quickadd" type="text" autocomplete="off"
             placeholder="Add a task and press Enter…" aria-label="Add a task">
      <span class="quickadd__hint"><span class="kbd">C</span></span>
    </div>`;
}

export { emptyState };
