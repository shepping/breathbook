// history.js — logged sessions by date, grouped per month.

import * as storage from '../storage.js';
import { esc, formatDate, formatMonth, confirmDialog, toast } from '../ui.js';
import { ICONS } from './icons.js';

export async function renderHistory(el) {
  const sessions = await storage.getSessions(); // newest first

  if (!sessions.length) {
    el.innerHTML = `
      <div class="empty-state">
        <p>No sessions logged yet.</p>
        <p class="muted">When you tap <strong>Use this session</strong> on the Plan tab, it shows up here.</p>
        <a class="btn btn-primary" href="#/plan">Plan a session</a>
      </div>`;
    return;
  }

  const groups = new Map();
  for (const s of sessions) {
    const key = s.date.slice(0, 7);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }

  el.innerHTML = [...groups.entries()].map(([month, list]) => `
    <section class="month">
      <h2 class="month-title">${esc(formatMonth(month))} <span class="muted">· ${list.length}</span></h2>
      <ul class="hist-list">
        ${list.map((s) => `
          <li class="hist-item">
            <div class="hist-head">
              <span class="hist-date">${esc(formatDate(s.date))}</span>
              <span class="hist-total">${s.totalMin} min</span>
              <button type="button" class="icon-btn" data-delete="${esc(s.id)}" aria-label="Delete session of ${esc(formatDate(s.date))}">${ICONS.trash}</button>
            </div>
            <ul class="hist-ex">
              ${s.exercises.map((e) => `<li>${esc(e.title)} <span class="muted">${e.durationMin} min</span></li>`).join('')}
            </ul>
          </li>`).join('')}
      </ul>
    </section>`).join('');

  el.querySelectorAll('[data-delete]').forEach((b) => {
    b.onclick = async () => {
      const s = sessions.find((x) => x.id === b.dataset.delete);
      const ok = await confirmDialog({
        title: 'Delete this session?',
        message: `The session of ${formatDate(s.date)} will be removed. Its exercises count as unused again.`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
      await storage.deleteSession(s.id);
      toast('Session deleted.');
      renderHistory(el);
    };
  });
}
