/* ============================================================
   Today — the front page. Answers, in order:
   1. Where does everything sit? (the Projects bars)
   2. What should I do next? (my overdue → today → in progress → next)
   3. What is the other founder on?
   4. What still needs sorting?
   Nothing here is a report. Every row is the real task.
   ============================================================ */

import { esc, icon, todayISO, plural, startOfWeek, addDays, daysBetween, fmtDate } from '../util.js';
import { PROJECT, PROJECT_ORDER, PRIORITY } from '../types.js';
import { isOpen, isOverdue, isDueToday, needsTriage, live, memberOf, sortTasks } from '../store.js';
import { taskRow, section, emptyState } from '../components/task-list.js';

/* ------------------------------------------------------------
   Projects — one volume-scaled bar per bucket.
   Segments: Done · In progress · Open · Blocked, in that order —
   validated for colour-vision safety on both surfaces (worst
   adjacent pair ΔE 9.1 deutan / 17.2 normal). The muted Open
   segment is deliberate; no segment rides on colour alone
   (legend words, tooltips, and the counts in text).
   ------------------------------------------------------------ */

const SEGMENTS = [
  { key: 'done',    label: 'Done',        tone: 'green',   of: (t) => t.status === 'done' },
  { key: 'doing',   label: 'In progress', tone: 'indigo',  of: (t) => t.status === 'in_progress' },
  { key: 'open',    label: 'Open',        tone: 'neutral', of: (t) => t.status === 'backlog' },
  { key: 'blocked', label: 'Blocked',     tone: 'red',     of: (t) => t.status === 'blocked' },
];

function projectsPanel(state) {
  const tasks = state.tasks.filter(live);

  const rows = PROJECT_ORDER.map((key) => ({ key, label: PROJECT[key].label }));
  if (tasks.some((t) => !t.project)) rows.push({ key: '__none__', label: 'Unsorted' });

  const data = rows.map((r) => {
    const mine = tasks.filter((t) => (r.key === '__none__' ? !t.project : t.project === r.key));
    return {
      ...r,
      total: mine.length,
      done: mine.filter((t) => t.status === 'done').length,
      segs: SEGMENTS.map((s) => ({ ...s, n: mine.filter(s.of).length })),
    };
  }).filter((d) => d.total > 0);

  const max = Math.max(1, ...data.map((d) => d.total));

  return `
    <section class="panel panel--flat">
      <header class="panel__head">
        <h2 class="panel__title">Projects</h2>
        <span class="panel__count">${plural(tasks.length, 'task')}</span>
        <span style="flex:1"></span>
        <span class="pj__legend" aria-hidden="true">
          ${SEGMENTS.map((s) => `<span class="pj__key" data-tone="${s.tone}"><i class="pj__swatch"></i>${esc(s.label)}</span>`).join('')}
        </span>
      </header>
      <div class="pjs" role="img" aria-label="Task distribution across projects">
        ${data.map((d) => {
          const spoken = `${d.label}: ${plural(d.total, 'task')} — `
            + d.segs.filter((s) => s.n).map((s) => `${s.n} ${s.label.toLowerCase()}`).join(', ');
          return `
            <button class="pj" data-act="proj-open" data-project="${esc(d.key)}"
                    aria-label="${esc(spoken)}. Open in Tasks.">
              <span class="pj__name">${esc(d.label)}</span>
              <span class="pj__bar" style="width:${((d.total / max) * 100).toFixed(1)}%">
                ${d.segs.filter((s) => s.n > 0).map((s) => `
                  <i data-tone="${s.tone}" style="flex-grow:${s.n}"
                     title="${esc(d.label)} — ${s.n} ${esc(s.label.toLowerCase())}"></i>`).join('')}
              </span>
              <span class="pj__n"><b>${d.total}</b>${d.done ? ` · ${d.done} done` : ''}</span>
            </button>`;
        }).join('')}
      </div>
    </section>`;
}

/* ------------------------------------------------------------
   Timeline — who is doing what, in which bucket, and when.
   ------------------------------------------------------------
   Faceted, not colour-coded: one thin lane per person × project,
   so the category is carried by the row label (text) and the
   project tint only reinforces it. This is the dataviz escape
   hatch for a four-hue all-pairs palette that cannot pass on
   both surfaces — facet instead of paint.

   Columns: Overdue · six Monday-based weeks · Later. Open tasks
   with a due date land in their week; each chip is the real
   task — hover for detail, click to open. Undated work is
   counted in the lane label rather than invented into a week.
   ------------------------------------------------------------ */

const WEEKS = 6;

function timelineSection(state, today) {
  const weekStart = startOfWeek(today);
  const open = state.tasks.filter(isOpen);

  // Column index for a task: 0 = overdue, 1..WEEKS = weeks, WEEKS+1 = later.
  const colOf = (t) => {
    if (!t.due) return -1;
    if (t.due < today) return 0;
    const w = Math.floor(daysBetween(weekStart, t.due) / 7);
    return w < WEEKS ? w + 1 : WEEKS + 1;
  };

  const people = [
    ...state.members.map((m) => ({ id: m.id, name: m.name.split(' ')[0] })),
    ...(open.some((t) => !t.assignee) ? [{ id: null, name: 'Unassigned' }] : []),
  ];

  const projKeys = [...PROJECT_ORDER, '__none__'];
  const projLabel = (k) => (k === '__none__' ? 'Unsorted' : PROJECT[k].label);

  const lanes = [];
  people.forEach((p) => {
    const mine = open.filter((t) => t.assignee === p.id);
    const dated = mine.filter((t) => t.due);
    const undated = mine.length - dated.length;
    const projLanes = projKeys
      .map((k) => ({
        key: k,
        tasks: dated.filter((t) => (t.project ?? '__none__') === k),
      }))
      .filter((l) => l.tasks.length);
    if (mine.length) lanes.push({ person: p, undated, projLanes, dated: dated.length });
  });

  if (!lanes.length) return '';

  const ticks = ['Overdue',
    ...Array.from({ length: WEEKS }, (_, i) => (i === 0 ? 'This week' : fmtDate(addDays(weekStart, i * 7)))),
    'Later'];

  const header = `
    <div class="tlx__row tlx__row--head">
      <div class="tlx__label"></div>
      ${ticks.map((t, i) => `
        <div class="tlx__tick${i === 0 ? ' tlx__tick--over' : ''}${i === 1 ? ' tlx__tick--now' : ''}">${esc(t)}</div>`).join('')}
    </div>`;

  const body = lanes.map(({ person, undated, projLanes }) => `
    <div class="tlx__person">
      <span class="tlx__name">${esc(person.name)}</span>
      ${undated ? `<span class="tlx__undated">+${undated} without a date</span>` : ''}
    </div>
    ${projLanes.map((lane) => `
      <div class="tlx__row">
        <div class="tlx__label" data-proj="${esc(lane.key)}">
          <i class="tlx__dot"></i>${esc(projLabel(lane.key))}
        </div>
        ${ticks.map((_, col) => {
          const cell = lane.tasks.filter((t) => colOf(t) === col);
          return `<div class="tlx__cell${col === 0 ? ' tlx__cell--over' : ''}${col === 1 ? ' tlx__cell--now' : ''}">
            ${cell.map((t) => `
              <button class="tlx__chip" data-proj="${esc(lane.key)}" data-act="open" data-id="${esc(t.id)}"
                      title="${esc(t.title)} — ${esc(projLabel(lane.key))}${t.due ? `, due ${esc(fmtDate(t.due))}` : ''}"
                      aria-label="${esc(t.title)}, ${esc(projLabel(lane.key))}, ${col === 0 ? 'overdue' : `due ${esc(fmtDate(t.due))}`}. Open.">
                ${esc(t.title)}
              </button>`).join('')}
          </div>`;
        }).join('')}
      </div>`).join('')}
  `).join('');

  return `
    <section class="panel--flat">
      <header class="panel__head">
        <h2 class="panel__title">Timeline</h2>
        <span class="panel__count">dated work, next ${WEEKS} weeks</span>
      </header>
      <div class="tlx scroll" role="region" aria-label="Who is doing what, by project and week">
        ${header}
        ${body}
      </div>
    </section>`;
}

/* ------------------------------------------------------------
   The view
   ------------------------------------------------------------ */

export function todayView(state, ui) {
  const today = todayISO();
  const me = state.settings.me;
  const open = state.tasks.filter(isOpen);
  const opts = { state, today, selection: ui.selection, cursorId: ui.cursorId };

  if (!state.tasks.filter(live).length) {
    return emptyState({
      icon: 'sparkle', title: 'Nothing here yet.',
      body: 'Add the first task and this page starts answering what to work on next.',
      action: '<button class="btn btn--primary" data-act="new">New task</button>',
    });
  }

  const mine = open.filter((t) => t.assignee === me);

  // "Up next": overdue first, then due today, then in progress, then the
  // highest-priority rest — capped, because a front page is not a backlog.
  const urgent = mine.filter((t) => isOverdue(t, today));
  const dueNow = mine.filter((t) => isDueToday(t, today) && !urgent.includes(t));
  const doing = mine.filter((t) => t.status === 'in_progress' && !urgent.includes(t) && !dueNow.includes(t));
  const rest = sortTasks(
    mine.filter((t) => !urgent.includes(t) && !dueNow.includes(t) && !doing.includes(t)),
    'priority', today,
  );
  const next = [...sortTasks(urgent, 'due', today), ...dueNow, ...doing, ...rest].slice(0, 7);

  const partner = state.members.find((m) => m.id !== me);
  const theirs = partner
    ? sortTasks(open.filter((t) => t.assignee === partner.id && t.status !== 'backlog'), 'priority', today)
      .slice(0, 4)
    : [];

  const triage = open.filter(needsTriage);

  return `
    ${projectsPanel(state)}
    ${timelineSection(state, today)}

    ${section({
      key: 'next', label: 'Up next', tasks: next,
      note: urgent.length ? `${plural(urgent.length, 'task is', 'tasks are')} overdue` : '',
      ...opts, collapsed: null,
    })}
    ${next.length === 0 ? `<p class="calm">Nothing is assigned to you. Pick something from <a href="#/tasks">Tasks</a>.</p>` : ''}

    ${partner && theirs.length ? section({
      key: 'partner', label: `${partner.name.split(' ')[0]} is on`, tasks: theirs, ...opts, collapsed: null,
    }) : ''}

    ${triage.length ? section({
      key: 'triage', label: 'Needs sorting', tasks: triage,
      note: 'no owner or no project',
      ...opts, collapsed: null,
    }) : ''}
  `;
}
