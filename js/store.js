/* ============================================================
   Store — workspace state, mutations, selectors, persistence.
   ============================================================
   Never touches the DOM, never imports a view. Owns the data
   shape, emits change events, and defines every predicate once
   so "overdue" cannot mean two things in two places.

   Persistence goes through a swappable adapter (adapters/).
   See docs/BACKEND.md.
   ============================================================ */

import { uid, todayISO, daysBetween } from './util.js';
import { STATUS, STATUS_ORDER, PRIORITY, PROJECT } from './types.js';

const SCHEMA_VERSION = 3;

/* ------------------------------------------------------------
   Shape
   ------------------------------------------------------------ */

export function emptyWorkspace() {
  return {
    schema: SCHEMA_VERSION,
    name: 'Rabit',
    members: [],
    tasks: [],
    nextNum: 1,
    settings: {
      theme: 'light',
      sidebarCollapsed: false,
      slackWebhook: '',
      slackEvents: { created: true, completed: true, blocked: true },
      inviteDomain: 'rabit.co',
      me: null,               // which founder this browser is
    },
    meta: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  };
}

/** @returns {import('./types.js').Task} */
export function makeTask(patch = {}) {
  const now = new Date().toISOString();
  return {
    id: uid('t'),
    num: 0,
    title: '',
    description: '',
    status: 'backlog',
    priority: 'medium',
    assignee: null,
    project: null,
    due: null,
    labels: [],
    subtasks: [],
    comments: [],
    activity: [],
    blockedReason: '',
    order: Date.now(),
    archived: false,
    seededSchedule: false,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    ...patch,
  };
}

export function makeMember(patch = {}) {
  return {
    id: uid('m'),
    name: '',
    email: '',
    role: '',
    invited: false,
    createdAt: new Date().toISOString(),
    ...patch,
  };
}

/* ------------------------------------------------------------
   Store
   ------------------------------------------------------------ */

export class Store extends EventTarget {
  #state;
  #adapter;
  #saveTimer = null;
  #undo = null;

  constructor(adapter) {
    super();
    this.#adapter = adapter;
    this.#state = emptyWorkspace();
  }

  get state() { return this.#state; }
  get settings() { return this.#state.settings; }

  async load(fallbackSeed) {
    const stored = await this.#adapter.load();
    if (stored) this.#state = migrate(stored);
    else if (fallbackSeed) {
      this.#state = migrate(fallbackSeed());
      await this.#adapter.save(this.#state);
    }
    this.#emit('load');
    return this.#state;
  }

  /** Apply a mutation, stamp it, persist (debounced), notify. */
  commit(fn, detail = {}) {
    const result = fn(this.#state);
    this.#state.meta.updatedAt = new Date().toISOString();
    this.#schedule();
    this.#emit('change', detail);
    return result;
  }

  #schedule() {
    clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(() => {
      this.#adapter.save(this.#state).catch((err) => {
        this.#emit('error', { message: err?.message || 'Could not save.' });
      });
    }, 150);
  }

  async flush() {
    clearTimeout(this.#saveTimer);
    await this.#adapter.save(this.#state);
  }

  #emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  /* ---- undo ----------------------------------------------------
     One level, which is what an undo toast can honestly offer.
     Snapshot only the tasks that changed, not the workspace.
     -------------------------------------------------------------- */

  snapshot(ids, label) {
    const before = this.#state.tasks
      .filter((t) => ids.includes(t.id))
      .map((t) => structuredClone(t));
    this.#undo = { before, label };
    return this.#undo;
  }

  undo() {
    if (!this.#undo) return false;
    const { before } = this.#undo;
    this.commit((s) => {
      before.forEach((snap) => {
        const i = s.tasks.findIndex((t) => t.id === snap.id);
        if (i >= 0) s.tasks[i] = snap;
        else s.tasks.push(snap);
      });
    }, { kind: 'undo' });
    this.#undo = null;
    return true;
  }

  /* ---- tasks ---- */

  addTask(patch) {
    const task = makeTask({ num: this.#state.nextNum, ...patch });
    // A captured task surfaces at the top of its group — capture that
    // lands out of sight reads as capture that failed.
    const peers = this.#state.tasks.filter((t) => t.status === task.status && !t.archived);
    task.order = (peers.length ? Math.min(...peers.map((t) => t.order)) : 0) - 100;
    logActivity(task, 'created');
    this.commit((s) => {
      s.tasks.unshift(task);
      s.nextNum += 1;
    }, { kind: 'task:add', task });
    return task;
  }

  updateTask(id, patch) {
    let updated = null;
    this.commit((s) => {
      const task = s.tasks.find((t) => t.id === id);
      if (!task) return;

      const from = { status: task.status, priority: task.priority, assignee: task.assignee };

      if (('start' in patch && patch.start !== undefined) || ('due' in patch && patch.due !== task.due)) {
        task.seededSchedule = false;
      }

      Object.assign(task, patch, { updatedAt: new Date().toISOString() });

      if (patch.status && patch.status !== from.status) {
        task.completedAt = patch.status === 'done' ? new Date().toISOString() : null;
        if (patch.status !== 'blocked') task.blockedReason = '';
        logActivity(task, 'status', STATUS[from.status]?.label, STATUS[task.status]?.label);
      }
      if (patch.priority && patch.priority !== from.priority) {
        logActivity(task, 'priority', PRIORITY[from.priority]?.label, PRIORITY[task.priority]?.label);
      }
      if ('assignee' in patch && patch.assignee !== from.assignee) {
        logActivity(task, 'assignee', nameOf(s, from.assignee), nameOf(s, task.assignee));
      }
      updated = task;
    }, { kind: 'task:update', id, patch });
    return updated;
  }

  /** Bulk edit, one commit and one undo entry. */
  updateMany(ids, patch) {
    this.snapshot(ids, 'bulk');
    ids.forEach((id) => this.updateTask(id, patch));
    return ids.length;
  }

  removeTask(id) {
    let removed = null;
    this.commit((s) => {
      const i = s.tasks.findIndex((t) => t.id === id);
      if (i >= 0) removed = s.tasks.splice(i, 1)[0];
    }, { kind: 'task:remove', id });
    return removed;
  }

  restoreTask(task, index = 0) {
    this.commit((s) => s.tasks.splice(index, 0, task), { kind: 'task:restore' });
  }

  toggleDone(id) {
    const task = this.#state.tasks.find((t) => t.id === id);
    if (!task) return null;
    this.snapshot([id], 'toggle');
    return this.updateTask(id, { status: task.status === 'done' ? 'todo' : 'done' });
  }

  /**
   * Move a task to a position within a target group. `beforeId` is
   * the task it should land above, or null for the end. Order values
   * are recomputed for the affected group only.
   * @param {string} id
   * @param {{status?: string, beforeId?: string|null, groupKey?: ((t:any)=>string)|null}} [opts]
   */
  reorder(id, { status = undefined, beforeId = null, groupKey = null } = {}) {
    this.snapshot([id], 'move');
    this.commit((s) => {
      const task = s.tasks.find((t) => t.id === id);
      if (!task) return;

      if (status && status !== task.status) {
        const fromLabel = STATUS[task.status]?.label;
        task.status = status;
        task.completedAt = status === 'done' ? new Date().toISOString() : null;
        if (status !== 'blocked') task.blockedReason = '';
        logActivity(task, 'status', fromLabel, STATUS[status]?.label);
      }

      const peers = s.tasks
        .filter((t) => t.id !== id && !t.archived && (groupKey ? groupKey(t) === groupKey(task) : t.status === task.status))
        .sort((a, b) => a.order - b.order);

      const at = beforeId ? peers.findIndex((t) => t.id === beforeId) : peers.length;
      const idx = at < 0 ? peers.length : at;
      const prev = peers[idx - 1]?.order ?? (peers[0]?.order ?? 0) - 1000;
      const next = peers[idx]?.order ?? prev + 2000;
      task.order = (prev + next) / 2;
      task.updatedAt = new Date().toISOString();
    }, { kind: 'task:reorder', id });
  }

  /* ---- comments / subtasks ---- */

  addComment(id, body) {
    this.commit((s) => {
      const task = s.tasks.find((t) => t.id === id);
      if (!task) return;
      task.comments.push({ id: uid('c'), body, author: s.settings.me, at: new Date().toISOString() });
      task.updatedAt = new Date().toISOString();
    }, { kind: 'task:comment', id });
  }

  /* ---- members ---- */

  addMember(patch) {
    const member = makeMember(patch);
    this.commit((s) => {
      s.members.push(member);
      if (!s.settings.me) s.settings.me = member.id;
    }, { kind: 'member:add', member });
    return member;
  }

  updateMember(id, patch) {
    this.commit((s) => {
      const m = s.members.find((x) => x.id === id);
      if (m) Object.assign(m, patch);
    }, { kind: 'member:update', id });
  }

  removeMember(id) {
    this.commit((s) => {
      s.members = s.members.filter((m) => m.id !== id);
      s.tasks.forEach((t) => { if (t.assignee === id) t.assignee = null; });
      if (s.settings.me === id) s.settings.me = s.members[0]?.id ?? null;
    }, { kind: 'member:remove', id });
  }

  /* ---- settings ---- */

  setSetting(key, value) {
    this.commit((s) => { s.settings[key] = value; }, { kind: 'settings', key });
  }

  replaceAll(next) {
    this.#state = migrate(next);
    this.#schedule();
    this.#emit('load');
  }
}

function nameOf(state, id) {
  return state.members.find((m) => m.id === id)?.name ?? 'Unassigned';
}

function logActivity(task, kind, from, to) {
  task.activity = task.activity || [];
  task.activity.push({ id: uid('a'), kind, from, to, at: new Date().toISOString() });
  if (task.activity.length > 60) task.activity = task.activity.slice(-60);
}

/* ============================================================
   Migration — v1 (the Operations Brief shape) → v2.
   Every load passes through here, so an exported v1 workspace
   still opens, and the team's real data survives the redesign.
   ============================================================ */

/* v1 (Operations Brief) and v2 (five-status) both collapse into the
   four-status model. 'todo' folds into backlog everywhere. */
const V1_STATUS = { todo: 'backlog', doing: 'in_progress', blocked: 'blocked', done: 'done' };
const V1_PRIORITY = { normal: 'medium', high: 'high' };

export function migrate(raw) {
  const base = emptyWorkspace();
  const state = {
    ...base,
    ...raw,
    settings: { ...base.settings, ...(raw.settings || {}) },
    meta: { ...base.meta, ...(raw.meta || {}) },
    members: Array.isArray(raw.members) ? raw.members : [],
    tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
  };
  state.settings.slackEvents = { ...base.settings.slackEvents, ...(raw.settings?.slackEvents || {}) };
  state.members = state.members.map((m) => ({ ...makeMember(), ...m, id: m.id || uid('m') }));

  let num = Number(raw.nextNum) || 1;

  state.tasks = state.tasks.map((t, i) => {
    const task = { ...makeTask(), ...t, id: t.id || uid('t') };

    // v1 status/priority vocabularies.
    if (!STATUS[task.status]) task.status = V1_STATUS[t.status] ?? 'backlog';
    if (!PRIORITY[task.priority]) task.priority = V1_PRIORITY[t.priority] ?? 'medium';

    // v1 called it `owner` and `stream`, and kept notes not description.
    if (t.owner !== undefined && task.assignee == null) task.assignee = t.owner;
    if (t.stream !== undefined && task.project == null) task.project = PROJECT[t.stream] ? t.stream : null;
    if (t.notes && !task.description) task.description = t.notes;

    task.labels = Array.isArray(task.labels) ? task.labels : [];
    task.subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
    task.comments = Array.isArray(task.comments) ? task.comments : [];
    task.activity = Array.isArray(task.activity) ? task.activity : [];
    task.archived = !!task.archived;

    if (!task.num) { task.num = num; num += 1; }
    if (typeof task.order !== 'number') task.order = i * 100;

    // v1's `start` has no home in the new model; the Timeline derives it.
    delete task.start;
    delete task.sample;
    return task;
  });

  state.nextNum = Math.max(num, ...state.tasks.map((t) => t.num + 1), 1);
  if (!state.settings.me) state.settings.me = state.members[0]?.id ?? null;
  state.schema = SCHEMA_VERSION;
  return state;
}

/* ============================================================
   Selectors — the single definition of every predicate.
   ============================================================ */

export const live = (t) => !t.archived;
export const isOpen = (t) => t.status !== 'done' && !t.archived;
export const taskKey = (t) => `TASK-${String(t.num).padStart(3, '0')}`;

export function isOverdue(task, today = todayISO()) {
  return isOpen(task) && !!task.due && daysBetween(today, task.due) < 0;
}

export function isDueToday(task, today = todayISO()) {
  return isOpen(task) && task.due === today;
}

export function isUpcoming(task, today = todayISO()) {
  return isOpen(task) && !!task.due && daysBetween(today, task.due) > 0;
}

/** Untriaged: nobody owns it, or it belongs to no bucket. */
export function needsTriage(task) {
  return isOpen(task) && (!task.assignee || !task.project);
}

export function memberOf(state, id) {
  return state.members.find((m) => m.id === id) || null;
}

export function subProgress(task) {
  const total = task.subtasks?.length || 0;
  if (!total) return null;
  return { done: task.subtasks.filter((s) => s.done).length, total };
}

export function countsByStatus(state) {
  const out = {};
  STATUS_ORDER.forEach((k) => { out[k] = 0; });
  state.tasks.filter(live).forEach((t) => { if (out[t.status] !== undefined) out[t.status] += 1; });
  return out;
}

export function loadByMember(state, today = todayISO()) {
  const map = new Map();
  state.members.forEach((m) => map.set(m.id, { member: m, open: 0, late: 0, blocked: 0, doing: 0 }));
  map.set(null, { member: null, open: 0, late: 0, blocked: 0, doing: 0 });

  state.tasks.filter(isOpen).forEach((t) => {
    const e = map.get(t.assignee) ?? map.get(null);
    e.open += 1;
    if (isOverdue(t, today)) e.late += 1;
    if (t.status === 'blocked') e.blocked += 1;
    if (t.status === 'in_progress') e.doing += 1;
  });
  return map;
}

/** Every label in use, for the filter popover. */
export function allLabels(state) {
  return [...new Set(state.tasks.filter(live).flatMap((t) => t.labels))].sort();
}

export const byOrder = (a, b) => a.order - b.order;

export function sortTasks(tasks, sort, today = todayISO()) {
  const list = [...tasks];
  switch (sort) {
    case 'priority':
      return list.sort((a, b) => PRIORITY[a.priority].rank - PRIORITY[b.priority].rank || a.order - b.order);
    case 'due':
      return list.sort((a, b) => {
        if (a.due && b.due) return a.due.localeCompare(b.due);
        if (a.due) return -1;
        if (b.due) return 1;
        return a.order - b.order;
      });
    case 'updated':
      return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    case 'created':
      return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    case 'title':
      return list.sort((a, b) => a.title.localeCompare(b.title));
    default:
      return list.sort(byOrder);
  }
}
