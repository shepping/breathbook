// more.js — backup, demo data, settings and app info.

import * as storage from '../storage.js';
import { downloadBackup, readBackupFile } from '../backup.js';
import { esc, formatDate, toast, confirmDialog } from '../ui.js';
import { APP_VERSION } from '../config.js';
import { ICONS } from './icons.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export async function renderMore(el) {
  const [settings, demoCount, exercises, sessions] = await Promise.all([
    storage.getSettings(), storage.countDemo(), storage.getExercises(), storage.getSessions(),
  ]);
  let persisted = null;
  try { persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null; } catch (_) { /* ignore */ }

  el.innerHTML = `
    <section class="card">
      <h2>Backup</h2>
      <p class="muted">Your data lives only on this phone. Make a backup now and then, and keep the file somewhere safe (e.g. Google Drive).</p>
      <p class="small">${plural(exercises.length, 'exercise')} · ${plural(sessions.length, 'session')}</p>
      <div class="stack">
        <button type="button" class="btn btn-primary" data-act="export">Export backup</button>
        <label class="btn btn-secondary file-btn">
          Import backup
          <input type="file" accept="application/json,.json" data-act="import" hidden>
        </label>
      </div>
    </section>

    <section class="card">
      <h2>Suggestions</h2>
      <div class="setting">
        <span id="tol-label">Allowed difference</span>
        <div class="stepper small-stepper" role="group" aria-labelledby="tol-label">
          <button type="button" class="icon-btn round" data-tol="-1" aria-label="Less">${ICONS.minus}</button>
          <output><strong>± ${settings.toleranceMin}</strong> min</output>
          <button type="button" class="icon-btn round" data-tol="1" aria-label="More">${ICONS.plus}</button>
        </div>
      </div>
      <div class="setting">
        <span id="max-label">Max exercises (when “Any”)</span>
        <div class="stepper small-stepper" role="group" aria-labelledby="max-label">
          <button type="button" class="icon-btn round" data-max="-1" aria-label="Fewer">${ICONS.minus}</button>
          <output><strong>${settings.maxExercises}</strong></output>
          <button type="button" class="icon-btn round" data-max="1" aria-label="More">${ICONS.plus}</button>
        </div>
      </div>
    </section>

    <section class="card">
      <h2>Demo data</h2>
      ${demoCount
        ? `<p class="muted">${demoCount} demo exercise${demoCount === 1 ? '' : 's'} (marked <span class="badge badge-demo">Demo</span>) are in your library for testing.</p>
           <button type="button" class="btn btn-danger-outline" data-act="demo">Remove demo data</button>`
        : '<p class="muted">No demo exercises left.</p>'}
    </section>

    <section class="card about">
      <h2>About</h2>
      <p class="muted small">Breathbook ${esc(APP_VERSION)}<br>
      Storage: ${persisted === true ? 'kept safely on this device' : persisted === false ? 'may be cleared by the browser if space runs low — install the app and make backups' : 'on this device'}</p>
    </section>`;

  el.querySelector('[data-act="export"]').onclick = async () => {
    try {
      const r = await downloadBackup();
      toast(`Saved ${r.filename}`);
    } catch (err) {
      toast('Export failed: ' + err.message);
    }
  };

  el.querySelector('[data-act="import"]').onchange = async (ev) => {
    const file = ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    let data;
    try {
      data = await readBackupFile(file);
    } catch (err) {
      await confirmDialog({ title: 'Cannot import', message: err.message, confirmLabel: 'OK', cancelLabel: 'Close' });
      return;
    }
    const ok = await confirmDialog({
      title: 'Replace all data?',
      message: `This backup${data.exportedAt ? ` from ${formatDate(data.exportedAt.slice(0, 10))}` : ''} contains ${data.exercises.length} exercises and ${data.sessions.length} sessions. Everything currently in the app (${exercises.length} exercises, ${sessions.length} sessions) will be overwritten. This cannot be undone.`,
      confirmLabel: 'Replace',
      danger: true,
    });
    if (!ok) return;
    try {
      await storage.importAll(data);
      toast('Backup imported.');
      renderMore(el);
    } catch (err) {
      toast('Import failed: ' + err.message);
    }
  };

  el.querySelectorAll('[data-tol]').forEach((b) => {
    b.onclick = async () => {
      const v = Math.min(10, Math.max(0, settings.toleranceMin + Number(b.dataset.tol)));
      await storage.saveSettings({ toleranceMin: v });
      renderMore(el);
    };
  });
  el.querySelectorAll('[data-max]').forEach((b) => {
    b.onclick = async () => {
      const v = Math.min(10, Math.max(1, settings.maxExercises + Number(b.dataset.max)));
      await storage.saveSettings({ maxExercises: v });
      renderMore(el);
    };
  });

  el.querySelector('[data-act="demo"]')?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Remove demo data?',
      message: 'All exercises marked Demo are deleted, plus sessions that contain only demo exercises. Your own exercises are not touched.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    const r = await storage.clearDemoData();
    toast(`Removed ${plural(r.exercises, 'exercise')} and ${plural(r.sessions, 'session')}.`);
    renderMore(el);
  });
}
