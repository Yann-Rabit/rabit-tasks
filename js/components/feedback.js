/* Toasts and the confirmation dialog. */

import { esc, icon, h, $ } from '../util.js';

let host = null;

/**
 * Undo toast. Status changes and deletes are optimistic, so the
 * toast is the safety net — it is the only thing standing between
 * a mis-drop and lost work, and it must never be decorative.
 */
export function toast(message, { tone = 'ok', action = null, timeout = 5000 } = {}) {
  if (!host) {
    host = h('<div class="toasts" role="status" aria-live="polite"></div>');
    document.body.appendChild(host);
  }

  const el = h(`<div class="toast${tone === 'err' ? ' toast--err' : ''}">
    <span class="toast__msg">${esc(message)}</span>
  </div>`);

  if (action) {
    const btn = h(`<button class="btn btn--sm">${esc(action.label)}${action.key ? `<span class="kbd">${esc(action.key)}</span>` : ''}</button>`);
    btn.addEventListener('click', () => { action.run(); el.remove(); });
    el.appendChild(btn);
  }
  const close = h(`<button class="btn btn--ghost btn--icon btn--sm" aria-label="Dismiss">${icon('x', 'i--sm')}</button>`);
  close.addEventListener('click', () => el.remove());
  el.appendChild(close);

  host.appendChild(el);
  const timer = setTimeout(() => el.remove(), timeout);
  el.addEventListener('mouseenter', () => clearTimeout(timer));
  return el;
}

/** Promise-based confirm. Escape and the backdrop both cancel. */
export function confirmDialog({ title, body, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const dlg = h(`<dialog class="dlg">
      <div class="dlg__panel">
        <h2 class="dlg__title">${esc(title)}</h2>
        <p class="dlg__body">${esc(body)}</p>
        <div class="dlg__foot">
          <button class="btn" data-no>Cancel</button>
          <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-yes>${esc(confirmLabel)}</button>
        </div>
      </div>
    </dialog>`);
    document.body.appendChild(dlg);

    // Settle + remove directly — never lean on the dialog 'close'
    // event, which at least one embedded Chromium never fires.
    // Leaning on it left orphaned dialogs stacked in the DOM.
    let settled = false;
    const finish = (v) => {
      if (settled) return;
      settled = true;
      try { dlg.close(); } catch { /* already closed */ }
      dlg.remove();
      resolve(v);
    };

    $('[data-yes]', dlg).addEventListener('click', () => finish(true));
    $('[data-no]', dlg).addEventListener('click', () => finish(false));
    dlg.addEventListener('click', (e) => { if (e.target === dlg) finish(false); });
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(false); });
    dlg.addEventListener('close', () => finish(false));

    dlg.showModal();
    $('[data-yes]', dlg).focus();
  });
}
