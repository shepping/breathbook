// suggest.js — rule-based session suggestion.
//
// Pure functions only: no DOM, no storage. Everything comes in as arguments,
// so this module is easy to test (see tests/suggest.test.html), tweak or swap.
//
// Main entry points:
//   buildUsage(sessions, today)          -> Map(exerciseId -> { lastUsed, usedThisMonth })
//   suggestSession(options)              -> Suggestion
//   swapExercise(options)                -> Suggestion with one item replaced
//   describeItems(exercises, usage)      -> items with usage info (for manual picking)
//
// A Suggestion looks like:
//   {
//     items: [{ exercise, usedThisMonth, lastUsed }],
//     totalMin, targetMin, diff,           // diff = totalMin - targetMin
//     withinTolerance: boolean,
//     usedRepeats: boolean,                // true if any item was already used this month
//     message: string | null               // human-readable note for the UI
//   }

const NODE_LIMIT = 60000;   // safety cap on the search per tier
const SOLUTION_LIMIT = 400; // stop collecting after this many matching sets

// ---------- Helpers ----------

export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function monthKey(date) {
  return toISODate(date).slice(0, 7); // "YYYY-MM"
}

function daysBetween(isoA, isoB) {
  const a = new Date(isoA + 'T00:00:00');
  const b = new Date(isoB + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

function shuffle(list, random) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick(list, random) {
  return list[Math.floor(random() * list.length)];
}

function sum(list) {
  return list.reduce((s, e) => s + e.durationMin, 0);
}

// ---------- Usage ----------

/**
 * For each exercise id: the last date it was used (any time) and whether it
 * was used in the calendar month of `today`.
 */
export function buildUsage(sessions, today = new Date()) {
  const thisMonth = monthKey(today);
  const usage = new Map();
  for (const s of sessions) {
    for (const e of s.exercises) {
      const u = usage.get(e.id) || { lastUsed: null, usedThisMonth: false };
      if (!u.lastUsed || s.date > u.lastUsed) u.lastUsed = s.date;
      if (s.date.slice(0, 7) === thisMonth) u.usedThisMonth = true;
      usage.set(e.id, u);
    }
  }
  return usage;
}

function usageOf(usage, id) {
  return usage.get(id) || { lastUsed: null, usedThisMonth: false };
}

export function describeItems(exercises, usage) {
  return exercises.map((exercise) => ({ exercise, ...usageOf(usage, exercise.id) }));
}

/**
 * Penalty for repeating an exercise: 0 if fresh this month, otherwise higher
 * the more recently it was used. Lower is better.
 */
function repeatPenalty(exercise, usage, todayIso) {
  const u = usageOf(usage, exercise.id);
  if (!u.usedThisMonth) return 0;
  const daysAgo = Math.max(0, daysBetween(u.lastUsed, todayIso));
  return 1000 + Math.max(0, 40 - daysAgo); // every repeat costs 1000, recent ones a bit more
}

// ---------- Search ----------

/**
 * Enumerate sets of exercises whose total lies within [lo, hi].
 * `sizes` restricts the number of exercises (e.g. [2] or [1..6]).
 * The pool is shuffled first, so the first solutions found differ per call.
 */
function findSets(pool, { lo, hi, sizes, random }) {
  const maxSize = Math.max(...sizes);
  const sizeSet = new Set(sizes);
  const items = shuffle(pool, random);
  const solutions = [];
  let nodes = 0;
  const chosen = [];

  function dfs(start, total) {
    if (nodes++ > NODE_LIMIT || solutions.length >= SOLUTION_LIMIT) return;
    if (total >= lo && total <= hi && sizeSet.has(chosen.length)) {
      solutions.push(chosen.slice());
    }
    if (chosen.length >= maxSize) return;
    for (let i = start; i < items.length; i++) {
      const t = total + items[i].durationMin;
      if (t > hi) continue;
      chosen.push(items[i]);
      dfs(i + 1, t);
      chosen.pop();
      if (nodes > NODE_LIMIT || solutions.length >= SOLUTION_LIMIT) return;
    }
  }

  dfs(0, 0);
  return solutions;
}

/**
 * Find the set closest to the target (used when nothing fits the tolerance).
 * Ties are broken by the lowest repeat penalty.
 */
function findClosest(pool, { target, sizes, random, usage, todayIso }) {
  const maxSize = Math.max(...sizes);
  const sizeSet = new Set(sizes);
  const items = shuffle(pool, random);
  let best = null;
  let nodes = 0;
  const chosen = [];

  function consider(total) {
    const diff = Math.abs(total - target);
    const penalty = chosen.reduce((p, e) => p + repeatPenalty(e, usage, todayIso), 0);
    if (!best || diff < best.diff || (diff === best.diff && penalty < best.penalty)) {
      best = { set: chosen.slice(), diff, penalty };
    }
  }

  function dfs(start, total) {
    if (nodes++ > NODE_LIMIT) return;
    if (chosen.length > 0 && sizeSet.has(chosen.length)) consider(total);
    if (chosen.length >= maxSize) return;
    // Going further over the target only makes things worse.
    if (total > target) return;
    for (let i = start; i < items.length; i++) {
      chosen.push(items[i]);
      dfs(i + 1, total + items[i].durationMin);
      chosen.pop();
      if (nodes > NODE_LIMIT) return;
    }
  }

  dfs(0, 0);
  return best ? best.set : [];
}

/**
 * Pick one solution. First a set size is chosen at random among the sizes
 * that have solutions; otherwise larger sets (which have many more
 * combinations) would almost always win.
 */
function pickSolution(solutions, random) {
  const bySize = new Map();
  for (const s of solutions) {
    if (!bySize.has(s.length)) bySize.set(s.length, []);
    bySize.get(s.length).push(s);
  }
  const size = pick([...bySize.keys()], random);
  return pick(bySize.get(size), random);
}

/** Pick the solution with the lowest total repeat penalty (random among ties). */
function pickLeastRepeated(solutions, usage, todayIso, random) {
  let bestScore = Infinity;
  let best = [];
  for (const s of solutions) {
    const score = s.reduce((p, e) => p + repeatPenalty(e, usage, todayIso), 0);
    if (score < bestScore) { bestScore = score; best = [s]; }
    else if (score === bestScore) best.push(s);
  }
  return pick(best, random);
}

function toSuggestion(set, { targetMin, toleranceMin, usage, message }) {
  const items = set
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((exercise) => ({ exercise, ...usageOf(usage, exercise.id) }));
  return finalize(items, { targetMin, toleranceMin, message });
}

function finalize(items, { targetMin, toleranceMin, message = null }) {
  const totalMin = items.reduce((s, i) => s + i.exercise.durationMin, 0);
  const diff = totalMin - targetMin;
  return {
    items,
    totalMin,
    targetMin,
    diff,
    withinTolerance: Math.abs(diff) <= toleranceMin,
    usedRepeats: items.some((i) => i.usedThisMonth),
    message,
  };
}

// ---------- Public API ----------

/**
 * Suggest a set of exercises that fills `targetMin` as closely as possible.
 *
 * Order of preference:
 *   1. Only exercises not used this calendar month, within ±tolerance.
 *   2. Allow repeats, preferring the fewest and least recently used ones.
 *   3. Nothing fits: the closest possible set, with a message.
 *
 * @param {object} o
 * @param {Array}  o.exercises
 * @param {Array}  o.sessions
 * @param {number} o.targetMin
 * @param {number} [o.count]        exact number of exercises, optional
 * @param {number} [o.toleranceMin] default 2
 * @param {number} [o.maxExercises] max set size when no count given, default 6
 * @param {Date}   [o.today]
 * @param {Function} [o.random]     for testing; defaults to Math.random
 */
export function suggestSession({
  exercises,
  sessions,
  targetMin,
  count = null,
  toleranceMin = 2,
  maxExercises = 6,
  today = new Date(),
  random = Math.random,
}) {
  const usage = buildUsage(sessions, today);
  const todayIso = toISODate(today);
  const ctx = { targetMin, toleranceMin, usage };

  if (!exercises.length) {
    return finalize([], { ...ctx, message: 'Your library is empty. Add some exercises first.' });
  }

  const lo = targetMin - toleranceMin;
  const hi = targetMin + toleranceMin;
  const sizes = count
    ? [count]
    : Array.from({ length: maxExercises }, (_, i) => i + 1);

  if (count && count > exercises.length) {
    const set = findClosest(exercises, { target: targetMin, sizes: [exercises.length], random, usage, todayIso });
    return toSuggestion(set, {
      ...ctx,
      message: `You asked for ${count} exercises, but your library only has ${exercises.length}.`,
    });
  }

  const fits = exercises.filter((e) => e.durationMin <= hi);
  const fresh = fits.filter((e) => !usageOf(usage, e.id).usedThisMonth);

  // Tier 1: fresh only.
  const freshSets = findSets(fresh, { lo, hi, sizes, random });
  if (freshSets.length) {
    return toSuggestion(pickSolution(freshSets, random), ctx);
  }

  // Tier 2: allow repeats from this month, fewest and least recent first.
  const allSets = findSets(fits, { lo, hi, sizes, random });
  if (allSets.length) {
    return toSuggestion(pickLeastRepeated(allSets, usage, todayIso, random), {
      ...ctx,
      message: 'Not enough unused exercises left this month. Marked exercises were used before.',
    });
  }

  // Tier 3: nothing fits; closest possible.
  const closest = findClosest(exercises, { target: targetMin, sizes, random, usage, todayIso });
  const total = sum(closest);
  return toSuggestion(closest, {
    ...ctx,
    message: `No combination fits ${targetMin} ± ${toleranceMin} min. Closest match: ${total} min.`,
  });
}

/**
 * Replace the item at `index` with another exercise, keeping the others.
 * Prefers a replacement that keeps the total within tolerance, then fresh
 * over repeated, then least recently used. Never picks an exercise already
 * in the set, and avoids the one being swapped out if possible.
 */
export function swapExercise({
  suggestion,
  index,
  exercises,
  sessions,
  toleranceMin = 2,
  today = new Date(),
  random = Math.random,
}) {
  const usage = buildUsage(sessions, today);
  const todayIso = toISODate(today);
  const { targetMin } = suggestion;
  const current = suggestion.items[index].exercise;
  const others = suggestion.items.filter((_, i) => i !== index);
  const otherIds = new Set(others.map((i) => i.exercise.id));
  const rest = others.reduce((s, i) => s + i.exercise.durationMin, 0);

  const candidates = exercises.filter((e) => !otherIds.has(e.id) && e.id !== current.id);
  if (!candidates.length) {
    return { ...suggestion, message: 'There is no other exercise to swap in.' };
  }

  const score = (e) => {
    const diff = Math.abs(rest + e.durationMin - targetMin);
    const outside = Math.max(0, diff - toleranceMin);
    // Outside tolerance dominates, then repeats, then a little random spread.
    return outside * 100000 + repeatPenalty(e, usage, todayIso) + random();
  };
  // score() includes random(), so compute it once per candidate.
  const scored = candidates.map((e) => ({ e, s: score(e) })).sort((a, b) => a.s - b.s);
  const chosen = scored[0].e;

  const items = suggestion.items.slice();
  items[index] = { exercise: chosen, ...usageOf(usage, chosen.id) };
  const result = finalize(items, { targetMin, toleranceMin });
  if (!result.withinTolerance) {
    result.message = `No swap keeps the total within ${targetMin} ± ${toleranceMin} min. Closest: ${result.totalMin} min.`;
  } else if (items[index].usedThisMonth) {
    result.message = 'No unused exercise fits here; this one was used earlier this month.';
  }
  return result;
}

/** Replace or add an exercise chosen by hand. index = -1 adds it. */
export function setExercise({ suggestion, index, exercise, sessions, toleranceMin = 2, today = new Date() }) {
  const usage = buildUsage(sessions, today);
  const items = suggestion.items.slice();
  const item = { exercise, ...usageOf(usage, exercise.id) };
  if (index < 0) items.push(item);
  else items[index] = item;
  return finalize(items, { targetMin: suggestion.targetMin, toleranceMin });
}

/** Remove one exercise from the set. */
export function removeExercise({ suggestion, index, toleranceMin = 2 }) {
  const items = suggestion.items.filter((_, i) => i !== index);
  return finalize(items, { targetMin: suggestion.targetMin, toleranceMin });
}
