/* ============================================================
   TaskDrawer — the task detail experience.
   ============================================================
   A right-side drawer, never a centre modal. Everything
   autosaves; there is no Save button.

   Listener discipline (the source of a real shipped bug): every
   listener is attached exactly ONCE, when the dialog element is
   created. render() only writes innerHTML. Re-attaching in
   render() multiplies handlers on every re-render — after five
   keystrokes a single click on Archive fired six times, which
   with an even count reads as "the button does nothing".
   ============================================================ */

import { $, $$, esc, icon, uid, ago, fmtDateLong, debounce } from '../util.js';
import { STATUS, PRIORITY, PROJECT } from '../types.js';
import { taskKey, memberOf, subProgress } from '../store.js';
import { avatar, statusGlyph, priorityBars } from './ui.js';
import { statusPicker, priorityPicker, assigneePicker, projectPicker, duePicker, closeMenu } from './menu.js';
import { confirmDialog, toast } from './feedback.js';

let dlg = null;
let currentId = null;
let ctx = null;          // { store, onChange, returnFocus }
let finalized = true;    // teardown ran for the current open-cycle

export const openTaskId = () => currentId;

/**
 * Close is SYNCHRONOUS and unconditional: teardown runs, then the
 * dialog closes. No exit animation, no timers, no events, no flags —
 * a close that can wait on nothing is a close that cannot wedge.
 * (The exit animation was cut deliberately: closing happens dozens
 * of times a day, and reliability beats 150ms of choreography.)
 */
export function closeDrawer() {
  if (!dlg) return;
  closeMenu();
  finalize();
  if (dlg.open) { try { dlg.close(); } catch { /* already closed */ } }
}

// Last-resort path, wired inline onto the X button in the markup —
// works even if every delegated listener has somehow died.
globalThis.__rabitCloseDrawer = () => closeDrawer();

export function openDrawer(taskId, options = {}) {
  ensure();
  // Opening while another task's cycle is still live (double-click on
  // New task, click a row while a drawer is open): settle the previous
  // cycle first, so its empty task is discarded, not orphaned.
  if (!finalized) finalize();

  ctx = options;
  currentId = taskId;
  finalized = false;
  render();
  if (!dlg.open) dlg.showModal();
  $('.dr__title', dlg)?.focus({ preventScroll: true });
}

/**
 * Re-render after an outside change (store event, remote sync).
 * Skipped while the user is typing inside the drawer — replacing
 * the DOM mid-word would eat the caret; the next outside change
 * after typing stops will repaint.
 */
export function refreshDrawer() {
  if (!dlg?.open || !currentId) return;
  const active = document.activeElement;
  if (active && dlg.contains(active) &&
      (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
  render();
}

/**
 * Teardown for one open-cycle: flush pending text, discard the task
 * if it is still completely empty, release ctx. Idempotent — called
 * from done() and from the dialog 'close' event, whichever runs.
 */
function finalize() {
  if (finalized) return;
  finalized = true;

  const store = ctx?.store;
  const id = currentId;

  if (store && id) {
    const t = store.state.tasks.find((x) => x.id === id);
    if (t) {
      // Flush what is sitting in the fields right now — the debounced
      // savers wait 350ms, and a fast close must never eat a title.
      const domTitle = $('.dr__title', dlg)?.value.trim();
      const domDesc = $('[data-d="description"]', dlg)?.value.trim();
      const patch = {};
      if (domTitle !== undefined && domTitle !== t.title) patch.title = domTitle;
      if (domDesc !== undefined && domDesc !== t.description) patch.description = domDesc;
      if (Object.keys(patch).length) store.updateTask(id, patch);

      // A task that is still completely empty when the drawer closes
      // was never really created — discard it, no ghost rows.
      const fresh = store.state.tasks.find((x) => x.id === id);
      const empty = fresh
        && !fresh.title.trim()
        && !fresh.description.trim()
        && !(fresh.subtasks || []).some((s) => s.title.trim())
        && !(fresh.comments || []).length;
      if (empty) {
        store.removeTask(id);
        toast('Empty task discarded.');
      }
      ctx?.onChange?.();
    }
  }

  currentId = null;
  ctx?.returnFocus?.();
  ctx = null;
}

/* ------------------------------------------------------------ */

function task() {
  return ctx?.store.state.tasks.find((t) => t.id === currentId) ?? null;
}

/** Save + repaint (structural edits: status, sub-task add, …). */
function patch(p) {
  if (!ctx || !currentId) return;
  ctx.store.updateTask(currentId, p);
  ctx.onChange?.();
  render();
}

/** Save without repainting — for text fields, so the caret stays put. */
function patchQuiet(p) {
  if (!ctx || !currentId) return;
  ctx.store.updateTask(currentId, p);
  ctx.onChange?.();
}

const saveTitle = debounce((v) => patchQuiet({ title: v }), 350);
const saveDesc = debounce((v) => patchQuiet({ description: v }), 350);
const saveBlocked = debounce((v) => patchQuiet({ blockedReason: v }), 350);
const saveSub = debounce((id, v) => {
  const t = task();
  if (t) patchQuiet({ subtasks: t.subtasks.map((s) => (s.id === id ? { ...s, title: v } : s)) });
}, 350);

/* ------------------------------------------------------------
   One-time creation: element + every listener.
   ------------------------------------------------------------ */

function ensure() {
  if (dlg) return;
  dlg = document.createElement('dialog');
  dlg.className = 'drawer';
  dlg.setAttribute('aria-label', 'Task details');
  document.body.appendChild(dlg);

  dlg.addEventListener('close', finalize);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) closeDrawer(); });
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); closeDrawer(); });

  dlg.addEventListener('input', (e) => {
    const el = /** @type {HTMLElement} */ (e.target);
    const d = el.dataset.d;
    if (d === 'title') { autosize(el); saveTitle(el.value.trim()); }
    if (d === 'description') saveDesc(el.value);
    if (d === 'blocked') saveBlocked(el.value);
    if (d === 'sub-text') saveSub(el.closest('[data-sub]').dataset.sub, el.value);
  });

  dlg.addEventListener('change', (e) => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    if (el.dataset.d !== 'sub-toggle') return;
    const id = el.closest('[data-sub]').dataset.sub;
    const t = task();
    if (t) patch({ subtasks: t.subtasks.map((s) => (s.id === id ? { ...s, done: el.checked } : s)) });
  });

  dlg.addEventListener('keydown', (e) => {
    const d = /** @type {HTMLElement} */ (e.target).dataset?.d;
    if (e.key !== 'Enter') return;
    if (d === 'title') { e.preventDefault(); /** @type {HTMLElement} */ (e.target).blur(); }
    if (d === 'comment') { e.preventDefault(); $('[data-d="comment-send"]', dlg)?.click(); }
    if (d === 'sub-text') { e.preventDefault(); $('[data-d="sub-add"]', dlg)?.click(); }
  });

  dlg.addEventListener('click', onAction);
}

async function onAction(e) {
  const btn = e.target.closest('[data-d]');
  if (!btn) return;
  const d = btn.dataset.d;

  // Close before ANY guard — it must work even if ctx is somehow gone.
  if (d === 'close') { closeDrawer(); return; }

  if (!ctx) return;
  const cur = task();
  if (!cur) return;

  if (d === 'copy') {
    try {
      await navigator.clipboard.writeText(taskKey(cur));
      toast(`${taskKey(cur)} copied.`);
    } catch {
      toast('Could not reach the clipboard.', { tone: 'err' });
    }
    return;
  }

  if (d === 'pick-status')   { statusPicker(btn, cur.status, (v) => patch({ status: v })); return; }
  if (d === 'pick-priority') { priorityPicker(btn, cur.priority, (v) => patch({ priority: v })); return; }
  if (d === 'pick-assignee') { assigneePicker(btn, ctx.store.state, cur.assignee, (v) => patch({ assignee: v })); return; }
  if (d === 'pick-project')  { projectPicker(btn, cur.project, (v) => patch({ project: v })); return; }
  if (d === 'pick-due')      { duePicker(btn, cur.due, (v) => patch({ due: v })); return; }

  if (d === 'sub-add') {
    patch({ subtasks: [...(cur.subtasks || []), { id: uid('s'), title: '', done: false }] });
    const inputs = $$('.sub__text', dlg);
    inputs[inputs.length - 1]?.focus();
    return;
  }
  if (d === 'sub-del') {
    const id = btn.closest('[data-sub]').dataset.sub;
    patch({ subtasks: cur.subtasks.filter((s) => s.id !== id) });
    return;
  }

  if (d === 'comment-send') {
    const input = $('[data-d="comment"]', dlg);
    const body = input.value.trim();
    if (!body) return;
    ctx.store.addComment(currentId, body);
    ctx.onChange?.();
    render();
    return;
  }

  if (d === 'archive') {
    // Capture the store: ctx dies when the drawer closes, and the
    // toast's Undo outlives it.
    const store = ctx.store;
    const id = currentId;
    const wasArchived = cur.archived;
    patch({ archived: !wasArchived });
    if (!wasArchived) closeDrawer();
    toast(wasArchived ? 'Task restored.' : 'Task archived.', {
      action: { label: 'Undo', run: () => store.updateTask(id, { archived: wasArchived }) },
    });
    return;
  }

  if (d === 'delete') {
    const ok = await confirmDialog({
      title: `Delete ${taskKey(cur)}?`,
      body: 'This removes the task and its comments. You can undo once from the toast.',
      confirmLabel: 'Delete', danger: true,
    });
    if (!ok) return;
    const store = ctx.store;
    const snapshot = structuredClone(cur);
    store.removeTask(currentId);
    closeDrawer();
    toast('Task deleted.', {
      action: { label: 'Undo', run: () => store.restoreTask(snapshot) },
      timeout: 8000,
    });
  }
}

/* ------------------------------------------------------------
   Render — writes markup only. No listeners in here, ever.
   ------------------------------------------------------------ */

function render() {
  const t = task();
  const state = ctx.store.state;
  if (!t) { closeDrawer(); return; }

  const s = STATUS[t.status];
  const member = memberOf(state, t.assignee);
  const sub = subProgress(t);

  dlg.innerHTML = `
    <header class="dr__head">
      <span class="dr__key">${esc(taskKey(t))}</span>
      <span class="dr__spacer"></span>
      <button class="btn btn--ghost btn--icon" data-d="copy" aria-label="Copy task ID">${icon('tag')}</button>
      <button class="btn btn--ghost btn--icon" data-d="archive" aria-label="${t.archived ? 'Unarchive' : 'Archive'} task">${icon('archive')}</button>
      <button class="btn btn--ghost btn--icon" data-d="delete" aria-label="Delete task">${icon('trash')}</button>
      <button class="btn btn--ghost btn--icon" data-d="close" aria-label="Close (Escape)"
              onclick="globalThis.__rabitCloseDrawer && globalThis.__rabitCloseDrawer()">${icon('x')}</button>
    </header>

    <div class="dr__body scroll">
      <textarea class="dr__title" rows="1" data-d="title" aria-label="Task title"
                placeholder="Task title">${esc(t.title)}</textarea>

      <div class="props">
        <span class="props__label" id="p-status">Status</span>
        <span class="props__val">
          <button class="cell" data-d="pick-status" aria-labelledby="p-status" aria-haspopup="menu" aria-expanded="false">
            ${statusGlyph(t.status)}<span>${esc(s.label)}</span>
          </button>
        </span>

        <span class="props__label" id="p-assignee">Assignee</span>
        <span class="props__val">
          <button class="cell" data-d="pick-assignee" aria-labelledby="p-assignee" aria-haspopup="menu" aria-expanded="false">
            ${avatar(member)}<span>${esc(member?.name ?? 'Unassigned')}</span>
          </button>
        </span>

        <span class="props__label" id="p-priority">Priority</span>
        <span class="props__val">
          <button class="cell" data-d="pick-priority" aria-labelledby="p-priority" aria-haspopup="menu" aria-expanded="false">
            ${priorityBars(t.priority)}<span>${esc(PRIORITY[t.priority].label)}</span>
          </button>
        </span>

        <span class="props__label" id="p-due">Due</span>
        <span class="props__val">
          <button class="cell" data-d="pick-due" aria-labelledby="p-due" aria-haspopup="menu" aria-expanded="false">
            ${icon('calendar', 'i--sm')}<span>${t.due ? esc(fmtDateLong(t.due)) : 'No due date'}</span>
          </button>
        </span>

        <span class="props__label" id="p-project">Project</span>
        <span class="props__val">
          <button class="cell" data-d="pick-project" aria-labelledby="p-project" aria-haspopup="menu" aria-expanded="false">
            ${icon('folder', 'i--sm')}<span>${esc(PROJECT[t.project]?.label ?? 'No project')}</span>
          </button>
        </span>
      </div>

      ${t.status === 'blocked' ? `
        <div class="field">
          <label class="field__label" for="dr-blocked">What is it waiting on</label>
          <input class="input" id="dr-blocked" data-d="blocked" value="${esc(t.blockedReason)}"
                 placeholder="e.g. Firas to confirm the cap table">
        </div>` : ''}

      <div class="dr__section">
        <div class="dr__sectionHead"><h3 class="dr__sectionTitle">Description</h3></div>
        <textarea class="textarea" data-d="description" placeholder="Add detail, links, decisions…"
                  aria-label="Description">${esc(t.description)}</textarea>
      </div>

      <div class="dr__section">
        <div class="dr__sectionHead">
          <h3 class="dr__sectionTitle">Sub-tasks</h3>
          ${sub ? `<span class="dr__sectionCount">${sub.done}/${sub.total}</span>` : ''}
        </div>
        ${sub ? `<div class="subbar" role="progressbar" aria-valuenow="${sub.done}" aria-valuemin="0"
                   aria-valuemax="${sub.total}" aria-label="Sub-task progress"><i style="transform:scaleX(${
                   (sub.done / sub.total).toFixed(3)})"></i></div>` : ''}
        <div class="subs" style="margin-top:8px">
          ${(t.subtasks || []).map((x) => `
            <div class="sub" data-sub="${esc(x.id)}">
              <input type="checkbox" data-d="sub-toggle" ${x.done ? 'checked' : ''} aria-label="${esc(x.title)}">
              <input class="sub__text" data-d="sub-text" value="${esc(x.title)}" aria-label="Sub-task title">
              <button class="btn btn--ghost btn--icon btn--sm sub__del" data-d="sub-del"
                      aria-label="Remove sub-task">${icon('x', 'i--sm')}</button>
            </div>`).join('')}
        </div>
        <button class="btn btn--ghost btn--sm" data-d="sub-add" style="margin-top:4px">
          ${icon('plus', 'i--sm')} Add sub-task
        </button>
      </div>

      <div class="dr__section">
        <div class="dr__sectionHead">
          <h3 class="dr__sectionTitle">Comments</h3>
          ${t.comments?.length ? `<span class="dr__sectionCount">${t.comments.length}</span>` : ''}
        </div>
        ${(t.comments || []).map((c) => `
          <div class="comment">
            ${avatar(memberOf(state, c.author))}
            <div class="comment__body">
              <div class="comment__meta">${esc(memberOf(state, c.author)?.name ?? 'Someone')} · ${esc(ago(c.at))}</div>
              ${esc(c.body)}
            </div>
          </div>`).join('')}
        <div style="display:flex;gap:6px;margin-top:8px">
          <input class="input" data-d="comment" placeholder="Write a comment…" aria-label="Write a comment">
          <button class="btn" data-d="comment-send" aria-label="Post comment">${icon('send', 'i--sm')}</button>
        </div>
      </div>

      <div class="dr__section">
        <div class="dr__sectionHead"><h3 class="dr__sectionTitle">Activity</h3></div>
        <div class="activity">
          ${(t.activity || []).slice().reverse().slice(0, 12).map((a) => `
            <div class="act">
              <span class="act__dot"></span>
              <span>${esc(describe(a))} <span class="act__when">${esc(ago(a.at))}</span></span>
            </div>`).join('') || '<p style="font-size:var(--fs-meta);color:var(--text-3)">Nothing yet.</p>'}
        </div>
      </div>
    </div>`;

  autosize($('.dr__title', dlg));
}

function describe(a) {
  if (a.kind === 'created') return 'Created';
  if (a.kind === 'status') return `Status ${a.from} → ${a.to}`;
  if (a.kind === 'priority') return `Priority ${a.from} → ${a.to}`;
  if (a.kind === 'assignee') return `Assigned ${a.from} → ${a.to}`;
  return a.kind;
}

function autosize(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}
