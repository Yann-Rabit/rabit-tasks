/* Settings and Team. Two people, so no roles, no permissions, no admin. */

import { esc, icon, fmtDateLong, plural, todayISO, initials } from '../util.js';
import { isValidWebhook } from '../slack.js';
import { syncConfig } from '../adapters/supabase.js';
import { loadByMember, isOpen, live } from '../store.js';
import { avatar } from '../components/ui.js';

export function settingsView(state) {
  return teamBlock(state) + preferencesBlocks(state);
}

function sharedBlock() {
  const cfg = syncConfig();

  if (cfg) {
    return `
      <div class="block">
        <h2 class="block__title">Shared workspace</h2>
        <p class="block__desc">
          This browser is connected — the dot next to the logo shows live or offline. Edits
          save to the shared workspace and everyone connected picks them up within seconds.
          If you both edit the same task at the same moment, the later save wins.
        </p>
        <p class="field__hint" style="margin-bottom:12px">
          Workspace <span style="font-family:var(--font-mono)">${esc(String(cfg.workspaceId).slice(0, 8))}…</span>
          on <span style="font-family:var(--font-mono)">${esc(cfg.url.replace(/^https?:\/\//, ''))}</span>
        </p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn--primary" data-act="sync-copy-link">${icon('mail', 'i--sm')} Copy join link for Firas</button>
          <button class="btn" data-act="sync-disconnect">Disconnect this browser</button>
        </div>
        <p class="field__hint" style="margin-top:12px">
          Anyone who has the join link can read and edit this board — treat it like a shared
          password. Send it privately.
        </p>
      </div>`;
  }

  return `
    <div class="block">
      <h2 class="block__title">Shared workspace</h2>
      <p class="block__desc">
        Right now every browser keeps its own copy. To work on one live board together,
        connect a free Supabase project — a ten-minute, one-time setup:
      </p>
      <ol style="margin:0 0 14px;padding-left:20px;font-size:var(--fs-ui);color:var(--text-2);line-height:1.8">
        <li>Create a free project at <b>supabase.com</b> (any name, any region).</li>
        <li>Open its <b>SQL Editor</b>, paste the setup script, run it, and copy the
            <b>id</b> it returns.
            <button class="btn btn--sm" data-act="sync-copy-sql" style="margin-left:6px">Copy setup SQL</button></li>
        <li>From <b>Project Settings → API</b>, copy the Project URL and the anon public key,
            and paste all three below.</li>
      </ol>
      <div class="field">
        <label class="field__label" for="sy-url">Project URL</label>
        <input class="input" id="sy-url" spellcheck="false" placeholder="https://xxxx.supabase.co"
               style="font-family:var(--font-mono);font-size:var(--fs-meta)">
      </div>
      <div class="field">
        <label class="field__label" for="sy-key">Anon public key</label>
        <input class="input" id="sy-key" spellcheck="false" placeholder="eyJhbGciOi…"
               style="font-family:var(--font-mono);font-size:var(--fs-meta)">
      </div>
      <div class="field">
        <label class="field__label" for="sy-id">Workspace id (returned by the SQL)</label>
        <input class="input" id="sy-id" spellcheck="false" placeholder="a1b2c3d4-…"
               style="font-family:var(--font-mono);font-size:var(--fs-meta)">
      </div>
      <button class="btn btn--primary" data-act="sync-connect">Connect</button>
      <p class="field__hint" style="margin-top:12px">
        This board you are looking at moves onto the shared workspace as its starting
        point. After connecting, use <b>Copy join link</b> here to bring Firas in with
        one click — no setup on his side.
      </p>
    </div>`;
}

function preferencesBlocks(state) {
  const s = state.settings;
  const connected = isValidWebhook(s.slackWebhook);

  return `
    <div class="page">
      ${sharedBlock()}
      <div class="block">
        <h2 class="block__title">Appearance</h2>
        <p class="block__desc">Light is the default. Dark uses deep neutral surfaces, not pure black.</p>
        <div class="switch" role="group" aria-label="Theme">
          <button class="switch__opt" data-act="theme-set" data-value="light" aria-pressed="${s.theme === 'light'}">
            ${icon('sun', 'i--sm')}Light</button>
          <button class="switch__opt" data-act="theme-set" data-value="dark" aria-pressed="${s.theme === 'dark'}">
            ${icon('moon', 'i--sm')}Dark</button>
        </div>
      </div>

      <div class="block">
        <h2 class="block__title">Slack</h2>
        <p class="block__desc">
          Paste an incoming webhook URL and this workspace posts to that channel when a task is created,
          blocked, or completed. The URL is stored in this browser only. Create one at
          <span style="font-family:var(--font-mono)">api.slack.com/apps</span> → your app → Incoming Webhooks.
        </p>
        <div class="field">
          <label class="field__label" for="slack-url">Webhook URL</label>
          <input class="input" id="slack-url" type="url" spellcheck="false"
                 style="font-family:var(--font-mono);font-size:var(--fs-meta)"
                 placeholder="https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXX"
                 value="${esc(s.slackWebhook)}" aria-invalid="${!!s.slackWebhook && !connected}">
          ${s.slackWebhook && !connected
            ? '<div class="field__err">That is not a Slack incoming-webhook URL.</div>'
            : `<div class="field__hint">${connected ? 'A webhook is saved.' : 'No webhook saved.'}</div>`}
        </div>
        <div class="field">
          <span class="field__label">Post when</span>
          ${[['created', 'A task is created'], ['completed', 'A task is completed'], ['blocked', 'A task is blocked']]
            .map(([k, label]) => `
              <label class="check">
                <input type="checkbox" data-act="slack-event" data-key="${k}" ${s.slackEvents[k] ? 'checked' : ''}>
                <span class="check__t">${esc(label)}</span>
              </label>`).join('')}
        </div>
        <button class="btn" data-act="slack-test" ${connected ? '' : 'disabled'}>
          ${icon('send', 'i--sm')} Send a test message</button>
        <p class="field__hint">
          Slack's webhook endpoint does not answer browsers, so this page can confirm a message was sent
          but not that Slack accepted it. Check the channel.
        </p>
      </div>

      <div class="block">
        <h2 class="block__title">Workspace file</h2>
        <p class="block__desc">
          Everything lives in this browser. Export to back it up or move machines; importing replaces
          what is here.
        </p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn" data-act="export">${icon('download', 'i--sm')} Export</button>
          <button class="btn" data-act="import">${icon('upload', 'i--sm')} Import</button>
          <input type="file" id="ws-file" accept="application/json,.json" hidden>
        </div>
        <p class="field__hint">Last saved ${esc(fmtDateLong(state.meta.updatedAt.slice(0, 10)))}.</p>
      </div>

      <div class="block">
        <h2 class="block__title">About</h2>
        <p class="field__hint">Build <span style="font-family:var(--font-mono)">${esc(String(globalThis.__RABIT_BUILD ?? 'dev'))}</span>
        — the app updates itself when a new build ships.</p>
      </div>

      <div class="block">
        <h2 class="block__title">Reset</h2>
        <p class="block__desc">Deletes every task and member in this browser and reloads the seeded workspace.</p>
        <button class="btn btn--danger" data-act="reset">${icon('trash', 'i--sm')} Reset workspace</button>
      </div>
    </div>`;
}

function teamBlock(state) {
  const today = todayISO();
  const load = loadByMember(state, today);
  const me = state.settings.me;

  return `
    <div class="page" style="padding-bottom:0">
      <div class="block">
        <h2 class="block__title">Members</h2>
        <p class="block__desc">
          Two founders, so there are no roles and no permissions. "You" decides what Today and the Mine toggle show.
        </p>
        <div>
          ${state.members.map((m) => {
            const l = load.get(m.id) ?? { open: 0, late: 0, blocked: 0 };
            return `
              <div class="person">
                ${avatar(m, 'avatar--lg')}
                <span class="person__main">
                  <span class="person__name">${esc(m.name)}
                    ${m.id === me ? '<span class="label-chip" style="margin-left:6px">You</span>' : ''}
                    ${m.invited ? '<span class="label-chip" style="margin-left:6px">Invite sent</span>' : ''}
                  </span>
                  <span class="person__mail">${esc(m.email || 'No email on file')}</span>
                </span>
                <span class="person__load">
                  <span class="person__loadN">${l.open}</span>
                  ${l.late ? `${l.late} late` : 'open'}
                </span>
                ${m.id !== me ? `<button class="btn btn--sm" data-act="set-me" data-id="${esc(m.id)}">This is me</button>` : ''}
                <button class="btn btn--ghost btn--icon btn--sm" data-act="member-remove" data-id="${esc(m.id)}"
                        aria-label="Remove ${esc(m.name)}">${icon('trash', 'i--sm')}</button>
              </div>`;
          }).join('')}
        </div>
      </div>

      <div class="block">
        <h2 class="block__title">Invite</h2>
        <p class="block__desc">
          Adding someone creates their member record so work can be assigned to them, and opens a
          pre-written email. It does not create a login — this workspace has no accounts yet, so
          everyone works from their own copy until a shared backend is connected.
        </p>
        <div class="row2">
          <div class="field">
            <label class="field__label" for="inv-name">Name</label>
            <input class="input" id="inv-name" placeholder="Firas" autocomplete="off">
          </div>
          <div class="field">
            <label class="field__label" for="inv-email">Email</label>
            <input class="input" id="inv-email" type="email" spellcheck="false"
                   placeholder="name@${esc(state.settings.inviteDomain)}" autocomplete="off">
            <div class="field__err" id="inv-err" hidden></div>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn--primary" data-act="member-add">${icon('plus', 'i--sm')} Add</button>
          <button class="btn" data-act="member-invite">${icon('mail', 'i--sm')} Add and compose invite</button>
        </div>
      </div>
    </div>`;
}

export function inviteMailto(state, member, url) {
  const n = state.tasks.filter((t) => isOpen(t) && t.assignee === member.id).length;
  const subject = `Rabit tasks — ${n ? `you have ${plural(n, 'task')}` : 'workspace access'}`;
  const body = [
    `${member.name.split(' ')[0]},`, '',
    'Our tasks for the quarter now live in one place — backlog, board, and who owns what.', '',
    `Open it here: ${url}`, '',
    'It runs in your browser. Import the workspace file from this thread (Settings → Import) and you will see the same tasks I do.',
  ].join('\n');
  return `mailto:${encodeURIComponent(member.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
