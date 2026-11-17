// ui.js — small shared UI helpers (no data access here).

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const POSITION_LABELS = {
  seated: 'Seated',
  standing: 'Standing',
  either: 'Seated or standing',
};

export function positionLabel(p) {
  return POSITION_LABELS[p] || POSITION_LABELS.either;
}

/** "2026-11-17" -> "Tue 17 Nov 2026" */
export function formatDate(iso, { weekday = true, year = true } = {}) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', {
    weekday: weekday ? 'short' : undefined,
    day: 'numeric',
    month: 'short',
    year: year ? 'numeric' : undefined,
  });
}

/** "2026-11-17" -> "17 Nov" */
export function formatShortDate(iso) {
  return formatDate(iso, { weekday: false, year: false });
}

export function formatMonth(isoMonth) {
  const d = new Date(isoMonth + '-01T00:00:00');
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

let toastTimer = null;
export function toast(message, { action, onAction, duration = 3500 } = {}) {
  const el = document.getElementById('toast');
  el.innerHTML = `<span>${esc(message)}</span>${action ? `<button type="button" class="toast-action">${esc(action)}</button>` : ''}`;
  el.hidden = false;
  el.classList.add('show');
  if (action) {
    el.querySelector('.toast-action').onclick = () => { hide(); onAction && onAction(); };
  }
  clearTimeout(toastTimer);
  function hide() {
    el.classList.remove('show');
    el.hidden = true;
  }
  if (duration) toastTimer = setTimeout(hide, duration);
}

/**
 * Promise-based confirm dialog. Resolves true when confirmed.
 * `danger: true` styles the confirm button as destructive.
 */
export function confirmDialog({ title, message, confirmLabel = 'OK', cancelLabel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const dlg = document.getElementById('dialog');
    dlg.innerHTML = `
      <form method="dialog" class="dialog-body">
        <h2>${esc(title)}</h2>
        ${message ? `<p>${esc(message)}</p>` : ''}
        <div class="dialog-actions">
          <button value="cancel" class="btn btn-secondary">${esc(cancelLabel)}</button>
          <button value="ok" class="btn ${danger ? 'btn-danger' : 'btn-primary'}">${esc(confirmLabel)}</button>
        </div>
      </form>`;
    dlg.onclose = () => resolve(dlg.returnValue === 'ok');
    dlg.returnValue = '';
    dlg.showModal();
  });
}

/**
 * Generic picker dialog for choosing one exercise.
 * items: [{ exercise, usedThisMonth, lastUsed }]
 * Resolves with the chosen exercise or null.
 */
export function pickExerciseDialog({ title, items, currentTotal = 0, targetMin = null }) {
  return new Promise((resolve) => {
    const dlg = document.getElementById('dialog');
    dlg.innerHTML = `
      <div class="dialog-body picker">
        <h2>${esc(title)}</h2>
        <input type="search" class="input" placeholder="Search" aria-label="Search exercises">
        <ul class="picker-list"></ul>
        <div class="dialog-actions">
          <button type="button" class="btn btn-secondary" data-cancel>Cancel</button>
        </div>
      </div>`;
    const list = dlg.querySelector('.picker-list');
    const search = dlg.querySelector('input');
    let chosen = null;

    function render() {
      const q = search.value.trim().toLowerCase();
      const filtered = items.filter((i) => !q || i.exercise.title.toLowerCase().includes(q));
      list.innerHTML = filtered.length
        ? filtered.map((i, idx) => {
          const newTotal = currentTotal + i.exercise.durationMin;
          return `
            <li><button type="button" class="picker-item" data-idx="${items.indexOf(i)}">
              <span class="picker-title">${esc(i.exercise.title)}</span>
              <span class="picker-meta">
                ${i.exercise.durationMin} min · ${esc(positionLabel(i.exercise.position))}
                ${i.usedThisMonth ? `<span class="badge badge-used">Used ${esc(formatShortDate(i.lastUsed))}</span>` : ''}
                ${targetMin != null ? `<span class="picker-total">→ total ${newTotal} min</span>` : ''}
              </span>
            </button></li>`;
        }).join('')
        : '<li class="empty">No exercises found.</li>';
    }

    list.addEventListener('click', (ev) => {
      const btn = ev.target.closest('.picker-item');
      if (!btn) return;
      chosen = items[Number(btn.dataset.idx)].exercise;
      dlg.close();
    });
    search.addEventListener('input', render);
    dlg.querySelector('[data-cancel]').onclick = () => dlg.close();
    dlg.onclose = () => resolve(chosen);
    render();
    dlg.showModal();
  });
}

/** Turn plain text into safe HTML paragraphs with line breaks. */
export function textToHtml(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  return t
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}
