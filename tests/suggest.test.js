// Tests for js/suggest.js. Runs in the browser (tests/suggest.test.html)
// or in Node:  node tests/suggest.test.js

import { suggestSession, swapExercise, buildUsage } from '../js/suggest.js';

const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); }
  catch (err) { results.push({ name, ok: false, err: err.message }); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

// Deterministic random for repeatable tests.
function seeded(seed) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

const ex = (id, durationMin) => ({ id, title: `Ex ${id}`, durationMin, position: 'either', description: '', notes: '' });
const LIB = [ex('a', 5), ex('b', 8), ex('c', 6), ex('d', 4), ex('e', 5), ex('f', 10), ex('g', 7), ex('h', 3), ex('i', 12)];
const TODAY = new Date('2026-11-17T12:00:00');

test('fills the target within tolerance', () => {
  for (let s = 1; s < 50; s++) {
    const r = suggestSession({ exercises: LIB, sessions: [], targetMin: 25, today: TODAY, random: seeded(s) });
    assert(r.withinTolerance, `seed ${s}: total ${r.totalMin}`);
    assert(!r.usedRepeats, 'no repeats expected');
  }
});

test('respects the requested count', () => {
  for (let s = 1; s < 30; s++) {
    const r = suggestSession({ exercises: LIB, sessions: [], targetMin: 20, count: 2, today: TODAY, random: seeded(s) });
    assert(r.items.length === 2, `got ${r.items.length}`);
    assert(r.withinTolerance, `total ${r.totalMin}`);
  }
});

test('avoids exercises used this month', () => {
  const sessions = [{ id: 's1', date: '2026-11-03', exercises: [ex('a', 5), ex('b', 8), ex('f', 10)] }];
  for (let s = 1; s < 30; s++) {
    const r = suggestSession({ exercises: LIB, sessions, targetMin: 20, today: TODAY, random: seeded(s) });
    const ids = r.items.map((i) => i.exercise.id);
    assert(!ids.some((id) => ['a', 'b', 'f'].includes(id)), `used: ${ids}`);
  }
});

test('last month does not count as used', () => {
  const sessions = [{ id: 's1', date: '2026-10-28', exercises: LIB }];
  const usage = buildUsage(sessions, TODAY);
  assert([...usage.values()].every((u) => !u.usedThisMonth));
});

test('falls back to least recently used, and flags it', () => {
  const lib = [ex('a', 10), ex('b', 10), ex('c', 10)];
  const sessions = [
    { id: 's1', date: '2026-11-02', exercises: [ex('a', 10)] },
    { id: 's2', date: '2026-11-10', exercises: [ex('b', 10)] },
  ];
  const r = suggestSession({ exercises: lib, sessions, targetMin: 20, count: 2, today: TODAY, random: seeded(3) });
  const ids = r.items.map((i) => i.exercise.id).sort();
  assert(ids.join() === 'a,c', `expected a,c got ${ids}`);
  assert(r.usedRepeats && r.message, 'should flag repeats');
});

test('closest match when nothing fits', () => {
  const r = suggestSession({ exercises: [ex('a', 10), ex('b', 10)], sessions: [], targetMin: 25, today: TODAY, random: seeded(1) });
  assert(!r.withinTolerance && r.totalMin === 20, `total ${r.totalMin}`);
  assert(r.message, 'should explain');
});

test('empty library gives a message', () => {
  const r = suggestSession({ exercises: [], sessions: [], targetMin: 25, today: TODAY });
  assert(r.items.length === 0 && r.message);
});

test('swap keeps others and stays within tolerance', () => {
  const base = suggestSession({ exercises: LIB, sessions: [], targetMin: 20, count: 2, today: TODAY, random: seeded(7) });
  const keep = base.items[1].exercise.id;
  const old = base.items[0].exercise.id;
  const r = swapExercise({ suggestion: base, index: 0, exercises: LIB, sessions: [], today: TODAY, random: seeded(9) });
  assert(r.items[1].exercise.id === keep, 'other item kept');
  assert(r.items[0].exercise.id !== old, 'item replaced');
  assert(r.withinTolerance, `total ${r.totalMin}`);
});

test('large library stays fast', () => {
  const big = Array.from({ length: 150 }, (_, i) => ex('x' + i, 2 + (i % 12)));
  const t0 = Date.now();
  const r = suggestSession({ exercises: big, sessions: [], targetMin: 25, today: TODAY, random: seeded(5) });
  const ms = Date.now() - t0;
  assert(r.withinTolerance, 'fits');
  assert(ms < 500, `took ${ms} ms`);
});

// ---- report ----
const failed = results.filter((r) => !r.ok);
const lines = results.map((r) => `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : '  — ' + r.err}`);
lines.push(`\n${results.length - failed.length}/${results.length} passed`);

if (typeof document !== 'undefined') {
  document.getElementById('out').textContent = lines.join('\n');
  document.body.dataset.result = failed.length ? 'fail' : 'pass';
} else {
  console.log(lines.join('\n'));
  if (failed.length) process.exitCode = 1;
}
