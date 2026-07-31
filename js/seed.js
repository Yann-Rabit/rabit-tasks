/* ============================================================
   Seed — a clean workspace with one example task.
   ============================================================
   Members are Yann and Firas. The single task exists to show
   what a task can carry (project, due date, sub-tasks,
   description); delete it when the real work arrives.
   ============================================================ */

import { emptyWorkspace, makeTask, makeMember } from './store.js';
import { uid, todayISO, addDays } from './util.js';

const PEOPLE = [
  { key: 'Yann',  name: 'Yann Chebli', email: 'yann@rabit.co' },
  { key: 'Firas', name: 'Firas',       email: 'firas@rabit.co' },
];

export function seedWorkspace() {
  const ws = emptyWorkspace();

  const members = PEOPLE.map((p) => makeMember({ name: p.name, email: p.email }));
  ws.members = members;
  ws.settings.me = members[0].id;

  ws.tasks = [makeTask({
    num: 1,
    title: 'Example — rebuild the seed deck on Avenue B',
    description: 'This is an example task so the screens are not empty. '
      + 'Open it, poke at the fields, then delete it and add the real work. '
      + 'Everything autosaves; ⌘K searches; C creates.',
    project: 'fundraise',
    assignee: members[0].id,
    status: 'backlog',
    priority: 'high',
    due: addDays(todayISO(), 7),
    order: 0,
    subtasks: [
      { id: uid('s'), title: 'Sub-tasks look like this — check one off', done: false },
      { id: uid('s'), title: 'Set status, owner, and due date from the drawer or the row', done: false },
      { id: uid('s'), title: 'Delete this task from the drawer when you are done', done: false },
    ],
  })];

  ws.nextNum = 2;
  return ws;
}
