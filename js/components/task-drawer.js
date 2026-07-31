/* ============================================================
   TaskDrawer — the task detail experience.
   ============================================================
   A right-side drawer, never a centre modal. Opening a task must
   not tear you out of the list you were reading: the list stays
   rendered behind it and your scroll position and cursor survive.

   Everything autosaves. There is no Save button, because there is
   no state in which your edit is not yet real.
   ============================================================ */

import { $, $$, esc, icon, uid, ago, fmtDateLong, debounce } from '../util.js';
import { STATUS, PRIORITY, PROJECT } from '../types.js';
import { taskKey, memberOf, subProgress } from '../store.js';
import { avatar, statusGlyph, priorityBars, dueChip } from './ui.js';
import { statusPicker, priorityPicker, assigneePicker, projectPicker, duePicker, closeMenu } from './menu.js';
import { confirmDialog, toast } from './feedback.js';

let dlg = null;
let currentId = null;
/** @type {{store: any, onChange?: () => void, returnFocus?: () => void}|null} */
let ctx = null;

export const openTaskId = () => currentId;

export function closeDrawer() {
  if (!dlg?.open) return;
  closeMenu();
  dlg.classList.add('is-closing');
  const done = () => {
    dlg.classList.remove('is-closing');
    dlg.close();
  };
  // Respect reduced motion: the class animation collapses to 1ms there.
  dlg.addEventListener('animationend', done, { once: true });
  setTimeout(done, 220);
}

export function openDrawer(taskId, { store, onChange, returnFocus }) {
  ctx = { store, onChange, returnFocus };
  currentId = taskId;

  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.className = 'drawer';
    dlg.setAttribute('aria-label', 'Task details');
    document.body.appendChild(dlg);

    dlg.addEventListener('close', () => {
      currentId = null;
      ctx?.returnFocus?.();
      ctx = null;
    });
    // Clicking the backdrop closes; clicking inside must not.
    dlg.addEventListener('click', (e) => { if (e.target === dlg) closeDrawer(); });
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); closeDrawer(); });
  }

  render();
  if (!dlg.open) dlg.showModal();
  $('.dr__title', dlg)?.focus({ preventScroll: true });
}

export function refreshDrawer() {
  if (dlg?.open && currentId) render();
}

/* ------------------------------------------------------------ */

function task() {
  return ctx?.store.state.tasks.find((t) => t.id === currentId) ?? null;
}

function patch(p) {
  ctx.store.updateTask(currentId, p);
  ctx.onChange?.();
  render();
}

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
      <button class="btn btn--ghost btn--icon" data-d="close" aria-label="Close (Escape)">${icon('x')}</button>
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
              <input type="checkbox" data-d="sub-toggle" ${x.done ? 'checked' : ''}
                     aria-label="${esc(x.title)}">
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
  wire();
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

function wire() {
  const t = task();

  const saveTitle = debounce((v) => patchQuiet({ title: v }), 350);
  const saveDesc = debounce((v) => patchQuiet({ description: v }), 350);
  const saveBlocked = debounce((v) => patchQuiet({ blockedReason: v }), 350);

  /** Save without a re-render, so the caret does not jump while typing. */
  function patchQuiet(p) {
    ctx.store.updateTask(currentId, p);
    ctx.onChange?.();
  }

  dlg.addEventListener('input', (e) => {
    const d = e.target.dataset.d;
    if (d === 'title') { autosize(e.target); saveTitle(e.target.value.trim()); }
    if (d === 'description') saveDesc(e.target.value);
    if (d === 'blocked') saveBlocked(e.target.value);
    if (d === 'sub-text') {
      const id = e.target.closest('[data-sub]').dataset.sub;
      patchQuiet({ subtasks: task().subtasks.map((s) => s.id === id ? { ...s, title: e.target.value } : s) });
    }
  });

  dlg.addEventListener('change', (e) => {
    if (e.target.dataset.d !== 'sub-toggle') return;
    const id = e.target.closest('[data-sub]').dataset.sub;
    patch({ subtasks: task().subtasks.map((s) => s.id === id ? { ...s, done: e.target.checked } : s) });
  });

  dlg.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-d]');
    if (!btn) return;
    const d = btn.dataset.d;
    const cur = task();

    if (d === 'close') closeDrawer();
    if (d === 'copy') {
      navigator.clipboard?.writeText(taskKey(cur));
      toast(`${taskKey(cur)} copied.`);
    }
    if (d === 'pick-status')   statusPicker(btn, cur.status, (v) => patch({ status: v }));
    if (d === 'pick-priority') priorityPicker(btn, cur.priority, (v) => patch({ priority: v }));
    if (d === 'pick-assignee') assigneePicker(btn, ctx.store.state, cur.assignee, (v) => patch({ assignee: v }));
    if (d === 'pick-project')  projectPicker(btn, cur.project, (v) => patch({ project: v }));
    if (d === 'pick-due')      duePicker(btn, cur.due, (v) => patch({ due: v }));

    if (d === 'sub-add') {
      patch({ subtasks: [...(cur.subtasks || []), { id: uid('s'), title: '', done: false }] });
      const inputs = $$('.sub__text', dlg);
      inputs[inputs.length - 1]?.focus();
    }
    if (d === 'sub-del') {
      const id = btn.closest('[data-sub]').dataset.sub;
      patch({ subtasks: cur.subtasks.filter((s) => s.id !== id) });
    }

    if (d === 'comment-send') {
      const input = $('[data-d="comment"]', dlg);
      const body = input.value.trim();
      if (!body) return;
      ctx.store.addComment(currentId, body);
      ctx.onChange?.();
      render();
    }

    if (d === 'archive') {
      patch({ archived: !cur.archived });
      toast(cur.archived ? 'Task restored.' : 'Task archived.', {
        action: { label: 'Undo', run: () => { patch({ archived: cur.archived }); } },
      });
      if (!cur.archived) closeDrawer();
    }

    if (d === 'delete') {
      const ok = await confirmDialog({
        title: `Delete ${taskKey(cur)}?`,
        body: 'This removes the task and its comments. You can undo this once from the toast.',
        confirmLabel: 'Delete', danger: true,
      });
      if (!ok) return;
      const snapshot = structuredClone(cur);
      ctx.store.removeTask(currentId);
      ctx.onChange?.();
      closeDrawer();
      toast('Task deleted.', {
        action: { label: 'Undo', run: () => { ctx?.store.restoreTask(snapshot); ctx?.onChange?.(); } },
        timeout: 8000,
      });
    }
  });

  dlg.addEventListener('keydown', (e) => {
    // Enter in the title commits and leaves; it must never insert a newline.
    if (e.key === 'Enter' && e.target.dataset.d === 'title') { e.preventDefault(); e.target.blur(); }
    if (e.key === 'Enter' && e.target.dataset.d === 'comment') { e.preventDefault(); $('[data-d="comment-send"]', dlg).click(); }
    if (e.key === 'Enter' && e.target.dataset.d === 'sub-text') { e.preventDefault(); $('[data-d="sub-add"]', dlg).click(); }
  });
}
