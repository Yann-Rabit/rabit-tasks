# Moving to a shared backend

Today the board is **local-first**: every commitment lives in your browser, and the
workspace file (Settings → Export) is how it moves between people. That was the chosen
trade — it ships now, needs no accounts, and no secret goes in the repo.

This is the exact path to a real shared board where Yann and Firas see each other's edits
live. It is roughly thirty minutes of work, and **no view file changes**.

---

## Why it is only one edit

Every storage backend satisfies the same three-method contract:

```js
load()          // -> Promise<workspace | null>
save(workspace) // -> Promise<void>
subscribe(fn)   // optional; fn(workspace) when another client changes it
```

`js/store.js` is written against that contract and nothing else. `js/adapters/local.js`
implements it over `localStorage`; `js/adapters/supabase.js` implements it over Postgres
and Realtime. The views never learn which one is in use.

---

## 1. Create the project

1. Sign in at [supabase.com](https://supabase.com) and create a project. The free tier is
   more than enough for a two-person board.
2. Copy the **Project URL** and the **anon public key** from Project Settings → API.

## 2. Create the table

Run this in the SQL editor:

```sql
create table public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'Rabit',
  doc         jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.workspaces enable row level security;

-- Only signed-in users on the team may read or write.
create policy "team reads"  on public.workspaces
  for select to authenticated using (true);

create policy "team writes" on public.workspaces
  for update to authenticated using (true) with check (true);

-- Push UPDATEs to every connected client.
alter publication supabase_realtime add table public.workspaces;

-- Create the single row this board uses, and note the id it returns.
insert into public.workspaces (name) values ('Rabit') returning id;
```

## 3. Restrict sign-in to the team

In Authentication → Providers, enable **Email** (magic link is the least friction), then in
Authentication → Policies set the allowed domain to `rabit.co`. Anyone with a `@rabit.co`
address can then sign in; nobody else can.

If you want per-person ownership enforced in the database rather than in the UI, replace
the blanket policies above with ones that check `auth.jwt() ->> 'email' like '%@rabit.co'`.

## 4. Wire it up

In `js/app.js`, replace these two lines:

```js
import { LocalAdapter } from './adapters/local.js';
const adapter = new LocalAdapter();
```

with:

```js
import { SupabaseAdapter } from './adapters/supabase.js';
const adapter = new SupabaseAdapter({
  url:         'https://YOUR-PROJECT.supabase.co',
  anonKey:     'YOUR-ANON-KEY',
  workspaceId: 'THE-UUID-FROM-STEP-2',
});
```

That is the whole change. `subscribe()` is already called in `boot()`, so live updates
start working the moment the adapter provides them.

### About the anon key

The anon key is designed to be public — it is the RLS policies, not the key, that protect
the data. Committing it is normal Supabase practice. If you would rather not, read it from
a `config.js` that stays in `.gitignore`.

## 5. Move your existing board over

Export the workspace (Settings → Export), then paste its contents into the `doc` column of
the row you created. Or simply open the app once with the new adapter wired and import the
file — the first save writes it up.

---

## What changes in the UI afterwards

Two things become true that the current build deliberately does not claim:

- **Team → Invite** can stop saying "this does not create a login", because it will.
- Presence and "who is editing" become possible. They are not faked today.

Both strings live in `js/views/team.js`.

## What still will not be there

Slack stays a one-way incoming webhook. Creating tasks *from* Slack needs a slash command,
which needs a public HTTPS endpoint Slack can POST to — a Supabase Edge Function is the
natural home for it, but it is a separate piece of work from this migration.
