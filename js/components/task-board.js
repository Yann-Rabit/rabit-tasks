/* ============================================================
   TaskBoard · BoardColumn · TaskCard
   ============================================================
   Cards carry only what a glance needs: title, priority, due when
   it matters, assignee, blocked state, and sub-task progress only
   when sub-tasks exist. Everything else lives one click away in
   the drawer. An oversized card is an unscannable board.
   ============================================================ */

import { esc, icon, plural } from '../util.js';
import { STATUS, STATUS_ORDER, PRIORITY } from '../types.js';
import { taskKey, memberOf, isOverdue, subProgress, sortTasks } from '../store.js';
import { avatar, priorityBars, dueChip } from './ui.js';

/** Soft WIP guidance — a nudge for two founders, never a blocker. */
const WIP = { in_progress: 4 };

export function taskCard(task, state, opts = {}) {
  const { today } = opts;
  const member = memberOf(state, task.assignee);
  const late = isOverdue(task, today);
  const sub = subProgress(task);
  const showDue = task.due && (late || task.status !== 'backlog');

  const spoken = [
    taskKey(task), task.title,
    STATUS[task.status].label,
    `${PRIORITY[task.priority].label} priority`,
    member ? member.name : 'unassigned',
    task.due ? (late ? 'overdue' : `due ${task.due}`) : '',
  ].filter(Boolean).join(', ');

  return `
    <article class="card" data-id="${esc(task.id)}" tabindex="-1">
      <div class="card__top">
        <span class="card__title">${esc(task.title)}</span>
      </div>

      ${task.status === 'blocked' && task.blockedReason
        ? `<div class="card__blocked" style="margin-bottom:6px">${icon('alert', 'i--sm')}${esc(task.blockedReason)}</div>` : ''}

            <div class="card__foot">
        ${PRIORITY[task.priority].loud ? priorityBars(task.priority) : ''}
        ${showDue ? dueChip(task.due, today) : ''}
        ${sub ? `<span class="row__sub">${icon('check', 'i--sm')}${sub.done}/${sub.total}</span>` : ''}
        ${avatar(member)}
      </div>

      <button class="sr-only" data-act="open" data-id="${esc(task.id)}">Open ${esc(spoken)}</button>
    </article>`;
}

export function boardColumn(status, tasks, state, opts = {}) {
  const s = STATUS[status];
  const wip = WIP[status];
  const over = wip && tasks.length > wip;

  return `
    <section class="col" data-col="${esc(status)}" aria-labelledby="col-${esc(status)}">
      <header class="col__head">
        <span data-tone="${s.tone}">${icon(s.glyph, 'sglyph')}</span>
        <h2 class="col__name" id="col-${esc(status)}">${esc(s.label)}</h2>
        <span class="col__count">${tasks.length}</span>
        ${over ? `<span class="col__wip" title="More than ${wip} in progress at once">WIP ${tasks.length}/${wip}</span>` : ''}
        <span class="col__spacer"></span>
        <button class="btn btn--ghost btn--icon btn--sm col__add" data-act="add-in" data-group="${esc(status)}"
                aria-label="Add a task to ${esc(s.label)}">${icon('plus', 'i--sm')}</button>
      </header>
      <div class="col__body scroll" data-zone="${esc(status)}" role="list"
           aria-label="${esc(s.label)}, ${plural(tasks.length, 'task')}">
        ${tasks.map((t) => taskCard(t, state, opts)).join('')}
        ${tasks.length === 0
          ? `<p style="padding:10px 4px;font-size:var(--fs-meta);color:var(--text-3)">Drop a task here, or press <span class="kbd">C</span>.</p>`
          : ''}
      </div>
    </section>`;
}

export function taskBoard(tasks, state, opts = {}) {
  const { sort = 'manual', today } = opts;
  const by = new Map(STATUS_ORDER.map((k) => [k, []]));
  tasks.forEach((t) => by.get(t.status)?.push(t));

  return `<div class="board scroll" role="region" aria-label="Task board">
    ${STATUS_ORDER.map((k) => boardColumn(k, sortTasks(by.get(k), sort, today), state, opts)).join('')}
  </div>`;
}
