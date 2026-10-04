import { T, QID, PICK, OK, MS, SID } from './store.js';
import { dayKey, startOfDay, addDays } from './util.js';

// The learner licence theory test: 35 questions, 32 correct to pass.
export const TEST_LENGTH = 35;
export const PASS_MARK = 32;
export const PASS_RATE = PASS_MARK / TEST_LENGTH;

// One answer counts for at most two minutes of practice time, so a question
// left open while someone walks away doesn't inflate the totals.
const ACTIVE_CAP_MS = 120000;
const activeMs = (e) => Math.min(e[MS], ACTIVE_CAP_MS);

export function forSession(log, sid) {
  return log.filter((e) => e[SID] === sid);
}

export function summarise(entries) {
  let correct = 0;
  let active = 0;
  let correctMs = 0;
  let run = 0;
  let best = 0;
  for (const e of entries) {
    const ms = activeMs(e);
    active += ms;
    if (e[OK]) {
      correct += 1;
      correctMs += ms;
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  const answered = entries.length;
  const wrong = answered - correct;
  return {
    answered,
    correct,
    wrong,
    accuracy: answered ? correct / answered : 0,
    activeMs: active,
    avgMs: answered ? active / answered : 0,
    avgCorrectMs: correct ? correctMs / correct : 0,
    avgWrongMs: wrong ? (active - correctMs) / wrong : 0,
    bestRun: best,
  };
}

export function byTopic(entries, questions) {
  const rows = new Map();
  for (const e of entries) {
    const topic = questions.get(e[QID])?.Topic;
    if (!topic) continue;
    const row = rows.get(topic) ?? { topic, answered: 0, correct: 0 };
    row.answered += 1;
    row.correct += e[OK];
    rows.set(topic, row);
  }
  return [...rows.values()]
    .map((r) => ({ ...r, accuracy: r.correct / r.answered }))
    .sort((a, b) => a.accuracy - b.accuracy || b.answered - a.answered);
}

export function bySession(log) {
  const rows = new Map();
  for (const e of log) {
    let row = rows.get(e[SID]);
    if (!row) {
      row = { sid: e[SID], start: Infinity, end: 0, answered: 0, correct: 0, activeMs: 0 };
      rows.set(e[SID], row);
    }
    const at = e[T] * 1000;
    row.start = Math.min(row.start, at - activeMs(e));
    row.end = Math.max(row.end, at);
    row.answered += 1;
    row.correct += e[OK];
    row.activeMs += activeMs(e);
  }
  return [...rows.values()]
    .sort((a, b) => a.sid - b.sid)
    .map((r) => ({ ...r, accuracy: r.correct / r.answered }));
}

export function byDay(log) {
  const days = new Map();
  for (const e of log) {
    const key = dayKey(new Date(e[T] * 1000));
    const row = days.get(key) ?? { answered: 0, correct: 0 };
    row.answered += 1;
    row.correct += e[OK];
    days.set(key, row);
  }
  return days;
}

export function dayStreaks(days, today = new Date()) {
  const keys = [...days.keys()].sort();
  let longest = 0;
  let run = 0;
  let prev = null;
  for (const key of keys) {
    const date = new Date(`${key}T00:00:00`);
    run = prev && Math.round((date - prev) / 86400000) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = date;
  }
  // The current run may end today or, if nothing's been answered yet today, yesterday.
  let current = 0;
  let cursor = startOfDay(today);
  if (!days.has(dayKey(cursor))) cursor = addDays(cursor, -1);
  while (days.has(dayKey(cursor))) {
    current += 1;
    cursor = addDays(cursor, -1);
  }
  return { daysActive: keys.length, longest, current };
}

export function byHour(entries) {
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, answered: 0, correct: 0 }));
  for (const e of entries) {
    const row = hours[new Date(e[T] * 1000).getHours()];
    row.answered += 1;
    row.correct += e[OK];
  }
  return hours;
}

const DAY_PARTS = [
  { name: 'morning', hours: [5, 6, 7, 8, 9, 10, 11] },
  { name: 'afternoon', hours: [12, 13, 14, 15, 16] },
  { name: 'evening', hours: [17, 18, 19, 20, 21] },
  { name: 'late at night', hours: [22, 23, 0, 1, 2, 3, 4] },
];

/** The part of the day with the best accuracy, if there's enough data to say. */
export function bestDayPart(hours) {
  const parts = DAY_PARTS.map((p) => {
    const answered = p.hours.reduce((n, h) => n + hours[h].answered, 0);
    const correct = p.hours.reduce((n, h) => n + hours[h].correct, 0);
    return { name: p.name, answered, accuracy: answered ? correct / answered : 0 };
  }).filter((p) => p.answered >= 10);
  if (parts.length < 2) return null;
  return parts.sort((a, b) => b.accuracy - a.accuracy)[0];
}

export const SPEED_BUCKETS = [
  { label: 'Under 5 seconds', short: '<5s', max: 5000 },
  { label: '5 to 10 seconds', short: '5–10s', max: 10000 },
  { label: '10 to 20 seconds', short: '10–20s', max: 20000 },
  { label: '20 to 30 seconds', short: '20–30s', max: 30000 },
  { label: '30 to 60 seconds', short: '30–60s', max: 60000 },
  { label: 'Over a minute', short: '60s+', max: Infinity },
];

export function bySpeed(entries) {
  const rows = SPEED_BUCKETS.map((b) => ({ ...b, answered: 0, correct: 0 }));
  for (const e of entries) {
    const row = rows.find((r) => e[MS] < r.max);
    row.answered += 1;
    row.correct += e[OK];
  }
  return rows;
}

export function runningAccuracy(entries) {
  let correct = 0;
  return entries.map((e, i) => {
    correct += e[OK];
    return { x: i + 1, y: correct / (i + 1) };
  });
}

export function rollingAccuracy(entries, window) {
  const points = [];
  let correct = 0;
  for (let i = 0; i < entries.length; i += 1) {
    correct += entries[i][OK];
    if (i >= window) correct -= entries[i - window][OK];
    if (i >= window - 1) points.push({ x: i + 1, y: correct / window });
  }
  return points;
}

/** How the most recent 35 answers compare with the real test. */
export function readiness(log) {
  const recent = log.slice(-TEST_LENGTH);
  const correct = recent.reduce((n, e) => n + e[OK], 0);
  return { answered: recent.length, correct, complete: recent.length === TEST_LENGTH, pass: correct >= PASS_MARK };
}

/** Questions answered incorrectly at least once, with what was picked last time it went wrong. */
export function missed(entries) {
  const rows = new Map();
  for (const e of entries) {
    const row = rows.get(e[QID]) ?? { id: e[QID], attempts: 0, misses: 0, lastMissAt: 0, lastPick: null, lastOk: 0 };
    row.attempts += 1;
    row.lastOk = e[OK];
    if (!e[OK]) {
      row.misses += 1;
      row.lastMissAt = e[T];
      row.lastPick = e[PICK];
    }
    rows.set(e[QID], row);
  }
  return [...rows.values()].filter((r) => r.misses > 0);
}
