// backup.js — turn storage exports into a downloadable file and read files back.
// Data access itself stays in storage.js.

import * as storage from './storage.js';
import { toISODate } from './suggest.js';

/** Download all data as breathbook-backup-YYYY-MM-DD.json. */
export async function downloadBackup() {
  const data = await storage.exportAll();
  const json = JSON.stringify(data, null, 2);
  const filename = `breathbook-backup-${toISODate(new Date())}.json`;
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return { filename, exercises: data.exercises.length, sessions: data.sessions.length };
}

/** Read and validate a backup file. Returns the parsed data (does not import). */
export async function readBackupFile(file) {
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (_) {
    throw new Error('This file could not be read as JSON.');
  }
  storage.validateBackup(data);
  return data;
}
