// plan.js — compose a session (suggest / reroll / swap / pick) and show the
// upcoming class in a large, glanceable layout.

import * as storage from '../storage.js';
import {
  suggestSession, swapExercise, setExercise, removeExercise, buildUsage, describeItems, toISODate,
} from '../suggest.js';
import {
  esc, positionLabel, formatDate, formatShortDate, toast, confirmDialog, pickExerciseDialog, textToHtml,
} from '../ui.js';
import { ICONS } from './icons.js';

// In-memory state survives switching tabs (not closing the app).
const state = {
  targetMin: 25,
  count: null,        // null = any number
  suggestion: null,
  planning: false,    // true = show planner even if a class is already logged
  date: null,         // date for "Use this session"
};

let wakeLock = null;
let wakeWanted = false;

export async function renderPlan(el) {
  const [exercises, sessions, settings] = await Promise.all([
    storage.getExercises(), storage.getSessions(), storage.getSettings(),
  ]);
  const todayIso = toISODate(new Date());
  const ctx = { el, exercises, sessions, settings, todayIso };

  // The next class = earliest logged session dated today or later.
  const upcoming = sessions
    .filter((s) => s.date >= todayIso)
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  if (upcoming && !state.planning) {
    renderClass(ctx, upcoming);
  } else {
    renderPlanner(ctx, upcoming);
  }
}

// ---------- Class view (glanceable) ----------

function renderClass(ctx, session) {
  const { el, exercises, todayIso } = ctx;
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const heading = session.date === todayIso ? "Today's class" : `Next class · ${formatDate(session.date)}`;

  el.innerHTML = `
    <section class="class-view">
      <div class="class-head">
        <p class="eyebrow">${esc(heading)}</p>
        <p class="class-total">${session.totalMin} <span>min</span></p>
      </div>
      <ol class="class-list">
        ${session.exercises.map((snap, i) => {
          const ex = byId.get(snap.id);
          const desc = ex ? textToHtml(ex.description) : '';
          const notes = ex ? textToHtml(ex.notes) : '';
          return `
          <li class="class-item">
            <details>
              <summary>
                <span class="class-num">${i + 1}</span>
                <span class="class-title">${esc(ex ? ex.title : snap.title)}</span>
                <span class="class-meta">${snap.durationMin} min${ex ? ' · ' + esc(positionLabel(ex.position)) : ''}</span>
              </summary>
              <div class="class-desc">
                ${desc || '<p class="muted">No instructions written yet.</p>'}
                ${notes ? `<div class="notes"><strong>Notes</strong>${notes}</div>` : ''}
              </div>
            </details>
          </li>`;
        }).join('')}
      </ol>
      <p class="hint">Tap an exercise to show the instructions.</p>
      <div class="stack">
        ${'wakeLock' in navigator ? `<button type="button" class="btn btn-secondary" data-act="wake">${ICONS.sun}<span>${wakeLock ? 'Screen stays on' : 'Keep screen on'}</span></button>` : ''}
        <button type="button" class="btn btn-secondary" data-act="new">Plan another session</button>
      </div>
    </section>`;

  el.querySelector('[data-act="new"]').onclick = () => {
    state.planning = true;
    renderPlan(el);
  };
  const wakeBtn = el.querySelector('[data-act="wake"]');
  if (wakeBtn) {
    wakeBtn.classList.toggle('on', Boolean(wakeLock));
    wakeBtn.onclick = async () => {
      await toggleWakeLock();
      renderPlan(el);
    };
  }
}

async function toggleWakeLock() {
  try {
    if (wakeLock) {
      wakeWanted = false;
      await wakeLock.release();
      wakeLock = null;
    } else {
      wakeWanted = true;
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
      toast('The screen will stay on while the app is open.');
    }
  } catch (err) {
    toast('Could not keep the screen on.');
  }
}

// Browsers release the wake lock when the app goes to the background.
// Re-acquire it on return if she had turned it on.
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && wakeWanted && wakeLock === null) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch (_) { /* ignore */ }
  }
});

// ---------- Planner ----------

function renderPlanner(ctx, upcoming) {
  const { el, exercises, sessions, settings, todayIso } = ctx;
  const tol = settings.toleranceMin;

  // Keep the suggestion in sync with library edits (renamed/deleted exercises).
  if (state.suggestion) state.suggestion = refreshSuggestion(state.suggestion, exercises, sessions, tol);
  if (!state.date || state.date < todayIso) state.date = todayIso;

  const s = state.suggestion;
  const countOptions = [null, 1, 2, 3, 4, 5];

  el.innerHTML = `
    ${upcoming ? `<button type="button" class="link-btn" data-act="show-class">← Back to ${upcoming.date === todayIso ? "today's class" : 'next class'}</button>` : ''}
    <section class="card">
      <label class="field-label" id="target-label">Duration</label>
      <div class="stepper" role="group" aria-labelledby="target-label">
        <button type="button" class="icon-btn round" data-act="minus" aria-label="Less time">${ICONS.minus}</button>
        <output class="stepper-value"><strong>${state.targetMin}</strong> min</output>
        <button type="button" class="icon-btn round" data-act="plus" aria-label="More time">${ICONS.plus}</button>
      </div>
      <div class="chips" role="group" aria-label="Quick durations">
        ${[15, 20, 25, 30].map((m) => `<button type="button" class="chip ${m === state.targetMin ? 'selected' : ''}" data-target="${m}">${m}</button>`).join('')}
      </div>

      <label class="field-label" id="count-label">Number of exercises</label>
      <div class="chips" role="group" aria-labelledby="count-label">
        ${countOptions.map((c) => `<button type="button" class="chip ${c === state.count ? 'selected' : ''}" data-count="${c ?? ''}">${c ?? 'Any'}</button>`).join('')}
      </div>

      <button type="button" class="btn btn-primary btn-block" data-act="suggest">
        ${s ? `${ICONS.reroll}<span>New suggestion</span>` : 'Suggest a session'}
      </button>
    </section>

    ${s ? renderSuggestion(s, tol) : `
      <p class="hint center">${exercises.length} exercises in your library.<br>Exercises used this month are skipped where possible.</p>`}
  `;

  // --- events ---
  const rerender = () => renderPlan(el);
  const suggest = () => {
    state.suggestion = suggestSession({
      exercises, sessions,
      targetMin: state.targetMin,
      count: state.count,
      toleranceMin: tol,
      maxExercises: settings.maxExercises,
    });
    rerender();
  };

  el.querySelector('[data-act="show-class"]')?.addEventListener('click', () => {
    state.planning = false;
    rerender();
  });
  el.querySelector('[data-act="minus"]').onclick = () => { state.targetMin = Math.max(1, state.targetMin - 1); rerender(); };
  el.querySelector('[data-act="plus"]').onclick = () => { state.targetMin = Math.min(120, state.targetMin + 1); rerender(); };
  el.querySelectorAll('[data-target]').forEach((b) => {
    b.onclick = () => { state.targetMin = Number(b.dataset.target); rerender(); };
  });
  el.querySelectorAll('[data-count]').forEach((b) => {
    b.onclick = () => { state.count = b.dataset.count ? Number(b.dataset.count) : null; rerender(); };
  });
  el.querySelector('[data-act="suggest"]').onclick = suggest;

  if (!s) return;

  el.querySelectorAll('[data-swap]').forEach((b) => {
    b.onclick = () => {
      state.suggestion = swapExercise({
        suggestion: state.suggestion, index: Number(b.dataset.swap), exercises, sessions, toleranceMin: tol,
      });
      rerender();
    };
  });

  el.querySelectorAll('[data-pick]').forEach((b) => {
    b.onclick = async () => {
      const index = Number(b.dataset.pick);
      const chosen = await pickFor(index, exercises, sessions);
      if (!chosen) return;
      state.suggestion = setExercise({ suggestion: state.suggestion, index, exercise: chosen, sessions, toleranceMin: tol });
      rerender();
    };
  });

  el.querySelectorAll('[data-remove]').forEach((b) => {
    b.onclick = () => {
      state.suggestion = removeExercise({ suggestion: state.suggestion, index: Number(b.dataset.remove), toleranceMin: tol });
      rerender();
    };
  });

  el.querySelector('[data-act="add"]').onclick = async () => {
    const chosen = await pickFor(-1, exercises, sessions);
    if (!chosen) return;
    state.suggestion = setExercise({ suggestion: state.suggestion, index: -1, exercise: chosen, sessions, toleranceMin: tol });
    rerender();
  };

  el.querySelector('[data-act="clear"]').onclick = () => {
    state.suggestion = null;
    rerender();
  };

  const dateInput = el.querySelector('#session-date');
  dateInput.onchange = () => { state.date = dateInput.value || todayIso; };

  el.querySelector('[data-act="use"]').onclick = async () => {
    const cur = state.suggestion;
    if (!cur.items.length) {
      toast('Add at least one exercise first.');
      return;
    }
    const date = dateInput.value || todayIso;
    const sameDay = sessions.find((x) => x.date === date);
    if (sameDay) {
      const ok = await confirmDialog({
        title: 'Already a session on this day',
        message: `There is already a session logged for ${formatDate(date)}. Save this one as well?`,
        confirmLabel: 'Save anyway',
      });
      if (!ok) return;
    }
    await storage.logSession({
      date,
      targetMin: cur.targetMin,
      exercises: cur.items.map((i) => i.exercise),
    });
    state.suggestion = null;
    state.planning = false;
    state.date = null;
    toast('Session saved.');
    rerender();
  };
}

function renderSuggestion(s, tol) {
  const diffLabel = s.diff === 0 ? 'exactly on time'
    : s.diff > 0 ? `${s.diff} min over` : `${-s.diff} min under`;
  return `
    <section class="card suggestion">
      <div class="suggestion-head">
        <p class="suggestion-total"><strong>${s.totalMin}</strong> min</p>
        <p class="pill ${s.withinTolerance ? 'pill-ok' : 'pill-warn'}">
          ${s.withinTolerance ? 'Fits' : 'Does not fit'} · ${diffLabel}
        </p>
      </div>
      <p class="muted small">Target ${s.targetMin} ± ${tol} min</p>
      ${s.message ? `<p class="notice">${esc(s.message)}</p>` : ''}

      <ul class="sugg-list">
        ${s.items.map((item, i) => `
          <li class="sugg-item ${item.usedThisMonth ? 'is-used' : ''}">
            <div class="sugg-text">
              <span class="sugg-title">${esc(item.exercise.title)}</span>
              <span class="sugg-meta">
                ${item.exercise.durationMin} min · ${esc(positionLabel(item.exercise.position))}
                ${item.exercise.isDemo ? '<span class="badge badge-demo">Demo</span>' : ''}
                ${item.usedThisMonth ? `<span class="badge badge-used">Used ${esc(formatShortDate(item.lastUsed))}</span>` : ''}
              </span>
            </div>
            <div class="sugg-actions">
              <button type="button" class="icon-btn" data-swap="${i}" aria-label="Swap ${esc(item.exercise.title)} for another">${ICONS.swap}</button>
              <button type="button" class="icon-btn" data-pick="${i}" aria-label="Choose a replacement for ${esc(item.exercise.title)}">${ICONS.list}</button>
              <button type="button" class="icon-btn" data-remove="${i}" aria-label="Remove ${esc(item.exercise.title)}">${ICONS.close}</button>
            </div>
          </li>`).join('') || '<li class="empty">No exercises. Add one or ask for a new suggestion.</li>'}
      </ul>

      <div class="row">
        <button type="button" class="btn btn-secondary" data-act="add">${ICONS.plus}<span>Add exercise</span></button>
        <button type="button" class="btn btn-ghost" data-act="clear">Clear</button>
      </div>

      <div class="use-row">
        <label class="field-label" for="session-date">Class date</label>
        <input type="date" id="session-date" class="input" value="${esc(state.date)}">
        <button type="button" class="btn btn-primary btn-block" data-act="use">Use this session</button>
      </div>
    </section>
    <p class="hint center">${ICONS.swap} swap automatically &nbsp;·&nbsp; ${ICONS.list} choose yourself</p>`;
}

async function pickFor(index, exercises, sessions) {
  const s = state.suggestion;
  const inSet = new Set(s.items.map((i) => i.exercise.id));
  const current = index >= 0 ? s.items[index].exercise : null;
  const usage = buildUsage(sessions);
  const candidates = exercises.filter((e) => !inSet.has(e.id));
  // Fresh exercises first, then by title.
  const items = describeItems(candidates, usage)
    .sort((a, b) => (a.usedThisMonth - b.usedThisMonth) || a.exercise.title.localeCompare(b.exercise.title));
  const restTotal = s.totalMin - (current ? current.durationMin : 0);
  return pickExerciseDialog({
    title: current ? `Replace “${current.title}”` : 'Add an exercise',
    items,
    currentTotal: restTotal,
    targetMin: s.targetMin,
  });
}

/** Re-read exercise data so edits/deletes in the library are reflected. */
function refreshSuggestion(s, exercises, sessions, tol) {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const usage = buildUsage(sessions);
  const items = s.items
    .filter((i) => byId.has(i.exercise.id))
    .map((i) => ({ exercise: byId.get(i.exercise.id), ...(usage.get(i.exercise.id) || { lastUsed: null, usedThisMonth: false }) }));
  const totalMin = items.reduce((t, i) => t + i.exercise.durationMin, 0);
  const diff = totalMin - s.targetMin;
  return {
    ...s,
    items,
    totalMin,
    diff,
    withinTolerance: Math.abs(diff) <= tol,
    usedRepeats: items.some((i) => i.usedThisMonth),
  };
}
