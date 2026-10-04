import { randInt } from './util.js';

export const STORAGE_KEY = 'nzrc:v1';
const LOG_CAP = 25000;
// A missed question comes back after this many more answers (min inclusive, max exclusive).
const REVIEW_AFTER = [5, 10];

// Each answer is stored as a compact tuple; these are its fields.
export const T = 0; // answered at, unix seconds
export const QID = 1; // question ID
export const PICK = 2; // chosen option index, 0 = A
export const OK = 3; // 1 correct, 0 incorrect
export const MS = 4; // time taken to answer in ms, excluding time the tab was hidden
export const SID = 5; // session ID: the page load time in ms

function blank() {
  // runBase: the best streak as it stood when the current run began.
  return { v: 1, deck: [], review: [], cur: null, curReview: false, n: 0, streak: 0, best: 0, runBase: 0, log: [] };
}

function read() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return parsed && parsed.v === 1 ? parsed : null;
  } catch {
    return null;
  }
}

export class Store {
  constructor(ids) {
    this.ids = ids;
    this.known = new Set(ids);
    this.sid = Date.now();
    this.saveFailed = false;
    this.state = this.normalise(read());
    this.save();
  }

  normalise(raw) {
    const st = { ...blank(), ...(raw || {}) };
    const valid = (id) => this.known.has(id);
    st.deck = Array.isArray(st.deck) ? st.deck.filter(valid) : [];
    st.review = Array.isArray(st.review)
      ? st.review.filter((r) => Array.isArray(r) && valid(r[0]) && Number.isFinite(r[1]))
      : [];
    st.log = Array.isArray(st.log) ? st.log.filter((e) => Array.isArray(e) && e.length >= 6 && valid(e[QID])) : [];
    if (!valid(st.cur)) {
      st.cur = null;
      st.curReview = false;
    }
    st.n = Math.max(Number(st.n) || 0, st.log.length);
    st.streak = Number(st.streak) || 0;
    st.best = Math.max(Number(st.best) || 0, st.streak);
    st.runBase = Math.min(Number(st.runBase) || 0, st.best);

    // Questions added to the bank since the last visit join the current round.
    if (st.deck.length) {
      const seen = new Set([...st.deck, ...st.review.map((r) => r[0]), st.cur, ...st.log.map((e) => e[QID])]);
      for (const id of this.ids) {
        if (!seen.has(id)) st.deck.splice(randInt(0, st.deck.length + 1), 0, id);
      }
    }
    return st;
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      this.saveFailed = false;
    } catch {
      // Storage is full or blocked. Drop the oldest third of the log and try once more.
      try {
        this.state.log.splice(0, Math.ceil(this.state.log.length / 3));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
        this.saveFailed = false;
      } catch {
        this.saveFailed = true;
      }
    }
  }

  get log() {
    return this.state.log;
  }

  get currentIsReview() {
    return this.state.curReview;
  }

  get streak() {
    return this.state.streak;
  }

  get best() {
    return this.state.best;
  }

  get runBase() {
    return this.state.runBase;
  }

  lastAnsweredId() {
    const log = this.state.log;
    return log.length ? log[log.length - 1][QID] : null;
  }

  /** Weighted shuffle of the whole bank: unseen and previously missed questions tend to come first. */
  buildRound(avoid) {
    const lastResult = new Map();
    for (const e of this.state.log) lastResult.set(e[QID], e[OK]);
    const pending = new Set(this.state.review.map((r) => r[0]));
    const keyed = [];
    for (const id of this.ids) {
      if (id === avoid || pending.has(id)) continue;
      const weight = !lastResult.has(id) ? 1.5 : lastResult.get(id) ? 1 : 2.5;
      keyed.push([Math.random() ** (1 / weight), id]);
    }
    keyed.sort((a, b) => b[0] - a[0]);
    const round = keyed.map((k) => k[1]);
    if (this.known.has(avoid) && !pending.has(avoid)) {
      round.splice(randInt(Math.min(round.length, 8), round.length + 1), 0, avoid);
    }
    return round;
  }

  /** Work out which question comes next without committing to it. */
  pick() {
    const st = this.state;
    const last = this.lastAnsweredId();
    const due = st.review
      .filter((r) => r[1] <= st.n && r[0] !== last)
      .sort((a, b) => a[1] - b[1])[0];
    if (due) return { id: due[0], review: true };
    if (!st.deck.length) st.deck = this.buildRound(last);
    const index = st.deck[0] === last && st.deck.length > 1 ? 1 : 0;
    return { id: st.deck[index], review: false, index };
  }

  /** The question that will be shown after the current one. */
  peek() {
    return this.state.cur ?? this.pick().id;
  }

  /** The question to show now: the unanswered one from last time, or the next one. */
  next() {
    const st = this.state;
    if (st.cur != null) return st.cur;
    const choice = this.pick();
    if (!choice.review) st.deck.splice(choice.index, 1);
    st.review = st.review.filter((r) => r[0] !== choice.id);
    st.cur = choice.id;
    st.curReview = choice.review;
    this.save();
    return st.cur;
  }

  answer(id, pick, correct, ms) {
    const st = this.state;
    st.log.push([Math.round(Date.now() / 1000), id, pick, correct ? 1 : 0, Math.round(ms), this.sid]);
    if (st.log.length > LOG_CAP) st.log.splice(0, st.log.length - LOG_CAP);
    st.n += 1;
    if (correct) {
      st.streak += 1;
      st.best = Math.max(st.best, st.streak);
    } else {
      st.streak = 0;
      st.runBase = st.best;
      st.review = st.review.filter((r) => r[0] !== id);
      st.review.push([id, st.n + randInt(REVIEW_AFTER[0], REVIEW_AFTER[1])]);
    }
    st.cur = null;
    st.curReview = false;
    this.save();
  }

  /** Clear history, sessions and streaks but keep the question that's on screen. */
  reset() {
    this.state = { ...blank(), cur: this.state.cur };
    this.save();
  }

  /** Another tab saved progress: adopt it, but keep showing our current question. */
  syncFromStorage() {
    const showing = this.state.cur;
    const review = this.state.curReview;
    this.state = this.normalise(read());
    if (showing != null) {
      this.state.cur = showing;
      this.state.curReview = review;
      this.state.deck = this.state.deck.filter((id) => id !== showing);
    }
  }

  exportJSON() {
    const { log, ...rest } = this.state;
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        answerFields: ['answeredAt', 'questionId', 'optionIndex', 'correct', 'timeMs', 'sessionId'],
        ...rest,
        log,
      },
      null,
      1,
    );
  }
}
