import {
  h,
  icon,
  plural,
  percent,
  formatDuration,
  formatSeconds,
  formatDate,
  formatShortDate,
  formatTime,
  formatHour,
} from './util.js';
import { T, QID, OK, MS } from './store.js';
import * as stats from './stats.js';
import * as viz from './charts.js';

const KEYS = ['A', 'B', 'C', 'D', 'E'];
const PASS_LABEL = `Pass mark ${Math.round(stats.PASS_RATE * 100)}%`;

let draws = [];

/**
 * ctx: { tab, log, sid, streak, best, questions, onClose, onExport, onReset }
 */
export function renderDashboard(body, ctx) {
  draws = [];
  const view = ctx.tab === 'all' ? allTime(ctx) : thisSession(ctx);
  body.replaceChildren(view);
  redrawCharts();
}

export function redrawCharts() {
  viz.hideTip();
  for (const draw of draws) draw();
}

/* --------------------------------------------------------------------------
   Building blocks
   -------------------------------------------------------------------------- */

function chart(draw) {
  const el = h('div', { class: 'viz' });
  draws.push(() => draw(el));
  return el;
}

function panel(title, note, ...children) {
  return h(
    'section',
    { class: 'panel' },
    h('div', { class: 'panel-head' }, h('h3', { class: 'panel-title', text: title }), note ? h('p', { class: 'panel-note', text: note }) : null),
    ...children,
  );
}

function caption(text) {
  return text ? h('p', { class: 'panel-caption', text }) : null;
}

function kpis(items) {
  return h(
    'div',
    { class: 'kpis' },
    items.map(({ label, value, unit, note }) =>
      h(
        'div',
        { class: 'kpi' },
        h('p', { class: 'kpi-label', text: label }),
        h('p', { class: 'kpi-value' }, value, unit ? h('small', { text: unit }) : null),
        note ? h('p', { class: 'kpi-note', text: note }) : null,
      ),
    ),
  );
}

function pill(kind, text) {
  const glyph = kind === 'good' ? 'i-check' : kind === 'bad' ? 'i-cross' : 'i-info';
  return h('span', { class: `status-pill is-${kind}` }, icon(glyph), text);
}

function legend(items) {
  return h(
    'div',
    { class: 'legend' },
    items.map(([swatchClass, text]) => h('span', { class: 'legend-item' }, h('i', { class: `swatch ${swatchClass}`, 'aria-hidden': 'true' }), text)),
  );
}

function empty(title, text, ctx) {
  return h(
    'div',
    { class: 'empty' },
    icon('logo', 'brand-mark'),
    h('h3', { text: title }),
    h('p', { text }),
    h('button', { class: 'btn btn-primary', type: 'button', text: 'Back to the questions', onclick: ctx.onClose }),
  );
}

const pct = (fraction) => `${Math.round(fraction * 100)}%`;

function clip(text, max = 70) {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/* --------------------------------------------------------------------------
   Shared panels
   -------------------------------------------------------------------------- */

function topicsPanel(entries, ctx, title) {
  const rows = stats.byTopic(entries, ctx.questions);
  const weakest = rows.find((r) => r.answered >= 5 && r.accuracy < stats.PASS_RATE);
  const list = chart((el) =>
    viz.barList(el, rows, {
      name: (r) => r.topic,
      fraction: (r) => r.accuracy,
      value: (r) => pct(r.accuracy),
      note: (r) => `${r.correct} of ${r.answered}`,
      passAt: stats.PASS_RATE,
    }),
  );
  return panel(
    title,
    'Weakest first',
    list,
    legend([['is-line', `${PASS_LABEL}, the standard the real test needs`]]),
    caption(weakest ? `${weakest.topic} needs the most work at the moment.` : null),
  );
}

function missedPanel(rows, ctx, { title, note, intro }) {
  if (!rows.length) return null;
  const items = rows.map((row) => {
    const q = ctx.questions.get(row.id);
    const picked = KEYS[row.lastPick];
    const status = row.lastOk ? 'Answered correctly since' : 'Still to get right';
    return h(
      'li',
      {},
      h(
        'details',
        { class: 'missed-item' },
        h(
          'summary',
          {},
          h('img', { class: 'missed-thumb', src: `images/${q.Image}`, alt: '', width: 56, height: 56, loading: 'lazy' }),
          h(
            'span',
            { class: 'missed-main' },
            h('span', { class: 'missed-q', text: q.Question }),
            h(
              'span',
              { class: 'missed-meta' },
              h('span', { class: 'missed-count', text: row.misses > 1 ? `Missed ${row.misses} times` : 'Missed once' }),
              h('span', { text: status }),
            ),
          ),
        ),
        h(
          'div',
          { class: 'missed-body' },
          picked && q[picked]
            ? h('p', { class: 'ans is-bad' }, icon('i-cross'), h('span', { text: `You picked ${picked}: ${q[picked]}` }))
            : null,
          h('p', { class: 'ans is-good' }, icon('i-check'), h('span', { text: `Answer ${q.Correct}: ${q[q.Correct]}` })),
          h('p', { class: 'why', text: q.Explanation }),
        ),
      ),
    );
  });
  return panel(title, note, intro ? h('p', { class: 'panel-caption', style: 'margin: -6px 0 14px', text: intro }) : null, h('ul', { class: 'missed' }, items));
}

function resultsPanel(entries, ctx, title) {
  const info = h('p', { class: 'panel-caption' });
  const strip = chart((el) => {
    const shown = viz.resultStrip(el, entries, {
      label: `${entries.length} answers: ${entries.filter((e) => e[OK]).length} correct`,
      isCorrect: (e) => e[OK] === 1,
      tipLines: (e, i) => [
        e[OK] ? 'Correct' : 'Incorrect',
        `Answer ${i + 1}, ${formatSeconds(e[MS])}`,
        clip(ctx.questions.get(e[QID])?.Question ?? ''),
      ],
    });
    info.textContent =
      shown < entries.length ? `Showing your latest ${shown} answers, oldest on the left.` : 'Oldest on the left.';
  });
  return panel(
    title,
    plural(entries.length, 'answer'),
    strip,
    legend([
      ['is-good', 'Correct (up)'],
      ['is-bad', 'Incorrect (down)'],
    ]),
    info,
  );
}

/* --------------------------------------------------------------------------
   This session
   -------------------------------------------------------------------------- */

function thisSession(ctx) {
  const entries = stats.forSession(ctx.log, ctx.sid);
  if (!entries.length) {
    return empty(
      'Nothing answered yet',
      'Answer a question and stats for this visit will build up here. Earlier visits are under All time.',
      ctx,
    );
  }
  const sum = stats.summarise(entries);
  const atPass = sum.accuracy >= stats.PASS_RATE;

  const hero = h(
    'section',
    { class: 'panel hero' },
    h(
      'div',
      { class: 'hero-top' },
      h(
        'div',
        {},
        h('p', { class: 'hero-label', text: 'Correct this session' }),
        h('p', { class: 'hero-figure' }, String(percent(sum.correct, sum.answered)), h('small', { class: 'is-unit', text: '%' })),
        h('p', { class: 'hero-sub', text: `${sum.correct} of ${plural(sum.answered, 'answer')} right` }),
      ),
      atPass ? pill('good', 'At pass standard') : pill('neutral', `Pass standard is ${Math.round(stats.PASS_RATE * 100)}%`),
    ),
  );

  const running = stats.runningAccuracy(entries);
  const missedRows = stats.missed(entries).sort((a, b) => b.lastMissAt - a.lastMissAt);

  return h(
    'div',
    { class: 'dash' },
    hero,
    kpis([
      { label: 'Answered', value: String(sum.answered) },
      { label: 'Incorrect', value: String(sum.wrong) },
      { label: 'Current streak', value: String(ctx.streak), note: ctx.streak === 1 ? 'correct answer' : 'correct in a row' },
      { label: 'Best streak this session', value: String(sum.bestRun) },
      { label: 'Time practising', value: formatDuration(sum.activeMs) },
      { label: 'Average answer time', value: formatSeconds(sum.avgMs) },
    ]),
    resultsPanel(entries, ctx, 'Every answer this session'),
    entries.length >= 3
      ? panel(
          'Running accuracy',
          'This session',
          chart((el) =>
            viz.lineChart(el, running, {
              label: `Running accuracy, now ${pct(running[running.length - 1].y)}`,
              refY: stats.PASS_RATE,
              xLabel: (x) => `Answer ${x}`,
              tipLines: (p) => [pct(p.y), `after ${plural(p.x, 'answer')}`],
            }),
          ),
          legend([['is-line', PASS_LABEL]]),
        )
      : null,
    topicsPanel(entries, ctx, 'Topics this session'),
    missedPanel(missedRows, ctx, {
      title: 'Missed this session',
      note: plural(missedRows.length, 'question'),
      intro: 'Tap a question to see the right answer. Missed questions come back for another try a few questions later.',
    }),
  );
}

/* --------------------------------------------------------------------------
   All time
   -------------------------------------------------------------------------- */

function readinessHero(log) {
  const ready = stats.readiness(log);
  const { TEST_LENGTH, PASS_MARK } = stats;
  const markLeft = `${(PASS_MARK / TEST_LENGTH) * 100}%`;
  const meter = (fraction, good, withMark) =>
    h(
      'div',
      { class: withMark ? 'meter has-mark' : 'meter' },
      h(
        'div',
        { class: 'meter-track', role: 'presentation' },
        h('div', { class: `meter-fill${good ? ' is-good' : ''}`, style: `width: ${(fraction * 100).toFixed(1)}%` }),
      ),
      withMark
        ? h('span', { class: 'meter-mark', style: `left: ${markLeft}`, 'aria-hidden': 'true' }, h('span', { text: `Pass mark ${PASS_MARK}` }))
        : null,
      h('div', { class: 'meter-scale', 'aria-hidden': 'true' }, h('span', { text: '0' }), h('span', { text: String(TEST_LENGTH) })),
    );

  if (!ready.complete) {
    return h(
      'section',
      { class: 'panel hero' },
      h(
        'div',
        {},
        h('p', { class: 'hero-label', text: 'Test readiness' }),
        h('p', { class: 'hero-figure' }, String(ready.answered), h('small', { text: `of ${TEST_LENGTH} answered` })),
        h('p', {
          class: 'hero-sub',
          text: `Answer ${TEST_LENGTH - ready.answered} more and you'll see how your latest ${TEST_LENGTH} answers compare with the real theory test, which needs ${PASS_MARK} of ${TEST_LENGTH} to pass.`,
        }),
      ),
      meter(ready.answered / TEST_LENGTH, false, false),
    );
  }

  const short = PASS_MARK - ready.correct;
  return h(
    'section',
    { class: 'panel hero' },
    h(
      'div',
      { class: 'hero-top' },
      h(
        'div',
        {},
        h('p', { class: 'hero-label', text: `Your latest ${TEST_LENGTH} answers` }),
        h('p', { class: 'hero-figure' }, String(ready.correct), h('small', { text: `of ${TEST_LENGTH} correct` })),
      ),
      ready.pass ? pill('good', 'Pass') : pill('bad', short === 1 ? '1 short of a pass' : `${short} short of a pass`),
    ),
    h('p', {
      class: 'hero-sub',
      style: 'margin-top: -6px',
      text: ready.pass
        ? `That would pass the learner licence theory test, which needs ${PASS_MARK} of ${TEST_LENGTH}.`
        : `The learner licence theory test needs ${PASS_MARK} of ${TEST_LENGTH} correct.`,
    }),
    meter(ready.correct / TEST_LENGTH, ready.pass, true),
  );
}

function activityPanel(log) {
  const days = stats.byDay(log);
  const runs = stats.dayStreaks(days);
  const ordered = [...days.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  const parts = [`You've practised on ${plural(runs.daysActive, 'day')}.`];
  if (runs.longest > 1) parts.push(`Your longest run is ${runs.longest} days in a row.`);
  if (runs.current > 1) parts.push(`You're on a ${runs.current}-day run now.`);
  return panel(
    'Activity',
    'Questions answered per day',
    chart((el) =>
      viz.calendar(el, days, {
        label: `Practice calendar: ${plural(runs.daysActive, 'day')} practised`,
        tipLines: (date, row) => [
          row.answered ? plural(row.answered, 'answer') : 'No answers',
          formatDate(date),
          row.answered ? `${percent(row.correct, row.answered)}% correct` : null,
        ],
      }),
    ),
    h(
      'div',
      { class: 'legend' },
      h('span', { class: 'legend-item' }, 'Fewer'),
      h('span', { class: 'heat-scale', 'aria-hidden': 'true' }, [0, 1, 2, 3, 4].map((l) => h('i', { style: `background: var(--heat-${l})` }))),
      h('span', { class: 'legend-item' }, 'More'),
    ),
    caption(parts.join(' ')),
    viz.tableTwin(
      'Show as a table',
      ['Day', 'Answered', 'Correct'],
      ordered.map(([key, row]) => [formatDate(new Date(`${key}T00:00:00`)), String(row.answered), `${percent(row.correct, row.answered)}%`]),
    ),
  );
}

function sessionsPanel(log, ctx) {
  const sessions = stats.bySession(log);
  const recent = sessions.slice(-24);
  const last = recent.length - 1;
  const best = recent.reduce((b, r, i) => (r.answered >= 5 && (b < 0 || r.accuracy > recent[b].accuracy) ? i : b), -1);
  const every = Math.ceil(recent.length / 5);

  const rowFor = (r) => {
    const start = new Date(r.start);
    const accuracy = percent(r.correct, r.answered);
    return h(
      'tr',
      { class: r.sid === ctx.sid ? 'is-current' : null },
      h('td', { text: r.sid === ctx.sid ? `${formatDate(start)}, now` : `${formatDate(start)}, ${formatTime(start)}` }),
      h('td', { text: String(r.answered) }),
      h('td', {}, `${accuracy}%`, h('span', { class: 'mini', 'aria-hidden': 'true' }, h('i', { style: `width: ${accuracy}%` }))),
      h('td', { text: formatDuration(r.activeMs) }),
    );
  };
  const newestFirst = [...sessions].reverse();
  const tbody = h('tbody', {}, newestFirst.slice(0, 8).map(rowFor));
  const more =
    newestFirst.length > 8
      ? h('button', {
          class: 'link-btn',
          type: 'button',
          text: `Show all ${newestFirst.length} sessions`,
          onclick: (event) => {
            tbody.replaceChildren(...newestFirst.map(rowFor));
            event.currentTarget.remove();
          },
        })
      : null;

  return panel(
    'Sessions',
    plural(sessions.length, 'visit'),
    recent.length > 1
      ? chart((el) =>
          viz.columns(el, recent, {
            label: `Accuracy for your latest ${plural(recent.length, 'session')}`,
            value: (r) => r.accuracy,
            max: 1,
            // Count label positions back from the newest so the latest session is always labelled.
            axisLabel: (r, i) => ((last - i) % every === 0 ? formatShortDate(new Date(r.start)) : ''),
            valueLabel: (r, i) => (i === last || (i === best && last - best > 2) ? pct(r.accuracy) : ''),
            tipLines: (r) => [
              `${pct(r.accuracy)} correct`,
              `${formatDate(new Date(r.start))}, ${formatTime(new Date(r.start))}`,
              `${plural(r.answered, 'answer')} in ${formatDuration(r.activeMs)}`,
            ],
          }),
        )
      : null,
    recent.length > 1 ? caption('Accuracy per visit. Each page load counts as a session.') : null,
    h(
      'div',
      { class: 'table-wrap', style: 'margin-top: 12px' },
      h(
        'table',
        { class: 'data-table' },
        h(
          'thead',
          {},
          h('tr', {}, ['Session', 'Answered', 'Correct', 'Time'].map((t) => h('th', { scope: 'col', text: t }))),
        ),
        tbody,
      ),
    ),
    more,
  );
}

function trendPanel(log) {
  const windowSize = 20;
  const rolling = log.length >= windowSize;
  const points = rolling ? stats.rollingAccuracy(log, windowSize) : stats.runningAccuracy(log);
  if (points.length < 2) return null;
  return panel(
    'Accuracy trend',
    rolling ? `Averaged over ${windowSize} answers` : 'Running average',
    chart((el) =>
      viz.lineChart(el, points, {
        label: `Accuracy trend, latest ${pct(points[points.length - 1].y)}`,
        refY: stats.PASS_RATE,
        xLabel: (x) => `Answer ${x.toLocaleString('en-NZ')}`,
        tipLines: (p) =>
          rolling ? [pct(p.y), `Answers ${(p.x - windowSize + 1).toLocaleString('en-NZ')} to ${p.x.toLocaleString('en-NZ')}`] : [pct(p.y), `after ${plural(p.x, 'answer')}`],
      }),
    ),
    legend([['is-line', PASS_LABEL]]),
    viz.tableTwin(
      'Show as a table',
      ['Answer', 'Accuracy'],
      points.filter((_, i) => i % Math.ceil(points.length / 40) === 0 || i === points.length - 1).map((p) => [p.x.toLocaleString('en-NZ'), pct(p.y)]),
    ),
  );
}

function speedPanel(log) {
  const sum = stats.summarise(log);
  const buckets = stats.bySpeed(log);
  return panel(
    'Answer speed',
    'How long you took',
    chart((el) =>
      viz.columns(el, buckets, {
        label: 'Answers grouped by how long they took',
        value: (b) => b.answered,
        axisLabel: (b) => b.short,
        valueLabel: (b) => (b.answered ? b.answered.toLocaleString('en-NZ') : ''),
        tipLines: (b) => [plural(b.answered, 'answer'), b.label, b.answered ? `${percent(b.correct, b.answered)}% correct` : null],
      }),
    ),
    caption(
      sum.correct && sum.wrong
        ? `Correct answers took ${formatSeconds(sum.avgCorrectMs)} on average. Incorrect ones took ${formatSeconds(sum.avgWrongMs)}.`
        : `Your average answer takes ${formatSeconds(sum.avgMs)}.`,
    ),
    viz.tableTwin(
      'Show as a table',
      ['Time taken', 'Answered', 'Correct'],
      buckets.map((b) => [b.label, String(b.answered), b.answered ? `${percent(b.correct, b.answered)}%` : '–']),
    ),
  );
}

function hoursPanel(log) {
  const hours = stats.byHour(log);
  const peak = hours.reduce((p, row) => (row.answered > p.answered ? row : p), hours[0]);
  const bestPart = stats.bestDayPart(hours);
  const lines = [`You practise most around ${formatHour(peak.hour)}.`];
  if (bestPart) lines.push(`Your accuracy is best ${bestPart.name === 'late at night' ? '' : 'in the '}${bestPart.name} (${pct(bestPart.accuracy)}).`);
  return panel(
    'Time of day',
    'Answers per hour',
    chart((el) =>
      viz.columns(el, hours, {
        label: `Answers by hour of the day, busiest around ${formatHour(peak.hour)}`,
        value: (r) => r.answered,
        axisLabel: (r) => (r.hour % 6 === 0 ? formatHour(r.hour) : ''),
        valueLabel: (r) => (r === peak && r.answered ? r.answered.toLocaleString('en-NZ') : ''),
        tipLines: (r) => [
          plural(r.answered, 'answer'),
          `${formatHour(r.hour)} to ${formatHour((r.hour + 1) % 24)}`,
          r.answered ? `${percent(r.correct, r.answered)}% correct` : null,
        ],
      }),
    ),
    caption(lines.join(' ')),
    viz.tableTwin(
      'Show as a table',
      ['Hour', 'Answered', 'Correct'],
      hours.filter((r) => r.answered).map((r) => [formatHour(r.hour), String(r.answered), `${percent(r.correct, r.answered)}%`]),
    ),
  );
}

function dataPanel(ctx) {
  return panel(
    'Your data',
    null,
    h('p', {
      class: 'panel-caption',
      style: 'margin-top: -4px',
      text: 'Your answers are saved in this browser on this device only. Clearing your browsing data removes them.',
    }),
    h(
      'div',
      { class: 'data-actions' },
      h('button', { class: 'btn btn-quiet', type: 'button', onclick: ctx.onExport }, icon('i-download'), 'Download my data'),
      h('button', { class: 'btn btn-quiet is-danger', type: 'button', onclick: ctx.onReset }, icon('i-trash'), 'Reset stats'),
    ),
  );
}

function allTime(ctx) {
  const log = ctx.log;
  if (!log.length) {
    return h(
      'div',
      { class: 'dash' },
      empty('No stats yet', 'Every answer you give is saved on this device, and your history across visits will show up here.', ctx),
    );
  }
  const sum = stats.summarise(log);
  const sessions = stats.bySession(log);
  const runs = stats.dayStreaks(stats.byDay(log));
  const missedRows = stats
    .missed(log)
    .sort((a, b) => b.misses - a.misses || a.lastOk - b.lastOk || b.lastMissAt - a.lastMissAt)
    .slice(0, 10);
  const firstDay = new Date(log[0][T] * 1000);

  return h(
    'div',
    { class: 'dash' },
    readinessHero(log),
    kpis([
      { label: 'Answered', value: sum.answered.toLocaleString('en-NZ'), note: `since ${formatShortDate(firstDay)}` },
      { label: 'Accuracy', value: String(percent(sum.correct, sum.answered)), unit: '%', note: `${sum.correct.toLocaleString('en-NZ')} correct` },
      { label: 'Best streak', value: String(ctx.best), note: 'correct in a row' },
      { label: 'Time practising', value: formatDuration(sum.activeMs) },
      { label: 'Sessions', value: String(sessions.length), note: `about ${plural(Math.round(sum.answered / sessions.length), 'answer')} each` },
      { label: 'Days practised', value: String(runs.daysActive), note: runs.current > 1 ? `${runs.current}-day run going` : null },
    ]),
    activityPanel(log),
    sessionsPanel(log, ctx),
    trendPanel(log),
    resultsPanel(log, ctx, 'Recent answers'),
    topicsPanel(log, ctx, 'Topics'),
    h('div', { class: 'dash-grid-2' }, speedPanel(log), hoursPanel(log)),
    missedPanel(missedRows, ctx, {
      title: 'Most missed',
      note: missedRows.length === 10 ? 'Top 10' : plural(missedRows.length, 'question'),
      intro: 'The questions that have tripped you up most often. Tap one to see the answer and why.',
    }),
    dataPanel(ctx),
  );
}
