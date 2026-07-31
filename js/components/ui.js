/* ============================================================
   Primitives — the small pieces every view shares.
   ============================================================
   Every status and priority renderer here pairs its colour with
   a distinct SHAPE or a word. Nothing in this app communicates
   state by hue alone.
   ============================================================ */

import { esc, icon, initials, dueLabel, plural } from '../util.js';
import { STATUS, PRIORITY, PROJECT } from '../types.js';
import { memberOf, subProgress, taskKey } from '../store.js';

/* ---------- avatar ---------- */

export function avatar(member, cls = '') {
  if (!member) {
    return `<span class="avatar avatar--none ${cls}" title="Unassigned" aria-label="Unassigned">
      <svg class="i--sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12h14"/></svg>
    </span>`;
  }
  return `<span class="avatar ${cls}" title="${esc(member.name)}" aria-label="${esc(member.name)}">${esc(initials(member.name))}</span>`;
}

/* ---------- status ----------
   Five visually distinct glyphs: dashed ring, open ring, half-filled
   ring, ring with a slash, ring with a tick. Readable in greyscale.  */

export function statusGlyph(status) {
  const s = STATUS[status] ?? STATUS.backlog;
  return `<span data-tone="${s.tone}" class="sglyph-wrap">${icon(s.glyph, 'sglyph')}</span>`;
}

export function statusPill(status) {
  const s = STATUS[status] ?? STATUS.backlog;
  return `<span class="pill" data-tone="${s.tone}">${icon(s.glyph, 'i--sm')}${esc(s.label)}</span>`;
}

/* ---------- priority ----------
   Three bars filled to rank. The count of filled bars carries the
   value; the tone only reinforces it.  */

export function priorityBars(priority, withLabel = false) {
  const p = PRIORITY[priority] ?? PRIORITY.medium;
  const bars = [1, 2, 3].map((n) => `<i class="${n <= p.bars ? 'on' : ''}"></i>`).join('');
  return `<span class="prio-wrap" data-tone="${p.tone}" title="${esc(p.label)} priority">
    <span class="prio" role="img" aria-label="${esc(p.label)} priority">${bars}</span>
    ${withLabel ? `<span class="prio-label">${esc(p.label)}</span>` : ''}
  </span>`;
}

/* ---------- due ---------- */

export function dueChip(iso, today) {
  const d = dueLabel(iso, today);
  if (!d) return '';
  const cls = d.tone === 'late' ? ' due--late' : d.tone === 'soon' ? ' due--soon' : '';
  return `<time class="due${cls}" datetime="${esc(iso)}">${esc(d.text)}</time>`;
}

/* ---------- labels / project ---------- */

export function labelChips(labels = [], max = 2) {
  if (!labels.length) return '';
  const shown = labels.slice(0, max).map((l) => `<span class="label-chip">${esc(l)}</span>`).join('');
  const rest = labels.length - max;
  return shown + (rest > 0 ? `<span class="label-chip" title="${esc(labels.slice(max).join(', '))}">+${rest}</span>` : '');
}

export function projectChip(project) {
  const p = PROJECT[project];
  return p ? `<span class="label-chip">${esc(p.label)}</span>` : '';
}

/* ---------- sub-task progress ---------- */

export function subChip(task) {
  const p = subProgress(task);
  if (!p) return '';
  return `<span class="row__sub" title="${p.done} of ${plural(p.total, 'sub-task')} done">
    ${icon('check', 'i--sm')}${p.done}/${p.total}</span>`;
}

/* ---------- empty state ---------- */

export function emptyState({ icon: name = 'sparkle', title, body, action = '', inline = false }) {
  return `<div class="empty${inline ? ' empty--inline' : ''}">
    <div class="empty__inner">
      <div class="empty__icon">${icon(name)}</div>
      <div class="empty__title">${esc(title)}</div>
      ${body ? `<p class="empty__body">${esc(body)}</p>` : ''}
      ${action ? `<div class="empty__act">${action}</div>` : ''}
    </div>
  </div>`;
}

/* ---------- skeleton ---------- */

export function skeletonList(n = 8) {
  return Array.from({ length: n }, () => `
    <div class="skelrow" aria-hidden="true">
      <span></span>
      <span class="skel" style="width:14px;height:14px;border-radius:99px"></span>
      <span class="skel" style="width:44px;height:9px"></span>
      <span class="skel" style="width:${38 + Math.round(((n * 37) % 5) * 9)}%;height:11px"></span>
      <span class="skel" style="width:22px;height:22px;border-radius:99px"></span>
    </div>`).join('');
}

/* ---------- misc ---------- */

export function keyOf(task) { return taskKey(task); }

export function assigneeOf(state, task) { return memberOf(state, task.assignee); }
