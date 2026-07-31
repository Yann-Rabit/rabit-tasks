/* ============================================================
   SupabaseAdapter — the shared workspace, live.
   ============================================================
   Same three-method contract as LocalAdapter (load / save /
   subscribe), implemented over Supabase's REST API with polling
   (every 8s, plus on window focus). Polling over websockets is a
   deliberate trade: it survives proxies, sleep/wake, and flaky
   hotel wifi, and for two founders an eight-second delay is
   indistinguishable from live.

   Writes are last-write-wins on the whole document. With two
   people and a poll that adopts remote changes quickly, real
   collisions are rare; when both edit the same task inside one
   window, the later save wins. Stated here so nobody is
   surprised.

   Security model, stated plainly: the anon key is public by
   design, and the SQL below allows anonymous read/write on the
   single workspace row. Anyone who has the join link can read
   and edit the board. For a two-person internal tool behind an
   unguessable URL that is an accepted trade — see docs/BACKEND.md
   for the tighter, login-based setup.
   ============================================================ */

const CONFIG_KEY = 'rabit.sync.v1';
const POLL_MS = 8000;

/* ------------------------------------------------------------
   Config in localStorage: { url, anonKey, workspaceId }
   ------------------------------------------------------------ */

export function syncConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    return c?.url && c?.anonKey && c?.workspaceId ? c : null;
  } catch { return null; }
}

export function saveSyncConfig(config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export function clearSyncConfig() {
  localStorage.removeItem(CONFIG_KEY);
}

/* ------------------------------------------------------------
   Join links: #join=base64url(JSON config). The anon key is
   public-by-design; the link is how Firas connects in one click.
   ------------------------------------------------------------ */

export function makeJoinLink(config, baseUrl) {
  const packed = btoa(JSON.stringify(config))
    .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  return `${baseUrl}#join=${packed}`;
}

export function parseJoinHash(hash) {
  const m = String(hash || '').match(/join=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  try {
    const json = atob(m[1].replaceAll('-', '+').replaceAll('_', '/'));
    const c = JSON.parse(json);
    return c?.url && c?.anonKey && c?.workspaceId ? c : null;
  } catch { return null; }
}

/** The SQL a founder runs once in Supabase's SQL editor. */
export const SETUP_SQL = `create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  doc jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.workspaces enable row level security;
create policy "anon reads"  on public.workspaces for select to anon using (true);
create policy "anon writes" on public.workspaces for update to anon using (true) with check (true);
create policy "anon inserts" on public.workspaces for insert to anon with check (true);
insert into public.workspaces (doc) values ('{}'::jsonb) returning id;`;

/* ------------------------------------------------------------
   Adapter
   ------------------------------------------------------------ */

export class SupabaseAdapter {
  #url; #key; #id;
  #listeners = new Set();
  #timer = null;
  #lastStamp = null;      // updated_at of the version we last saw
  #saving = false;
  onStatus = null;        // (state: 'live'|'offline') => void

  constructor({ url, anonKey, workspaceId }) {
    this.#url = url.replace(/\/$/, '');
    this.#key = anonKey;
    this.#id = workspaceId;
  }

  #endpoint() {
    return `${this.#url}/rest/v1/workspaces?id=eq.${encodeURIComponent(this.#id)}`;
  }

  #headers(extra = {}) {
    return {
      apikey: this.#key,
      Authorization: `Bearer ${this.#key}`,
      'Content-Type': 'application/json',
      ...extra,
    };
  }

  async load() {
    const res = await fetch(`${this.#endpoint()}&select=doc,updated_at`, { headers: this.#headers() });
    if (!res.ok) throw new Error(`Could not reach the shared workspace (${res.status}). Check the connection details in Settings.`);
    const rows = await res.json();
    if (!rows.length) throw new Error('The shared workspace row was not found. Check the workspace id in Settings.');
    this.#lastStamp = rows[0].updated_at;
    const doc = rows[0].doc;
    return doc && Array.isArray(doc.tasks) ? doc : null;
  }

  async save(workspace) {
    this.#saving = true;
    try {
      const res = await fetch(this.#endpoint(), {
        method: 'PATCH',
        headers: this.#headers({ Prefer: 'return=representation' }),
        body: JSON.stringify({ doc: workspace, updated_at: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error(`Could not save to the shared workspace (${res.status}). Your changes are still in this browser.`);
      const rows = await res.json().catch(() => []);
      if (rows[0]?.updated_at) this.#lastStamp = rows[0].updated_at;
      this.onStatus?.('live');
    } catch (err) {
      this.onStatus?.('offline');
      throw err;
    } finally {
      this.#saving = false;
    }
  }

  subscribe(fn) {
    this.#listeners.add(fn);
    if (!this.#timer) {
      this.#timer = setInterval(() => this.#poll(), POLL_MS);
      window.addEventListener('focus', this.#onFocus);
    }
    return () => this.#listeners.delete(fn);
  }

  #onFocus = () => this.#poll();

  async #poll() {
    if (this.#saving || document.hidden) return;
    try {
      const res = await fetch(`${this.#endpoint()}&select=updated_at`, { headers: this.#headers() });
      if (!res.ok) { this.onStatus?.('offline'); return; }
      const rows = await res.json();
      const stamp = rows[0]?.updated_at;
      this.onStatus?.('live');
      if (!stamp || stamp === this.#lastStamp) return;

      const doc = await this.load();          // also refreshes #lastStamp
      if (doc) this.#listeners.forEach((cb) => cb(doc));
    } catch {
      this.onStatus?.('offline');
    }
  }

  stop() {
    clearInterval(this.#timer);
    this.#timer = null;
    window.removeEventListener('focus', this.#onFocus);
  }

  /** Contract parity with LocalAdapter; nothing remote to clear. */
  async clear() {}
}
