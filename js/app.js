/* ============================================================
   App — shell, routing, interaction, keyboard.
   ============================================================
   Three views and a drawer. Views are pure string renderers;
   this file owns the DOM, the store, and every side effect.
   ============================================================ */

import { $, $$, esc, icon, todayISO, plural } from './util.js';
import { STATUS, BOARD_ORDER, PRIORITY, VIEWS, isView } from './types.js';
import { Store, isOpen, live, isOverdue, memberOf, taskKey } from './store.js';
import { LocalAdapter } from './adapters/local.js';
import {
  SupabaseAdapter, syncConfig, saveSyncConfig, clearSyncConfig,
  makeJoinLink, parseJoinHash, SETUP_SQL,
} from './adapters/supabase.js';
import { seedWorkspace } from './seed.js';
import { slack } from './slack.js';

import { shellBar, mobileNav } from './components/shell.js';
import { quickAddRow } from './components/task-list.js';
import { taskBoard } from './components/task-board.js';
import { openDrawer, closeDrawer, refreshDrawer } from './components/task-drawer.js';
import { openCommand, shortcutsDialog } from './components/command.js';
import { toast, confirmDialog } from './components/feedback.js';
import { makeDraggable } from './components/dnd.js';
import {
  statusPicker, priorityPicker, assigneePicker, duePicker, openMenu,
} from './components/menu.js';
import { skeletonList, emptyState } from './components/ui.js';

import { todayView } from './views/today.js';
import { tasksView, tasksToolbar, filterTasks } from './views/tasks.js';
import { settingsView, inviteMailto } from './views/settings.js';

/* A join link (#join=…) carries the shared-workspace credentials.
   Landing on one connects this browser, then cleans the URL. */
const joined = parseJoinHash(location.hash);
if (joined) {
  saveSyncConfig(joined);
  history.replaceState(null, '', location.pathname + '#/today');
}

const SYNC = syncConfig();
const adapter = SYNC ? new SupabaseAdapter(SYNC) : new LocalAdapter();
const store = new Store(adapter);

/** Ephemeral UI state. Persisted bits live in store.settings. */
const ui = {
  view: 'today',
  query: '',
  project: null,      // Tasks: project chip filter
  mine: false,        // Tasks: only my tasks
  showDone: false,    // Tasks: Done section expanded
  selection: new Set(),
  cursorId: null,
};

const root = $('#root');

/* ------------------------------------------------------------
   Boot
   ------------------------------------------------------------ */

(async function boot() {
  root.innerHTML = `<div class="app"><main class="main">
    <div class="bar"><span class="skel" style="width:120px;height:13px"></span></div>
    <div class="content">${skeletonList(8)}</div></main></div>`;

  if (SYNC) {
    // Remote empty → adopt whatever this browser already had, else seed.
    let localDoc = null;
    try { localDoc = await new LocalAdapter().load(); } catch { /* fresh browser */ }
    try {
      await store.load(() => localDoc ?? seedWorkspace());
    } catch (err) {
      toast(err.message || 'Could not reach the shared workspace.', { tone: 'err', timeout: 12000 });
      // Fall back to the local copy so the app still opens.
      store.replaceAll(localDoc ?? seedWorkspace());
    }
    adapter.onStatus = (s) => setSyncDot(s);
    // Belt and braces: mirror every change locally so an offline
    // refresh never loses work.
    store.addEventListener('change', () => {
      try { localStorage.setItem('rabit.dashboard.v1', JSON.stringify(store.state)); } catch {}
    });
  } else {
    await store.load(seedWorkspace);
  }
  applyTheme(store.settings.theme);
  route(location.hash);

  store.addEventListener('change', () => { render(); refreshDrawer(); });
  store.addEventListener('load', () => { applyTheme(store.settings.theme); render(); });
  store.addEventListener('error', (e) => toast(/** @type {CustomEvent} */ (e).detail.message, { tone: 'err', timeout: 9000 }));
  adapter.subscribe?.((next) => {
    store.replaceAll(next);
    toast(SYNC ? 'Board updated from the shared workspace.' : 'Updated from another tab.');
  });

  window.addEventListener('hashchange', () => {
    // A join link pasted into an already-open tab only changes the hash,
    // which never re-runs module top-level code — catch it here.
    const lateJoin = parseJoinHash(location.hash);
    if (lateJoin) {
      saveSyncConfig(lateJoin);
      history.replaceState(null, '', location.pathname + '#/today');
      location.reload();
      return;
    }
    route(location.hash); render();
  });
  window.addEventListener('beforeunload', () => store.flush());

  render();
})();

function route(hash) {
  const id = String(hash || '').replace(/^#\/?/, '').split('?')[0] || 'today';
  ui.view = isView(id) ? id : 'today';
  ui.selection.clear();
  ui.cursorId = null;
  closeDrawer();
}

function go(view) {
  if (location.hash === `#/${view}`) { route(location.hash); render(); }
  else location.hash = `#/${view}`;
}

/* ------------------------------------------------------------
   Render
   ------------------------------------------------------------ */

function render() {
  const state = store.state;
  const today = todayISO();

  let body = '';
  if (ui.view === 'today')    body = `<div class="pagewrap">${todayView(state, ui)}</div>`;
  if (ui.view === 'tasks')    body = tasksToolbar(state, ui) + `<div class="pagewrap">${tasksView(state, ui)}</div>`;
  if (ui.view === 'board')    body = renderBoard(state, today);
  if (ui.view === 'settings') body = settingsView(state);

  root.innerHTML = `
    <div class="app">
      <main class="main">
        ${shellBar(state, { view: ui.view, shared: !!SYNC })}
        <div class="content">
          <div class="content__scroll scroll" id="scroll">${body}</div>
        </div>
      </main>
      ${mobileNav(ui.view)}
      ${ui.selection.size ? bulkBar() : ''}
    </div>`;

  if (ui.view === 'board') wireBoardDnd();
  if (ui.view === 'tasks') wireListDnd();
  restoreCursor();

  const late = state.tasks.filter((t) => isOpen(t) && isOverdue(t, today)).length;
  document.title = `${late ? `(${late}) ` : ''}Rabit Tasks`;
}

function renderBoard(state, today) {
  const tasks = filterTasks(state, { ...ui, query: ui.query });
  if (!tasks.length) {
    return emptyState({
      icon: 'columns', title: 'Nothing on the board.',
      body: 'Press C to add the first task.',
      action: '<button class="btn btn--primary" data-act="new">New task</button>',
    });
  }
  return taskBoard(tasks.filter((t) => t.status !== 'done' || !collapseDone()), state, { today })
    .replace('<div class="board scroll"', collapseDone()
      ? '<div class="board scroll" data-hide-done="false"' : '<div class="board scroll"');
}

const collapseDone = () => false;   // the board always shows its Done column

function bulkBar() {
  const n = ui.selection.size;
  return `
    <div class="bulkbar" role="region" aria-label="Bulk actions">
      <span class="bulkbar__n">${plural(n, 'task')}</span>
      <button class="btn btn--sm" data-act="bulk-status" aria-haspopup="menu">Status</button>
      <button class="btn btn--sm" data-act="bulk-assignee" aria-haspopup="menu">Assignee</button>
      <button class="btn btn--sm btn--danger" data-act="bulk-delete">Delete</button>
      <button class="btn btn--ghost btn--icon btn--sm" data-act="bulk-clear" aria-label="Clear selection">
        ${icon('x', 'i--sm')}</button>
    </div>`;
}

/* ------------------------------------------------------------
   Theme
   ------------------------------------------------------------ */

function setSyncDot(state) {
  const el = $('.bar__sync', root);
  if (!el) return;
  el.dataset.state = state;
  el.title = state === 'live' ? 'Shared workspace — connected' : 'Shared workspace — offline, retrying';
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';
  const m = $('meta[name="theme-color"]');
  if (m) m.content = theme === 'dark' ? '#0F1113' : '#F7F8FA';
}

function toggleTheme() {
  const next = store.settings.theme === 'dark' ? 'light' : 'dark';
  store.setSetting('theme', next);
  applyTheme(next);
}

/* ------------------------------------------------------------
   Cursor + selection
   ------------------------------------------------------------ */

const rows = () => $$('.row', root);

function restoreCursor() {
  if (!ui.cursorId) return;
  const el = rows().find((r) => r.dataset.id === ui.cursorId);
  if (el) el.dataset.cursor = 'true';
  else ui.cursorId = null;
}

function moveCursor(delta) {
  const list = rows();
  if (!list.length) return;
  const at = list.findIndex((r) => r.dataset.id === ui.cursorId);
  const next = at < 0 ? (delta > 0 ? 0 : list.length - 1)
                      : (at + delta + list.length) % list.length;
  list.forEach((r) => { r.dataset.cursor = 'false'; });
  list[next].dataset.cursor = 'true';
  list[next].scrollIntoView({ block: 'nearest' });
  list[next].querySelector('.row__title')?.focus({ preventScroll: true });
  ui.cursorId = list[next].dataset.id;
}

/* ------------------------------------------------------------
   Task actions
   ------------------------------------------------------------ */

const taskOf = (id) => store.state.tasks.find((t) => t.id === id);

function statusChange(id, status) {
  const t = taskOf(id);
  if (!t || t.status === status) return;
  store.snapshot([id], 'status');
  store.updateTask(id, { status });
  notify(id, status === 'done' ? 'completed' : status === 'blocked' ? 'blocked' : null);
  toast(`${STATUS[status].label}`, {
    action: { label: 'Undo', key: '⌘Z', run: () => store.undo() },
  });
}

function createTask(patch = {}) {
  const t = store.addTask({
    assignee: store.settings.me,
    project: ui.view === 'tasks' && ui.project && ui.project !== '__none__' ? ui.project : null,
    ...patch,
  });
  notify(t.id, 'created');
  return t;
}

async function notify(id, event) {
  if (!event || !store.settings.slackWebhook) return;
  const t = taskOf(id);
  if (!t) return;
  try { await slack.notifyTask(store.state, t, event); }
  catch (err) { toast(err.message || 'Could not reach Slack.', { tone: 'err' }); }
}

function openTask(id) {
  const returnTo = document.activeElement;
  ui.cursorId = id;
  openDrawer(id, {
    store,
    onChange: () => {},
    returnFocus: () => {
      const el = rows().find((r) => r.dataset.id === id);
      (el?.querySelector('.row__title') ?? returnTo)?.focus?.({ preventScroll: true });
    },
  });
}

async function deleteTask(id) {
  const t = taskOf(id);
  const ok = await confirmDialog({
    title: 'Delete this task?',
    body: 'It is removed with its comments. You can undo once from the toast.',
    confirmLabel: 'Delete', danger: true,
  });
  if (!ok) return;
  const snap = structuredClone(t);
  store.removeTask(id);
  toast('Task deleted.', {
    action: { label: 'Undo', run: () => store.restoreTask(snap) }, timeout: 9000,
  });
}

/* ------------------------------------------------------------
   Drag and drop
   ------------------------------------------------------------ */

function dropHandler({ id, zone, beforeId }) {
  const t = taskOf(id);
  if (!t) return;
  const status = STATUS[zone] ? zone : undefined;
  const changed = status && t.status !== status;
  store.reorder(id, { status, beforeId });
  if (changed) {
    notify(id, status === 'done' ? 'completed' : status === 'blocked' ? 'blocked' : null);
    toast(`→ ${STATUS[status].label}`, {
      action: { label: 'Undo', key: '⌘Z', run: () => store.undo() },
    });
  }
}

function wireBoardDnd() {
  const board = $('.board', root);
  if (!board) return;
  makeDraggable({
    root: board, itemSelector: '.card', zoneSelector: '.col__body',
    idOf: (el) => el.dataset.id, zoneKey: (z) => z.dataset.zone, onDrop: dropHandler,
  });
}

function wireListDnd() {
  const scroll = $('#scroll', root);
  if (!scroll) return;
  makeDraggable({
    root: scroll, itemSelector: '.row', zoneSelector: '.group__body',
    idOf: (el) => el.dataset.id, zoneKey: (z) => z.dataset.zone, onDrop: dropHandler,
  });
}

/* ------------------------------------------------------------
   Delegated clicks
   ------------------------------------------------------------ */

root.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');

  // No explicit control hit: clicking a board card or a list row body
  // opens the task. The title button is the a11y path; the whole
  // surface is the pointer path.
  if (!el) {
    const target = /** @type {Element} */ (e.target);
    if (target.closest('button, a, input, select, textarea, dialog')) return;
    const card = target.closest('.card');
    if (card?.dataset.id) { openTask(card.dataset.id); return; }
    const row = target.closest('.row');
    if (row?.dataset.id) { openTask(row.dataset.id); return; }
    return;
  }
  const act = el.dataset.act;
  const id = el.dataset.id;

  /* chrome */
  if (act === 'command') { command(); return; }
  if (act === 'new') { const t = createTask(); openTask(t.id); return; }
  if (act === 'switch-me') {
    openMenu(el, {
      label: 'You are',
      items: store.state.members.map((m) => ({
        value: m.id, label: m.name, checked: m.id === store.settings.me,
      })),
    }, (v) => store.setSetting('me', v));
    return;
  }

  /* rows */
  if (act === 'open') { openTask(id); return; }
  if (act === 'status')   { statusPicker(el, taskOf(id).status, (v) => statusChange(id, v)); return; }
  if (act === 'due')      { duePicker(el, taskOf(id).due, (v) => store.updateTask(id, { due: v })); return; }
  if (act === 'assignee') { assigneePicker(el, store.state, taskOf(id).assignee, (v) => store.updateTask(id, { assignee: v })); return; }

  if (act === 'add-in') {
    const group = el.dataset.group;
    const t = createTask(STATUS[group] ? { status: group } : {});
    openTask(t.id);
    return;
  }

  /* today */
  if (act === 'proj-open') {
    go('tasks');
    ui.project = el.dataset.project || null;
    ui.mine = false;
    render();
    return;
  }

  /* tasks toolbar */
  if (act === 'chip-project') {
    const key = el.dataset.project || null;
    ui.project = ui.project === key ? null : key;
    render();
    return;
  }
  if (act === 'mine-set') { ui.mine = el.dataset.value === '1'; render(); return; }
  if (act === 'toggle-section') {
    if (el.dataset.group === 'done') { ui.showDone = !ui.showDone; render(); }
    return;
  }

  /* bulk */
  if (act === 'bulk-clear') { ui.selection.clear(); render(); return; }
  if (act === 'bulk-status') {
    statusPicker(el, null, (v) => {
      const n = store.updateMany([...ui.selection], { status: v });
      ui.selection.clear();
      toast(`${plural(n, 'task')} → ${STATUS[v].label}`, { action: { label: 'Undo', run: () => store.undo() } });
    });
    return;
  }
  if (act === 'bulk-assignee') {
    assigneePicker(el, store.state, null, (v) => {
      const n = store.updateMany([...ui.selection], { assignee: v });
      ui.selection.clear();
      toast(`${plural(n, 'task')} reassigned`, { action: { label: 'Undo', run: () => store.undo() } });
    });
    return;
  }
  if (act === 'bulk-delete') {
    const ids = [...ui.selection];
    const ok = await confirmDialog({
      title: `Delete ${plural(ids.length, 'task')}?`,
      body: 'They are removed from the workspace. You can undo once from the toast.',
      confirmLabel: 'Delete', danger: true,
    });
    if (!ok) return;
    const snaps = store.state.tasks.filter((t) => ids.includes(t.id)).map((t) => structuredClone(t));
    ids.forEach((x) => store.removeTask(x));
    ui.selection.clear();
    render();
    toast(`${plural(ids.length, 'task')} deleted.`, {
      action: { label: 'Undo', run: () => { snaps.forEach((s) => store.restoreTask(s)); } },
      timeout: 9000,
    });
    return;
  }

  /* settings */
  if (act === 'theme-set') { store.setSetting('theme', el.dataset.value); applyTheme(el.dataset.value); return; }
  if (act === 'slack-test') {
    try { await slack.test(store.settings.slackWebhook); toast('Test message sent. Check the channel.'); }
    catch (err) { toast(err.message, { tone: 'err' }); }
    return;
  }
  if (act === 'export') { exportWorkspace(); return; }
  if (act === 'import') { $('#ws-file')?.click(); return; }
  if (act === 'reset') {
    const ok = await confirmDialog({
      title: 'Reset this workspace?',
      body: 'Every task and member in this browser is deleted and the seeded workspace reloads. Export first to keep it.',
      confirmLabel: 'Reset', danger: true,
    });
    if (!ok) return;
    await adapter.clear();
    store.replaceAll(seedWorkspace());
    applyTheme(store.settings.theme);
    toast('Workspace reset.');
    return;
  }
  if (act === 'set-me') { store.setSetting('me', id); return; }

  /* shared workspace */
  if (act === 'sync-connect') {
    const url = $('#sy-url').value.trim().replace(/\/$/, '');
    const anonKey = $('#sy-key').value.trim();
    const workspaceId = $('#sy-id').value.trim();
    if (!/^https:\/\/.+supabase\.(co|in|net)/.test(url) && !/^https:\/\//.test(url)) {
      toast('That does not look like a project URL.', { tone: 'err' }); return;
    }
    if (!url || !anonKey || !workspaceId) {
      toast('All three fields are needed.', { tone: 'err' }); return;
    }
    saveSyncConfig({ url, anonKey, workspaceId });
    location.reload();
    return;
  }
  if (act === 'sync-disconnect') {
    const ok = await confirmDialog({
      title: 'Disconnect from the shared workspace?',
      body: 'This browser goes back to its own local copy. Nothing on the shared workspace is deleted.',
      confirmLabel: 'Disconnect',
    });
    if (!ok) return;
    clearSyncConfig();
    location.reload();
    return;
  }
  if (act === 'sync-copy-link') {
    const cfg = syncConfig();
    if (!cfg) return;
    const base = location.origin + location.pathname;
    navigator.clipboard?.writeText(makeJoinLink(cfg, base));
    toast('Join link copied. Send it to Firas — one click connects him.');
    return;
  }
  if (act === 'sync-copy-sql') {
    navigator.clipboard?.writeText(SETUP_SQL);
    toast('Setup SQL copied. Paste it into the Supabase SQL editor and run it.');
    return;
  }
  if (act === 'member-remove') {
    const m = memberOf(store.state, id);
    const ok = await confirmDialog({
      title: `Remove ${m.name}?`, body: 'Their tasks become unassigned.',
      confirmLabel: 'Remove', danger: true,
    });
    if (ok) { store.removeMember(id); toast(`${m.name} removed.`); }
    return;
  }
  if (act === 'member-add' || act === 'member-invite') {
    const name = $('#inv-name').value.trim();
    const email = $('#inv-email').value.trim();
    const err = $('#inv-err');
    if (!name) { toast('Give them a name.', { tone: 'err' }); $('#inv-name').focus(); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      err.textContent = 'That is not a valid email address.'; err.hidden = false; $('#inv-email').focus(); return;
    }
    if (store.state.members.some((m) => m.email.toLowerCase() === email.toLowerCase())) {
      err.textContent = 'Someone with that email is already here.'; err.hidden = false; return;
    }
    const m = store.addMember({ name, email, invited: act === 'member-invite' });
    if (act === 'member-invite') {
      location.href = inviteMailto(store.state, m, location.href.split('#')[0]);
      toast(`${name} added. Your mail client is opening.`);
    } else toast(`${name} added.`);
    return;
  }
});

/* ------------------------------------------------------------
   Inputs
   ------------------------------------------------------------ */

root.addEventListener('change', (e) => {
  const el = /** @type {HTMLInputElement} */ (e.target);
  if (el.dataset?.act === 'slack-event') {
    store.setSetting('slackEvents', { ...store.settings.slackEvents, [el.dataset.key]: el.checked });
    return;
  }
  if (el.id === 'slack-url') { store.setSetting('slackWebhook', el.value.trim()); return; }
  if (el.id === 'ws-file' && el.files?.[0]) { importWorkspace(el.files[0]); el.value = ''; }
});

root.addEventListener('keydown', (e) => {
  const t = /** @type {HTMLInputElement} */ (e.target);
  if (t.id !== 'quickadd') return;
  if (e.key === 'Escape') { t.value = ''; t.blur(); return; }
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const title = t.value.trim();
  if (!title) return;
  const made = createTask({
    title,
    status: 'backlog',
  });
  toast('Added.', { action: { label: 'Open', run: () => openTask(made.id) }, timeout: 4000 });
  const fresh = $('#quickadd');
  if (fresh) { fresh.value = ''; fresh.focus(); }
});

/* ------------------------------------------------------------
   Workspace file
   ------------------------------------------------------------ */

async function exportWorkspace() {
  await store.flush();
  const blob = new Blob([JSON.stringify(store.state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), {
    href: url, download: `rabit-tasks-${todayISO()}.json`,
  });
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast('Workspace exported.');
}

function importWorkspace(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try { parsed = JSON.parse(/** @type {string} */ (reader.result)); }
    catch { toast('That file is not a workspace export.', { tone: 'err' }); return; }
    if (!parsed || !Array.isArray(parsed.tasks)) {
      toast('That file has no tasks in it.', { tone: 'err' }); return;
    }
    const prev = structuredClone(store.state);
    store.replaceAll(parsed);
    applyTheme(store.settings.theme);
    toast(`Imported ${plural(parsed.tasks.length, 'task')}.`, {
      action: { label: 'Undo', run: () => { store.replaceAll(prev); applyTheme(store.settings.theme); } },
      timeout: 9000,
    });
  };
  reader.onerror = () => toast('Could not read that file.', { tone: 'err' });
  reader.readAsText(file);
}

/* ------------------------------------------------------------
   Command menu
   ------------------------------------------------------------ */

function command() {
  openCommand({
    state: store.state,
    go,
    create: (title) => { const t = createTask({ title }); openTask(t.id); },
    act: (kind, arg) => {
      if (kind === 'new') { const t = createTask(); openTask(t.id); }
      if (kind === 'open') openTask(arg);
      if (kind === 'theme') toggleTheme();
      if (kind === 'export') exportWorkspace();
      if (kind === 'shortcuts') shortcutsDialog();
    },
  });
}

/* ------------------------------------------------------------
   Keyboard
   ------------------------------------------------------------ */

const TYPING = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

document.addEventListener('keydown', (e) => {
  const el = e.target instanceof Element ? e.target : null;
  const typing = !!el && (TYPING.has(el.tagName) || /** @type {HTMLElement} */ (el).isContentEditable);
  const inOverlay = !!el?.closest('dialog, .menu');

  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && !inOverlay) {
    e.preventDefault(); command(); return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !typing) {
    e.preventDefault();
    if (store.undo()) toast('Undone.');
    return;
  }
  if (typing || inOverlay || e.metaKey || e.ctrlKey || e.altKey) return;

  const k = e.key;
  const cur = ui.cursorId;

  if (k === 'c' || k === 'C') { e.preventDefault(); const t = createTask(); openTask(t.id); return; }
  if (k === '/') { e.preventDefault(); ($('#quickadd') ?? { focus() { command(); } }).focus(); return; }
  if (k === 'j' || k === 'ArrowDown') { e.preventDefault(); moveCursor(1); return; }
  if (k === 'k' || k === 'ArrowUp') { e.preventDefault(); moveCursor(-1); return; }
  if (k === '?') { e.preventDefault(); shortcutsDialog(); return; }
  if (k === 'Escape' && ui.selection.size) { ui.selection.clear(); render(); return; }

  const n = Number(k);
  if (n >= 1 && n <= 4) { e.preventDefault(); go(VIEWS[n - 1].id); return; }
  if (!cur) return;

  const rowEl = rows().find((r) => r.dataset.id === cur);
  const anchor = rowEl?.querySelector('.row__status') ?? rowEl;

  if (k === 'Enter') { e.preventDefault(); openTask(cur); return; }
  if (k === 'x' || k === 'X') {
    e.preventDefault();
    ui.selection.has(cur) ? ui.selection.delete(cur) : ui.selection.add(cur);
    render();
    return;
  }
  if (k === 'e' || k === 'E') {
    e.preventDefault();
    statusChange(cur, taskOf(cur).status === 'done' ? 'backlog' : 'done');
    return;
  }
  if (k === 's' || k === 'S') { e.preventDefault(); statusPicker(anchor, taskOf(cur).status, (v) => statusChange(cur, v)); return; }
  if (k === 'p' || k === 'P') { e.preventDefault(); priorityPicker(anchor, taskOf(cur).priority, (v) => store.updateTask(cur, { priority: v })); return; }
  if (k === 'a' || k === 'A') { e.preventDefault(); assigneePicker(anchor, store.state, taskOf(cur).assignee, (v) => store.updateTask(cur, { assignee: v })); return; }
  if (k === 'd' || k === 'D') { e.preventDefault(); duePicker(anchor, taskOf(cur).due, (v) => store.updateTask(cur, { due: v })); return; }
});

/* Console/test surface. */
/** @type {any} */ (window).__rabit = { store, go, ui, render, createTask, openTask };
