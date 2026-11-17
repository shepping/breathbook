// storage.js — the ONLY module that touches persisted data.
//
// Every function returns a Promise, so this local IndexedDB implementation can
// later be replaced by a cloud backend (e.g. Supabase) with the same interface,
// without changing any UI code.
//
// Interface:
//   getExercises(), getExercise(id), saveExercise(ex), deleteExercise(id)
//   getSessions(), logSession(session), deleteSession(id)
//   getSettings(), saveSettings(partial)
//   exportAll(), importAll(data), clearDemoData(), seedIfEmpty(exercises)

const DB_NAME = 'breathbook';
const DB_VERSION = 1;
export const SCHEMA_VERSION = 1;

const STORES = {
  exercises: 'exercises',
  sessions: 'sessions',
  settings: 'settings',
};

const DEFAULT_SETTINGS = {
  toleranceMin: 2,
  maxExercises: 6,
  demoSeeded: false,
};

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.exercises)) {
        db.createObjectStore(STORES.exercises, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.sessions)) {
        db.createObjectStore(STORES.sessions, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.settings)) {
        db.createObjectStore(STORES.settings, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

// Run a function inside a transaction and resolve when the transaction completes.
async function tx(storeNames, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeNames, mode);
    let result;
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
    const stores = Array.isArray(storeNames)
      ? Object.fromEntries(storeNames.map((n) => [n, t.objectStore(n)]))
      : t.objectStore(storeNames);
    Promise.resolve(fn(stores)).then((r) => { result = r; }, reject);
  });
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
}

/** Ask the browser not to evict our data (granted more easily for installed PWAs). */
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      return await navigator.storage.persist();
    }
  } catch (_) { /* ignore */ }
  return false;
}

// ---------- Exercises ----------

export async function getExercises() {
  const list = await tx(STORES.exercises, 'readonly', (s) => reqToPromise(s.getAll()));
  return list.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
}

export async function getExercise(id) {
  return tx(STORES.exercises, 'readonly', (s) => reqToPromise(s.get(id)));
}

/** Insert or update. Returns the saved exercise. */
export async function saveExercise(input) {
  const now = new Date().toISOString();
  const existing = input.id ? await getExercise(input.id) : null;
  const exercise = {
    id: input.id || uuid(),
    title: String(input.title || '').trim(),
    description: String(input.description || ''),
    durationMin: Math.max(1, Math.round(Number(input.durationMin) || 1)),
    position: ['seated', 'standing', 'either'].includes(input.position) ? input.position : 'either',
    notes: String(input.notes || ''),
    isDemo: Boolean(existing ? existing.isDemo : input.isDemo),
    createdAt: existing ? existing.createdAt : (input.createdAt || now),
    updatedAt: now,
  };
  if (!exercise.title) throw new Error('Title is required');
  await tx(STORES.exercises, 'readwrite', (s) => reqToPromise(s.put(exercise)));
  return exercise;
}

export async function deleteExercise(id) {
  await tx(STORES.exercises, 'readwrite', (s) => reqToPromise(s.delete(id)));
}

// ---------- Sessions ----------

/** Newest first. */
export async function getSessions() {
  const list = await tx(STORES.sessions, 'readonly', (s) => reqToPromise(s.getAll()));
  return list.sort((a, b) =>
    b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
}

/**
 * Save a session. `session.exercises` is a snapshot: [{ id, title, durationMin }],
 * so history stays readable even if an exercise is later edited or deleted.
 */
export async function logSession(input) {
  const exercises = (input.exercises || []).map((e) => ({
    id: e.id,
    title: e.title,
    durationMin: e.durationMin,
  }));
  const session = {
    id: input.id || uuid(),
    date: input.date,
    targetMin: input.targetMin ?? null,
    exercises,
    totalMin: exercises.reduce((sum, e) => sum + e.durationMin, 0),
    createdAt: input.createdAt || new Date().toISOString(),
  };
  await tx(STORES.sessions, 'readwrite', (s) => reqToPromise(s.put(session)));
  return session;
}

export async function deleteSession(id) {
  await tx(STORES.sessions, 'readwrite', (s) => reqToPromise(s.delete(id)));
}

// ---------- Settings ----------

export async function getSettings() {
  const rows = await tx(STORES.settings, 'readonly', (s) => reqToPromise(s.getAll()));
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(partial) {
  await tx(STORES.settings, 'readwrite', (s) =>
    Promise.all(Object.entries(partial).map(([key, value]) => reqToPromise(s.put({ key, value })))));
}

// ---------- Backup ----------

export async function exportAll() {
  const [exercises, sessions, settings] = await Promise.all([getExercises(), getSessions(), getSettings()]);
  return {
    app: 'breathbook',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    exercises,
    sessions,
    settings,
  };
}

/** Validate a backup object. Throws with a readable message when invalid. */
export function validateBackup(data) {
  if (!data || typeof data !== 'object') throw new Error('This file is not a Breathbook backup.');
  if (data.app !== 'breathbook') throw new Error('This file is not a Breathbook backup.');
  if (!Array.isArray(data.exercises) || !Array.isArray(data.sessions)) {
    throw new Error('The backup is incomplete (exercises or sessions missing).');
  }
  if ((data.schemaVersion || 1) > SCHEMA_VERSION) {
    throw new Error('This backup was made with a newer version of Breathbook. Update the app first.');
  }
  for (const e of data.exercises) {
    if (!e.id || !e.title || !Number.isFinite(Number(e.durationMin))) {
      throw new Error('The backup contains an invalid exercise.');
    }
  }
  for (const s of data.sessions) {
    if (!s.id || !s.date || !Array.isArray(s.exercises)) {
      throw new Error('The backup contains an invalid session.');
    }
  }
  return true;
}

/** Replace ALL data with the backup contents. */
export async function importAll(data) {
  validateBackup(data);
  // All requests are queued synchronously; IndexedDB runs them in order
  // within one transaction, so either everything is replaced or nothing is.
  await tx([STORES.exercises, STORES.sessions, STORES.settings], 'readwrite', (s) => {
    const writes = [
      reqToPromise(s.exercises.clear()),
      reqToPromise(s.sessions.clear()),
      reqToPromise(s.settings.clear()),
    ];
    for (const e of data.exercises) writes.push(reqToPromise(s.exercises.put(e)));
    for (const ses of data.sessions) writes.push(reqToPromise(s.sessions.put(ses)));
    const settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}), demoSeeded: true };
    for (const [key, value] of Object.entries(settings)) {
      writes.push(reqToPromise(s.settings.put({ key, value })));
    }
    return Promise.all(writes);
  });
}

// ---------- Demo data ----------

/** Seed demo exercises once, only when the library is completely empty. */
export async function seedIfEmpty(demoExercises) {
  const settings = await getSettings();
  if (settings.demoSeeded) return false;
  const existing = await getExercises();
  if (existing.length === 0) {
    for (const e of demoExercises) await saveExercise({ ...e, isDemo: true });
  }
  await saveSettings({ demoSeeded: true });
  return existing.length === 0;
}

/** Remove demo exercises and sessions that consist only of demo exercises. */
export async function clearDemoData() {
  const exercises = await getExercises();
  const demoIds = new Set(exercises.filter((e) => e.isDemo).map((e) => e.id));
  const sessions = await getSessions();
  const demoSessions = sessions.filter(
    (s) => s.exercises.length > 0 && s.exercises.every((e) => demoIds.has(e.id)));
  await tx([STORES.exercises, STORES.sessions], 'readwrite', (s) =>
    Promise.all([
      ...[...demoIds].map((id) => reqToPromise(s.exercises.delete(id))),
      ...demoSessions.map((ses) => reqToPromise(s.sessions.delete(ses.id))),
    ]));
  return { exercises: demoIds.size, sessions: demoSessions.length };
}

export async function countDemo() {
  const exercises = await getExercises();
  return exercises.filter((e) => e.isDemo).length;
}
