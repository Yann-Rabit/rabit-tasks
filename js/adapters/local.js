/* ============================================================
   LocalAdapter — the shipped storage backend.
   ============================================================
   Persists the whole workspace to localStorage and mirrors
   changes across open tabs on the same machine via the `storage`
   event, so two windows never diverge.

   This is the contract every adapter must satisfy:

     load()          -> Promise<workspace | null>
     save(workspace) -> Promise<void>
     subscribe(fn)?  -> optional; called with a fresh workspace
                        when another client changes it

   A shared backend implements the same three methods and nothing
   in the UI changes. See docs/BACKEND.md and adapters/supabase.js.
   ============================================================ */

const KEY = 'rabit.dashboard.v1';

export class LocalAdapter {
  #key;
  #listeners = new Set();
  #lastWritten = null;

  constructor(key = KEY) {
    this.#key = key;
    window.addEventListener('storage', (e) => {
      if (e.key !== this.#key || e.newValue == null) return;
      if (e.newValue === this.#lastWritten) return;   // our own write echoing back
      try {
        const next = JSON.parse(e.newValue);
        this.#listeners.forEach((fn) => fn(next));
      } catch { /* another tab wrote something unreadable; ignore */ }
    });
  }

  async load() {
    const raw = localStorage.getItem(this.#key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      // Never silently discard the user's data: park it and start clean.
      localStorage.setItem(`${this.#key}.corrupt.${Date.now()}`, raw);
      return null;
    }
  }

  async save(workspace) {
    const raw = JSON.stringify(workspace);
    this.#lastWritten = raw;
    try {
      localStorage.setItem(this.#key, raw);
    } catch (err) {
      throw new Error('Browser storage is full or blocked. Export your workspace to avoid losing work.');
    }
  }

  subscribe(fn) {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  /** Used by Settings → Reset. */
  async clear() {
    localStorage.removeItem(this.#key);
  }
}
