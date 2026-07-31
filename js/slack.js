/* ============================================================
   Slack — incoming webhook delivery.
   ============================================================
   No OAuth, no backend, no secret in the repo. The webhook URL is
   stored in the browser only.

   Slack's incoming-webhook endpoint does not send CORS headers, so
   a browser fetch cannot read the response. We post with
   `mode: 'no-cors'`, which delivers the message but returns an
   opaque response — we can confirm the request left the page,
   never that Slack accepted it. The UI says exactly that.
   ============================================================ */

import { STATUS, PRIORITY, PROJECT } from './types.js';
import { taskKey, memberOf } from './store.js';
import { fmtDateLong } from './util.js';

const WEBHOOK_RE = /^https:\/\/hooks\.slack\.com\/services\/T[A-Za-z0-9]+\/B[A-Za-z0-9]+\/[A-Za-z0-9]+$/;

export function isValidWebhook(url) {
  return WEBHOOK_RE.test(String(url || '').trim());
}

async function post(url, payload) {
  if (!isValidWebhook(url)) throw new Error('That does not look like a Slack webhook URL.');
  await fetch(url, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { delivered: 'unconfirmed' };
}

function taskBlocks(task, state, headline) {
  const owner = memberOf(state, task.assignee)?.name ?? 'Unassigned';
  const facts = [
    `*Status*  ${STATUS[task.status].label}`,
    `*Owner*  ${owner}`,
    `*Priority*  ${PRIORITY[task.priority].label}`,
  ];
  if (task.project) facts.push(`*Project*  ${PROJECT[task.project]?.label ?? task.project}`);
  if (task.due) facts.push(`*Due*  ${fmtDateLong(task.due)}`);
  if (task.status === 'blocked' && task.blockedReason) facts.push(`*Blocked on*  ${task.blockedReason}`);

  return [
    { type: 'section', text: { type: 'mrkdwn', text: `${headline}\n*${taskKey(task)} — ${task.title}*` } },
    { type: 'section', fields: facts.map((t) => ({ type: 'mrkdwn', text: t })) },
    { type: 'context', elements: [{ type: 'mrkdwn', text: 'Rabit Tasks' }] },
  ];
}

export const slack = {
  async notifyTask(state, task, event) {
    const url = state.settings.slackWebhook;
    if (!url || !state.settings.slackEvents?.[event]) return null;

    const headline = {
      created: 'New task', completed: 'Completed', blocked: 'Blocked',
    }[event];
    if (!headline) return null;

    return post(url, {
      text: `${headline}: ${taskKey(task)} ${task.title}`,
      blocks: taskBlocks(task, state, headline),
    });
  },

  async test(url) {
    return post(url, {
      text: 'Rabit Tasks is connected to this channel.',
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: '*Rabit Tasks is connected to this channel.*' } },
        { type: 'context', elements: [{ type: 'mrkdwn', text: 'You will get a message here when a task is created, blocked, or completed.' }] },
      ],
    });
  },
};
