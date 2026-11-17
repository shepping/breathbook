// exercise-form.js — add or edit an exercise.

import * as storage from '../storage.js';
import { esc, toast, POSITION_LABELS } from '../ui.js';
import { ICONS } from './icons.js';

export async function renderExerciseForm(el, id) {
  const existing = id ? await storage.getExercise(id) : null;
  if (id && !existing) {
    el.innerHTML = '<div class="card"><p>This exercise no longer exists.</p></div>';
    return;
  }
  const ex = existing || { title: '', description: '', durationMin: 5, position: 'either', notes: '' };

  el.innerHTML = `
    <form class="form" novalidate>
      <label class="field">
        <span class="field-label">Title <span class="req">required</span></span>
        <input name="title" class="input" required maxlength="120" value="${esc(ex.title)}" autocomplete="off">
        <span class="field-error" data-error="title"></span>
      </label>

      <div class="field">
        <span class="field-label" id="dur-label">Duration (minutes) <span class="req">required</span></span>
        <div class="stepper" role="group" aria-labelledby="dur-label">
          <button type="button" class="icon-btn round" data-step="-1" aria-label="One minute less">${ICONS.minus}</button>
          <input name="durationMin" class="input stepper-input" type="number" inputmode="numeric" min="1" max="120" value="${ex.durationMin}" aria-labelledby="dur-label">
          <button type="button" class="icon-btn round" data-step="1" aria-label="One minute more">${ICONS.plus}</button>
        </div>
        <span class="field-error" data-error="durationMin"></span>
      </div>

      <fieldset class="field">
        <legend class="field-label">Position</legend>
        <div class="segmented">
          ${Object.entries(POSITION_LABELS).map(([value, label]) => `
            <label class="seg">
              <input type="radio" name="position" value="${value}" ${ex.position === value ? 'checked' : ''}>
              <span>${value === 'either' ? 'Either' : esc(label)}</span>
            </label>`).join('')}
        </div>
      </fieldset>

      <label class="field">
        <span class="field-label">Description / instructions</span>
        <textarea name="description" class="input" rows="8" placeholder="Steps, counts, cues…">${esc(ex.description)}</textarea>
      </label>

      <label class="field">
        <span class="field-label">Notes <span class="muted">(optional)</span></span>
        <textarea name="notes" class="input" rows="3" placeholder="Contra-indications, variations, music…">${esc(ex.notes)}</textarea>
      </label>

      <div class="row sticky-actions">
        <a class="btn btn-secondary" href="${existing ? `#/exercise/${encodeURIComponent(id)}` : '#/exercises'}">Cancel</a>
        <button type="submit" class="btn btn-primary">Save</button>
      </div>
    </form>`;

  const form = el.querySelector('form');
  const durInput = form.elements.durationMin;

  form.querySelectorAll('[data-step]').forEach((b) => {
    b.onclick = () => {
      const v = Math.round(Number(durInput.value) || 0) + Number(b.dataset.step);
      durInput.value = Math.min(120, Math.max(1, v));
    };
  });

  form.onsubmit = async (ev) => {
    ev.preventDefault();
    form.querySelectorAll('.field-error').forEach((e) => { e.textContent = ''; });
    const title = form.elements.title.value.trim();
    const duration = Number(durInput.value);
    let valid = true;
    if (!title) {
      form.querySelector('[data-error="title"]').textContent = 'Please enter a title.';
      valid = false;
    }
    if (!Number.isFinite(duration) || duration < 1 || duration > 120 || !Number.isInteger(duration)) {
      form.querySelector('[data-error="durationMin"]').textContent = 'Enter a whole number of minutes (1–120).';
      valid = false;
    }
    if (!valid) {
      form.querySelector('.field-error:not(:empty)')?.closest('.field')?.querySelector('input')?.focus();
      return;
    }
    const saved = await storage.saveExercise({
      id: existing?.id,
      title,
      durationMin: duration,
      position: form.elements.position.value,
      description: form.elements.description.value,
      notes: form.elements.notes.value,
    });
    toast(existing ? 'Changes saved.' : 'Exercise added.');
    // replace() so the phone's back button doesn't return to the form.
    location.replace(`#/exercise/${encodeURIComponent(saved.id)}`);
  };

  if (!existing) form.elements.title.focus();
}
