// exercises.js — library list (with search) and exercise detail view.

import * as storage from '../storage.js';
import { buildUsage } from '../suggest.js';
import { esc, positionLabel, formatShortDate, formatDate, confirmDialog, toast, textToHtml } from '../ui.js';
import { ICONS } from './icons.js';

let lastQuery = '';

export async function renderExerciseList(el) {
  const [exercises, sessions] = await Promise.all([storage.getExercises(), storage.getSessions()]);
  const usage = buildUsage(sessions);

  el.innerHTML = `
    <div class="search-wrap">
      ${ICONS.search}
      <input type="search" class="input search" placeholder="Search exercises" aria-label="Search exercises" value="${esc(lastQuery)}">
    </div>
    <p class="muted small count-line"></p>
    <ul class="ex-list"></ul>
    <a href="#/exercise/new" class="fab" aria-label="Add exercise">${ICONS.plus}</a>`;

  const list = el.querySelector('.ex-list');
  const countLine = el.querySelector('.count-line');
  const search = el.querySelector('.search');

  function render() {
    const q = search.value.trim().toLowerCase();
    lastQuery = search.value;
    const filtered = exercises.filter((e) =>
      !q
      || e.title.toLowerCase().includes(q)
      || e.description.toLowerCase().includes(q)
      || e.notes.toLowerCase().includes(q));

    countLine.textContent = q
      ? `${filtered.length} of ${exercises.length} exercises`
      : `${exercises.length} exercise${exercises.length === 1 ? '' : 's'}`;

    if (!exercises.length) {
      list.innerHTML = `<li class="empty">No exercises yet.<br>Tap <strong>+</strong> to add your first one.</li>`;
      return;
    }
    list.innerHTML = filtered.map((e) => {
      const u = usage.get(e.id);
      return `
        <li><a class="ex-item" href="#/exercise/${encodeURIComponent(e.id)}">
          <span class="ex-title">${esc(e.title)}${e.isDemo ? ' <span class="badge badge-demo">Demo</span>' : ''}</span>
          <span class="ex-meta">
            <span class="ex-dur">${e.durationMin} min</span> · ${esc(positionLabel(e.position))}
            ${u ? `<span class="ex-last ${u.usedThisMonth ? 'used' : ''}">Last used ${esc(formatShortDate(u.lastUsed))}</span>` : ''}
          </span>
        </a></li>`;
    }).join('') || '<li class="empty">No matches.</li>';
  }

  search.addEventListener('input', render);
  render();
}

export async function renderExerciseDetail(el, id) {
  const [exercise, sessions] = await Promise.all([storage.getExercise(id), storage.getSessions()]);
  if (!exercise) {
    el.innerHTML = '<div class="card"><p>This exercise no longer exists.</p><a class="btn btn-secondary" href="#/exercises">Back to exercises</a></div>';
    return;
  }
  const usage = buildUsage(sessions).get(id);
  const timesUsed = sessions.filter((s) => s.exercises.some((e) => e.id === id)).length;

  el.innerHTML = `
    <article class="detail">
      <h2 class="detail-title">${esc(exercise.title)}${exercise.isDemo ? ' <span class="badge badge-demo">Demo</span>' : ''}</h2>
      <p class="detail-meta">
        <span class="pill">${exercise.durationMin} min</span>
        <span class="pill">${esc(positionLabel(exercise.position))}</span>
      </p>
      <section class="detail-body">
        ${textToHtml(exercise.description) || '<p class="muted">No instructions yet. Tap Edit to write them out.</p>'}
      </section>
      ${exercise.notes.trim() ? `<section class="notes"><strong>Notes</strong>${textToHtml(exercise.notes)}</section>` : ''}
      <p class="muted small">
        ${usage ? `Used ${timesUsed}× · last on ${esc(formatDate(usage.lastUsed))}` : 'Not used in a session yet'}
      </p>
      <div class="row">
        <a class="btn btn-primary" href="#/exercise/${encodeURIComponent(id)}/edit">${ICONS.edit}<span>Edit</span></a>
        <button type="button" class="btn btn-danger-outline" data-act="delete">${ICONS.trash}<span>Delete</span></button>
      </div>
    </article>`;

  el.querySelector('[data-act="delete"]').onclick = async () => {
    const ok = await confirmDialog({
      title: 'Delete exercise?',
      message: `“${exercise.title}” will be removed from your library. Past sessions keep its name.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await storage.deleteExercise(id);
    toast('Exercise deleted.');
    location.replace('#/exercises');
  };
}
