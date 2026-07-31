/* ============================================================
   Centralized types + the vocabularies every view reads from.
   ============================================================
   Checked via `npx -p typescript tsc --noEmit -p jsconfig.json`.

   Deliberately small: four statuses, four priorities, four
   projects, three views. Two founders do not need more, and
   every entry removed here removed a control somewhere else.
   ============================================================ */

/**
 * @typedef {'backlog'|'in_progress'|'blocked'|'done'} Status
 * @typedef {'urgent'|'high'|'medium'|'low'} Priority
 *
 * @typedef {{ id: string, title: string, done: boolean }} Subtask
 * @typedef {{ id: string, body: string, author: string|null, at: string }} Comment
 * @typedef {{ id: string, kind: string, at: string, from?: string, to?: string }} Activity
 *
 * @typedef {Object} Task
 * @property {string} id
 * @property {number} num
 * @property {string} title
 * @property {string} description
 * @property {Status} status
 * @property {Priority} priority
 * @property {string|null} assignee
 * @property {string|null} project
 * @property {string|null} due       YYYY-MM-DD
 * @property {string[]} labels       kept in data, no longer surfaced
 * @property {Subtask[]} subtasks
 * @property {Comment[]} comments
 * @property {Activity[]} activity
 * @property {string} blockedReason
 * @property {number} order
 * @property {boolean} archived
 * @property {boolean} seededSchedule
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {string|null} completedAt
 *
 * @typedef {Object} Member
 * @property {string} id
 * @property {string} name
 * @property {string} email
 * @property {string} role
 * @property {boolean} invited
 */

/* ------------------------------------------------------------
   Status. "To Do" is gone: for two founders the only states that
   change behaviour are not-started, started, stuck, finished.
   Every status carries a distinct glyph — state never rides on
   colour alone.
   ------------------------------------------------------------ */

/** @type {Record<Status, {label: string, glyph: string, tone: string, open: boolean}>} */
export const STATUS = {
  backlog:     { label: 'Backlog',     glyph: 'circle-dashed', tone: 'neutral', open: true },
  in_progress: { label: 'In Progress', glyph: 'circle-half',   tone: 'indigo',  open: true },
  blocked:     { label: 'Blocked',     glyph: 'circle-slash',  tone: 'red',     open: true },
  done:        { label: 'Done',        glyph: 'circle-check',  tone: 'green',   open: false },
};

/** Board columns, workflow order. */
export const BOARD_ORDER = /** @type {Status[]} */ (['backlog', 'in_progress', 'blocked', 'done']);

/** List sections, attention order: what is moving, what is stuck, what waits. */
export const LIST_ORDER = /** @type {Status[]} */ (['in_progress', 'blocked', 'backlog']);

export const STATUS_ORDER = BOARD_ORDER;

/* ------------------------------------------------------------
   Priority. Surfaced in the UI only when it demands attention
   (urgent/high); medium and low exist for sorting and the drawer.
   ------------------------------------------------------------ */

/** @type {Record<Priority, {label: string, rank: number, tone: string, bars: number, loud: boolean}>} */
export const PRIORITY = {
  urgent: { label: 'Urgent', rank: 0, tone: 'red',    bars: 3, loud: true },
  high:   { label: 'High',   rank: 1, tone: 'orange', bars: 3, loud: true },
  medium: { label: 'Medium', rank: 2, tone: 'amber',  bars: 2, loud: false },
  low:    { label: 'Low',    rank: 3, tone: 'slate',  bars: 1, loud: false },
};

export const PRIORITY_ORDER = /** @type {Priority[]} */ (
  Object.keys(PRIORITY).sort((a, b) => PRIORITY[a].rank - PRIORITY[b].rank)
);

/* ------------------------------------------------------------
   Projects — the buckets the founders actually think in.
   ------------------------------------------------------------ */

export const PROJECT = {
  product:    { label: 'Product' },
  fundraise:  { label: 'Fundraise' },
  commercial: { label: 'Commercial' },
  ops:        { label: 'Ops' },
};

export const PROJECT_ORDER = Object.keys(PROJECT);

/* ------------------------------------------------------------
   Views. Three, plus Settings.
   ------------------------------------------------------------ */

export const VIEWS = [
  { id: 'today',    label: 'Today',    icon: 'home' },
  { id: 'tasks',    label: 'Tasks',    icon: 'list' },
  { id: 'board',    label: 'Board',    icon: 'columns' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

export const isView = (id) => VIEWS.some((v) => v.id === id);
