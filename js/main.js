import { $, h, icon, reducedMotion, debounce, dayKey } from './util.js';
import { Store, STORAGE_KEY } from './store.js';
import { renderDashboard, redrawCharts } from './dashboard.js';
import { initTooltip, hideTip } from './charts.js';

const KEYS = ['A', 'B', 'C', 'D', 'E'];
const ADVANCE_MS = 3000;
const THEME_KEY = 'nzrc:theme';
const STREAK_MILESTONES = [5, 10, 15, 20, 25, 30, 35, 40, 50, 60, 75, 100, 150, 200, 250, 300];

const ui = {
  topbar: $('.topbar'),
  card: $('#card'),
  figure: $('#qFigure'),
  body: $('.q-body'),
  image: $('#qImage'),
  topic: $('#qTopic'),
  flag: $('#qFlag'),
  text: $('#qText'),
  options: $('#qOptions'),
  feedback: $('#feedback'),
  fbIcon: $('#fbIcon'),
  fbTitle: $('#fbTitle'),
  fbSub: $('#fbSub'),
  fbExplain: $('#fbExplain'),
  fbAnswer: $('#fbAnswer'),
  fbText: $('#fbText'),
  fbRef: $('#fbRef'),
  lane: $('#lane'),
  laneFill: $('#laneFill'),
  explainBtn: $('#explainBtn'),
  nextBtn: $('#nextBtn'),
  error: $('#qError'),
  retryBtn: $('#retryBtn'),
  announcer: $('#announcer'),
  chip: $('#statsChip'),
  chipArc: $('#chipArc'),
  chipPct: $('#chipPct'),
  chipScore: $('#chipScore'),
  chipCorrect: $('#chipCorrect'),
  chipAnswered: $('#chipAnswered'),
  chipStreak: $('#chipStreak'),
  chipStreakWrap: $('#chipStreakWrap'),
  chipLabel: $('#chipLabel'),
  themeBtn: $('#themeBtn'),
  toast: $('#toast'),
  dialog: $('#statsDialog'),
  sheetPanel: $('.sheet-panel'),
  sheetBody: $('#sheetBody'),
  sheetClose: $('#sheetClose'),
  seg: $('.seg'),
  tabs: [...document.querySelectorAll('.seg-btn')],
  tip: $('#vizTip'),
  resetDialog: $('#resetDialog'),
  resetCancel: $('#resetCancel'),
  resetConfirm: $('#resetConfirm'),
};

let questions = new Map();
let store = null;
let current = null;
let phase = 'loading'; // loading | question | correct | wrong | switching | error
const session = { answered: 0, correct: 0 };
let advance = null; // the lane-line countdown animation
let statsTab = null;
let historyPushed = false;
let drawnWidth = 0;

const isInterrupted = () => document.hidden || ui.dialog.open;

/** Times an answer, leaving out any time the tab was hidden or the stats were open. */
const clock = {
  started: 0,
  paused: 0,
  pausedAt: null,
  reset() {
    this.started = performance.now();
    this.paused = 0;
    this.pausedAt = isInterrupted() ? this.started : null;
  },
  pause() {
    if (this.pausedAt == null) this.pausedAt = performance.now();
  },
  resume() {
    if (this.pausedAt == null) return;
    this.paused += performance.now() - this.pausedAt;
    this.pausedAt = null;
  },
  elapsed() {
    const now = performance.now();
    const paused = this.paused + (this.pausedAt == null ? 0 : now - this.pausedAt);
    return Math.max(0, now - this.started - paused);
  },
};

/* --------------------------------------------------------------------------
   Start-up
   -------------------------------------------------------------------------- */

async function boot() {
  syncThemeButton();
  initTooltip(ui.tip, ui.sheetPanel);
  let list;
  try {
    const response = await fetch('data/questions.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Questions request failed with ${response.status}`);
    list = await response.json();
  } catch (error) {
    console.error(error);
    showLoadError();
    return;
  }
  questions = new Map(list.map((q) => [q.ID, q]));
  store = new Store(list.map((q) => q.ID));
  if (store.saveFailed) toast("This browser isn't saving progress", 'i-info');
  updateChip(false);
  await showQuestion(store.next(), true);
}

function showLoadError() {
  phase = 'error';
  ui.card.classList.remove('is-loading');
  ui.card.classList.add('has-error');
  ui.card.removeAttribute('aria-busy');
  ui.error.hidden = false;
}

/* --------------------------------------------------------------------------
   Showing a question
   -------------------------------------------------------------------------- */

async function showQuestion(id, first = false) {
  phase = 'switching';
  stopAdvance();
  let exit = [];
  if (!first && !reducedMotion()) {
    exit = [ui.figure, ui.body, ui.options, ui.feedback]
      .filter((node) => !node.hidden)
      .map((node) =>
        node.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(-18px)' }], {
          duration: 160,
          easing: 'ease-in',
          fill: 'forwards',
        }),
      );
    await Promise.all(exit.map((a) => a.finished.catch(() => {})));
  }

  current = questions.get(id);
  render(current);
  await imageReady();
  exit.forEach((a) => a.cancel());
  ui.card.classList.remove('is-loading');
  ui.card.removeAttribute('aria-busy');

  const cardTop = ui.card.getBoundingClientRect().top + window.scrollY - ui.topbar.offsetHeight - 8;
  if (window.scrollY > cardTop) window.scrollTo({ top: Math.max(0, cardTop) });

  if (!first && !reducedMotion()) {
    // The picture and question animate separately because on desktop they sit in different grid cells.
    for (const node of [ui.figure, ui.body]) {
      node.animate([{ opacity: 0, transform: 'translateX(22px)' }, { opacity: 1, transform: 'none' }], {
        duration: 320,
        easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
      });
    }
  }
  phase = 'question';
  clock.reset();
}

function render(q) {
  const src = `images/${q.Image}`;
  ui.figure.classList.remove('is-missing');
  // Absolute, because a url() inside a custom property resolves against the stylesheet.
  ui.figure.style.setProperty('--q-img', `url("${new URL(src, document.baseURI).href}")`);
  ui.image.src = src;
  ui.image.alt = 'Picture for this question';
  ui.topic.textContent = q.Topic;
  ui.flag.hidden = !store.currentIsReview;
  ui.text.textContent = q.Question;

  const keys = KEYS.filter((k) => q[k]);
  ui.options.classList.toggle('is-short', keys.every((k) => q[k].length <= 14));
  ui.options.replaceChildren(
    ...keys.map((key, i) =>
      h(
        'button',
        { class: 'opt', type: 'button', 'data-key': key, style: `--i: ${i}`, onclick: () => choose(key) },
        h('span', { class: 'opt-key', 'aria-hidden': 'true', text: key }),
        h('span', { class: 'opt-text', text: q[key] }),
        h('span', { class: 'opt-mark', 'aria-hidden': 'true' }),
      ),
    ),
  );
  ui.feedback.hidden = true;
  ui.announcer.textContent = '';
}

function imageReady() {
  const img = ui.image;
  if (img.complete) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, 700);
    img.addEventListener('load', done, { once: true });
    img.addEventListener('error', done, { once: true });
  });
}

ui.image.addEventListener('error', () => ui.figure.classList.add('is-missing'));

/* --------------------------------------------------------------------------
   Answering
   -------------------------------------------------------------------------- */

function choose(key) {
  if (phase !== 'question') return;
  const q = current;
  const correct = key === q.Correct;
  store.answer(q.ID, KEYS.indexOf(key), correct, clock.elapsed());
  session.answered += 1;
  if (correct) session.correct += 1;
  phase = correct ? 'correct' : 'wrong';

  markOptions(key, q.Correct);
  showFeedback(correct);
  updateChip(true);
  celebrate(correct);
  preloadNext();
}

function markOptions(picked, answer) {
  for (const button of ui.options.children) {
    const key = button.dataset.key;
    const mark = button.querySelector('.opt-mark');
    button.setAttribute('aria-disabled', 'true');
    if (key === picked) {
      button.classList.add(key === answer ? 'is-correct' : 'is-wrong');
      mark.replaceChildren(icon(key === answer ? 'i-check' : 'i-cross'));
    } else if (key === answer) {
      button.classList.add('is-answer');
      mark.replaceChildren(icon('i-check'));
    } else {
      button.classList.add('is-dim');
    }
  }
}

function showFeedback(correct) {
  const q = current;
  const answer = q[q.Correct];
  // Two-choice explanations already open with the answer ("Yes.", "False.").
  const twoChoice = KEYS.filter((k) => q[k]).length <= 2;
  const streak = store.streak >= 2 ? `${store.streak} in a row` : '';

  ui.feedback.classList.toggle('is-wrong', !correct);
  ui.fbIcon.setAttribute('href', correct ? '#i-check' : '#i-cross');
  ui.fbTitle.textContent = correct ? 'Correct' : 'Incorrect';
  ui.fbSub.textContent = correct ? streak : '';
  ui.fbAnswer.textContent = correct || twoChoice ? '' : `The answer is ${q.Correct}: ${answer}`;
  ui.fbText.textContent = q.Explanation;
  ui.fbRef.textContent = `Road Code page ${q.Page}`;
  ui.fbExplain.hidden = correct;
  ui.explainBtn.hidden = !correct;
  ui.lane.hidden = !correct;
  ui.feedback.hidden = false;

  ui.announcer.textContent = correct
    ? `Correct. ${streak ? `${streak}. ` : ''}Next question in ${ADVANCE_MS / 1000} seconds.`
    : `Incorrect. ${twoChoice ? '' : `The answer is ${q.Correct}: ${answer}. `}${q.Explanation}`;

  ui.nextBtn.focus({ preventScroll: true });
  if (correct) startAdvance();
  revealFeedback();
}

/** Scroll just enough to bring the feedback panel into view (mostly matters on phones). */
function revealFeedback() {
  requestAnimationFrame(() => {
    const rect = ui.feedback.getBoundingClientRect();
    const topLimit = ui.topbar.offsetHeight + 8;
    let delta = 0;
    if (rect.bottom > window.innerHeight - 12) delta = rect.bottom - window.innerHeight + 16;
    if (rect.top - delta < topLimit) delta = rect.top - topLimit;
    if (delta > 0) window.scrollBy({ top: delta, behavior: reducedMotion() ? 'auto' : 'smooth' });
  });
}

function startAdvance() {
  stopAdvance();
  advance = ui.laneFill.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], {
    duration: ADVANCE_MS,
    easing: 'linear',
    fill: 'forwards',
  });
  advance.onfinish = () => {
    advance = null;
    goNext();
  };
  if (isInterrupted()) advance.pause();
}

function stopAdvance() {
  if (!advance) return;
  advance.onfinish = null;
  advance.cancel();
  advance = null;
}

async function goNext() {
  if (phase !== 'correct' && phase !== 'wrong') return;
  stopAdvance();
  phase = 'switching';
  await showQuestion(store.next());
}

function explain() {
  stopAdvance();
  ui.lane.hidden = true;
  ui.explainBtn.hidden = true;
  ui.fbExplain.hidden = false;
  ui.announcer.textContent = current.Explanation;
  ui.nextBtn.focus({ preventScroll: true });
  revealFeedback();
}

function preloadNext() {
  const next = questions.get(store.peek());
  if (next) new Image().src = `images/${next.Image}`;
}

/* --------------------------------------------------------------------------
   Quick stats chip + streak toasts
   -------------------------------------------------------------------------- */

function updateChip(animate) {
  const { answered, correct } = session;
  const streak = store ? store.streak : 0;
  const score = answered ? Math.round((correct / answered) * 100) : null;
  if (score == null) ui.chipPct.textContent = '–';
  else ui.chipPct.replaceChildren(String(score), h('small', { text: '%' }));
  ui.chipArc.style.strokeDasharray = `${score ?? 0} 100`;
  // A zero-length arc would still draw a dot from its round cap.
  ui.chipArc.style.opacity = score ? 1 : 0;
  ui.chipScore.hidden = answered === 0;
  setCount(ui.chipCorrect, correct, animate);
  setCount(ui.chipAnswered, answered, animate);
  setCount(ui.chipStreak, streak, animate);
  ui.chipStreakWrap.classList.toggle('is-hot', streak >= 3);
  ui.chipLabel.textContent = answered
    ? `Your stats: ${correct} of ${answered} correct this session, ${streak} in a row. Open full stats.`
    : `Your stats: ${streak} in a row. Open full stats.`;
}

function setCount(node, value, animate) {
  const text = String(value);
  if (node.textContent === text) return;
  node.textContent = text;
  if (!animate || reducedMotion()) return;
  node.classList.remove('bump');
  void node.offsetWidth;
  node.classList.add('bump');
}

function celebrate(correct) {
  if (!correct) return;
  const { streak, runBase } = store;
  // Announce a new record once, at the answer that first beats the old one.
  if (runBase >= 5 && streak === runBase + 1) toast(`New best streak: ${streak} in a row`, 'i-flame');
  else if (STREAK_MILESTONES.includes(streak)) toast(`${streak} in a row`, 'i-flame');
}

let toastTimer = 0;
function toast(text, glyph) {
  ui.toast.replaceChildren(icon(glyph), h('span', { text }));
  ui.toast.classList.add('is-shown');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('is-shown'), 2600);
}

/* --------------------------------------------------------------------------
   Stats sheet
   -------------------------------------------------------------------------- */

function openStats() {
  if (!store || ui.dialog.open) return;
  clock.pause();
  advance?.pause();
  if (!statsTab) statsTab = session.answered || !store.log.length ? 'session' : 'all';
  selectTab(statsTab, false);
  ui.dialog.showModal();
  renderStats();
  requestAnimationFrame(() => ui.dialog.classList.add('is-open'));
  history.pushState({ nzrcStats: true }, '');
  historyPushed = true;
}

function closeStats() {
  if (!ui.dialog.open) return;
  // Opening the sheet added a history entry so the phone's back button closes it.
  if (historyPushed) history.back();
  else finishClose();
}

function finishClose() {
  if (!ui.dialog.open) return;
  hideTip();
  if (ui.resetDialog.open) ui.resetDialog.close();
  ui.dialog.classList.remove('is-open');
  setTimeout(
    () => {
      if (ui.dialog.classList.contains('is-open')) return;
      ui.dialog.close();
      if (!document.hidden) {
        clock.resume();
        advance?.play();
      }
    },
    reducedMotion() ? 0 : 340,
  );
}

function selectTab(tab, rerender = true) {
  statsTab = tab;
  for (const button of ui.tabs) {
    const selected = button.dataset.tab === tab;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
    if (selected) ui.sheetBody.setAttribute('aria-labelledby', button.id);
  }
  if (rerender) {
    ui.sheetBody.scrollTop = 0;
    renderStats();
  }
}

function renderStats() {
  renderDashboard(ui.sheetBody, {
    tab: statsTab,
    log: store.log,
    sid: store.sid,
    streak: store.streak,
    best: store.best,
    questions,
    onClose: closeStats,
    onExport: exportData,
    onReset: () => ui.resetDialog.showModal(),
  });
  drawnWidth = ui.sheetBody.clientWidth;
}

function exportData() {
  const blob = new Blob([store.exportJSON()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = h('a', { href: url, download: `road-code-quiz-${dayKey(new Date())}.json`, hidden: true });
  ui.sheetBody.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* --------------------------------------------------------------------------
   Theme
   -------------------------------------------------------------------------- */

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
const effectiveTheme = () => document.documentElement.dataset.theme || (darkQuery.matches ? 'dark' : 'light');

function syncThemeButton() {
  const dark = effectiveTheme() === 'dark';
  ui.themeBtn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  ui.themeBtn.querySelector('use').setAttribute('href', dark ? '#i-sun' : '#i-moon');
  const forced = document.documentElement.dataset.theme;
  if (forced) {
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
      meta.setAttribute('content', forced === 'dark' ? '#101417' : '#e9ecea');
    }
  }
}

/* --------------------------------------------------------------------------
   Events
   -------------------------------------------------------------------------- */

ui.nextBtn.addEventListener('click', goNext);
ui.explainBtn.addEventListener('click', explain);
ui.retryBtn.addEventListener('click', () => window.location.reload());
ui.chip.addEventListener('click', openStats);
ui.sheetClose.addEventListener('click', closeStats);

ui.themeBtn.addEventListener('click', () => {
  const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // Theme still applies for this visit.
  }
  syncThemeButton();
});
darkQuery.addEventListener('change', syncThemeButton);

ui.dialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeStats();
});
ui.dialog.addEventListener('click', (event) => {
  if (event.target === ui.dialog) closeStats();
});
window.addEventListener('popstate', () => {
  historyPushed = false;
  finishClose();
});

ui.tabs.forEach((button) => button.addEventListener('click', () => selectTab(button.dataset.tab)));
ui.seg.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  const next = statsTab === 'session' ? 'all' : 'session';
  selectTab(next);
  ui.tabs.find((b) => b.dataset.tab === next).focus();
});

ui.sheetBody.addEventListener('scroll', hideTip, { passive: true });
new ResizeObserver(
  debounce(() => {
    if (!ui.dialog.open) return;
    const width = ui.sheetBody.clientWidth;
    if (width === drawnWidth) return;
    drawnWidth = width;
    redrawCharts();
  }, 150),
).observe(ui.sheetBody);

ui.resetCancel.addEventListener('click', () => ui.resetDialog.close());
ui.resetConfirm.addEventListener('click', () => {
  store.reset();
  session.answered = 0;
  session.correct = 0;
  ui.resetDialog.close();
  ui.flag.hidden = true;
  updateChip(false);
  renderStats();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clock.pause();
    advance?.pause();
  } else if (!ui.dialog.open) {
    clock.resume();
    advance?.play();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
  if (!store || ui.dialog.open) return;
  const key = event.key;
  if (phase === 'question') {
    const number = ['1', '2', '3', '4', '5'].indexOf(key);
    const letter = number >= 0 ? KEYS[number] : key.length === 1 ? key.toUpperCase() : '';
    if (KEYS.includes(letter) && current?.[letter]) {
      event.preventDefault();
      choose(letter);
      return;
    }
  } else if (phase === 'correct' || phase === 'wrong') {
    const onControl = ['BUTTON', 'A'].includes(document.activeElement?.tagName);
    if (key === 'ArrowRight' || key === 'n' || key === 'N' || ((key === 'Enter' || key === ' ') && !onControl)) {
      event.preventDefault();
      goNext();
      return;
    }
  }
  if (key === 's' || key === 'S') {
    event.preventDefault();
    openStats();
  }
});

window.addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY || !store) return;
  store.syncFromStorage();
  updateChip(false);
});

window.addEventListener('scroll', () => ui.topbar.classList.toggle('is-scrolled', window.scrollY > 2), { passive: true });

boot();
