/* ============================================================
   AppShell — one top bar. The sidebar is gone.
   ============================================================
   Three destinations do not need 232px of chrome, a collapse
   state, section labels, or badges. One 52px bar carries the
   brand, the three views, search, and New task. Everything else
   lives behind ⌘K or in Settings.
   ============================================================ */

import { esc, icon } from '../util.js';
import { VIEWS } from '../types.js';
import { memberOf } from '../store.js';
import { avatar } from './ui.js';

export function shellBar(state, { view, shared = false }) {
  const me = memberOf(state, state.settings.me);
  const nav = VIEWS.filter((v) => v.id !== 'settings');

  return `
    <header class="bar">
      <a class="bar__brand" href="#/today" aria-label="Rabit Tasks">
        <img class="bar__mark" src="assets/rabit-icon.png" alt="" width="20" height="20">
        <span class="bar__name">Rabit</span>
        ${shared ? '<span class="bar__sync" data-state="live" title="Shared workspace — connected"></span>' : ''}
      </a>

      <nav class="bar__nav" aria-label="Views">
        ${nav.map((v) => `
          <a class="bar__item" href="#/${esc(v.id)}" ${view === v.id ? 'aria-current="page"' : ''}>
            ${esc(v.label)}
          </a>`).join('')}
      </nav>

      <span class="bar__spacer"></span>

      <button class="searchbtn" data-act="command" aria-label="Search tasks and commands">
        ${icon('search', 'i--sm')}<span class="searchbtn__label">Search</span>
        <span class="searchbtn__sp"></span><span class="kbd">⌘K</span>
      </button>

      <button class="btn btn--primary" data-act="new">
        ${icon('plus', 'i--sm')}<span class="btn__label">New task</span>
      </button>

      <button class="bar__me" data-act="switch-me" aria-label="You are ${esc(me?.name ?? 'nobody')} — switch">
        ${avatar(me)}
      </button>

      <a class="btn btn--ghost btn--icon" href="#/settings"
         aria-label="Settings" ${view === 'settings' ? 'aria-current="page"' : ''}>
        ${icon('settings')}
      </a>
    </header>`;
}

/** Bottom navigation for phones. */
export function mobileNav(view) {
  return `<nav class="mobilenav" aria-label="Main">
    ${VIEWS.map((v) => `
      <a class="mobilenav__item" href="#/${esc(v.id)}" ${view === v.id ? 'aria-current="page"' : ''}>
        ${icon(v.icon)}<span>${esc(v.label)}</span>
      </a>`).join('')}
  </nav>`;
}
