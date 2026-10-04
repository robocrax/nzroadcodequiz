import { h, s, clamp, startOfDay, addDays, dayKey, formatMonth } from './util.js';

/* --------------------------------------------------------------------------
   Tooltip: one element, positioned inside the stats sheet.
   -------------------------------------------------------------------------- */

let tip = null;
let tipHost = null;

export function initTooltip(tipEl, hostEl) {
  tip = tipEl;
  tipHost = hostEl;
}

export function hideTip() {
  if (tip) tip.hidden = true;
}

/** lines[0] is the value (shown strong); the rest are labels. */
function showTip(lines, x, y) {
  if (!tip || !tipHost) return;
  tip.replaceChildren(
    ...lines.filter(Boolean).map((line, i) => (i === 0 ? h('b', { text: line }) : h('div', { class: 'tip-label', text: line }))),
  );
  tip.hidden = false;
  const box = tipHost.getBoundingClientRect();
  const width = tip.offsetWidth;
  const height = tip.offsetHeight;
  let left = x - box.left - width / 2;
  let top = y - box.top - height - 12;
  left = clamp(left, 8, box.width - width - 8);
  if (top < 8) top = y - box.top + 20;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

function showTipAbove(node, lines) {
  const r = node.getBoundingClientRect();
  showTip(lines, r.left + r.width / 2, r.top);
}

/** One tab stop per chart; arrow keys move between marks and show their tooltip. */
function rove(svg, count, show, clear) {
  let index = -1;
  svg.setAttribute('tabindex', '0');
  svg.addEventListener('focus', () => {
    // Pointer users already get the tooltip from hovering; only react to keyboard focus.
    if (!svg.matches(':focus-visible')) return;
    if (index < 0) index = count - 1;
    show(index);
  });
  svg.addEventListener('blur', clear);
  svg.addEventListener('keydown', (event) => {
    const moves = { ArrowLeft: -1, ArrowRight: 1, Home: -count, End: count };
    if (!(event.key in moves)) return;
    event.preventDefault();
    if (index < 0) index = count;
    index = clamp(index + moves[event.key], 0, count - 1);
    show(index);
  });
}

/* --------------------------------------------------------------------------
   Shapes
   -------------------------------------------------------------------------- */

function roundTop(x, y, w, height, r) {
  r = Math.min(r, w / 2, height);
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + height}Z`;
}

function roundBottom(x, y, w, height, r) {
  r = Math.min(r, w / 2, height);
  return `M${x},${y}H${x + w}V${y + height - r}Q${x + w},${y + height} ${x + w - r},${y + height}H${x + r}Q${x},${y + height} ${x},${y + height - r}Z`;
}

const widthOf = (el) => Math.max(240, Math.floor(el.clientWidth));

/* --------------------------------------------------------------------------
   Results strip: one tick per answer, up for correct and down for incorrect.
   Returns how many answers fit.
   -------------------------------------------------------------------------- */

export function resultStrip(el, entries, { isCorrect, tipLines, label }) {
  const width = widthOf(el);
  const height = 60;
  const mid = 30;
  const barH = 22;
  const gap = 2;
  const barW = clamp(Math.floor((width + gap) / Math.max(entries.length, 1)) - gap, 3, 12);
  const slot = barW + gap;
  const fit = Math.max(1, Math.floor((width + gap) / slot));
  const shown = entries.slice(-fit);
  const offset = entries.length - shown.length;

  const svg = s('svg', { width, height, role: 'img', 'aria-label': label });
  svg.append(s('line', { class: 'axis', x1: 0, x2: shown.length * slot - gap, y1: mid + 0.5, y2: mid + 0.5 }));
  const bars = shown.map((entry, i) => {
    const x = i * slot;
    const ok = isCorrect(entry);
    const bar = s('path', {
      class: `bar ${ok ? 'is-good' : 'is-bad'}`,
      d: ok ? roundTop(x, mid - 1 - barH, barW, barH, 3) : roundBottom(x, mid + 2, barW, barH, 3),
    });
    svg.append(bar);
    return bar;
  });

  const activate = (i) => {
    el.classList.add('is-hovering');
    bars.forEach((b, j) => b.classList.toggle('is-active', j === i));
    showTipAbove(bars[i], tipLines(shown[i], offset + i));
  };
  const clear = () => {
    el.classList.remove('is-hovering');
    bars.forEach((b) => b.classList.remove('is-active'));
    hideTip();
  };
  shown.forEach((_, i) => {
    const hit = s('rect', { class: 'hit', x: i * slot - gap / 2, y: 0, width: slot, height });
    hit.addEventListener('pointerenter', () => activate(i));
    hit.addEventListener('pointerdown', () => activate(i));
    hit.addEventListener('pointerleave', clear);
    svg.append(hit);
  });
  rove(svg, shown.length, activate, clear);
  el.replaceChildren(svg);
  return shown.length;
}

/* --------------------------------------------------------------------------
   Line chart for accuracy (0–1) with an optional reference line.
   -------------------------------------------------------------------------- */

export function lineChart(el, points, { label, refY, refLabel, tipLines, xLabel }) {
  const width = widthOf(el);
  const height = 200;
  const pad = { t: 14, r: 46, b: 26, l: 40 };
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;

  let pts = points;
  const maxPts = Math.max(2, Math.floor(plotW / 2));
  if (pts.length > maxPts) {
    const step = (points.length - 1) / (maxPts - 1);
    pts = Array.from({ length: maxPts }, (_, i) => points[Math.round(i * step)]);
  }
  const x0 = pts[0].x;
  const x1 = pts[pts.length - 1].x;
  const sx = (x) => pad.l + (x1 === x0 ? plotW / 2 : ((x - x0) / (x1 - x0)) * plotW);
  const sy = (y) => pad.t + (1 - y) * plotH;

  const svg = s('svg', { width, height, role: 'img', 'aria-label': label });
  for (const g of [0, 0.25, 0.5, 0.75, 1]) {
    svg.append(s('line', { class: 'grid', x1: pad.l, x2: pad.l + plotW, y1: sy(g), y2: sy(g) }));
    if (g === 0 || g === 0.5 || g === 1) {
      svg.append(s('text', { x: pad.l - 8, y: sy(g) + 4, 'text-anchor': 'end', text: `${g * 100}%` }));
    }
  }
  if (refY != null) {
    svg.append(s('line', { class: 'ref', x1: pad.l, x2: pad.l + plotW, y1: sy(refY), y2: sy(refY) }));
    if (refLabel) svg.append(s('text', { x: pad.l + 6, y: sy(refY) - 6, text: refLabel }));
  }

  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('');
  if (pts.length > 1) {
    svg.append(s('path', { class: 'area', d: `${line}L${sx(x1).toFixed(1)},${sy(0)}L${sx(x0).toFixed(1)},${sy(0)}Z` }));
  }
  svg.append(s('path', { class: 'line', d: line }));

  const last = pts[pts.length - 1];
  svg.append(s('circle', { class: 'dot', cx: sx(last.x), cy: sy(last.y), r: 4.5 }));
  svg.append(s('text', { class: 't-strong', x: sx(last.x) + 9, y: sy(last.y) + 4, text: `${Math.round(last.y * 100)}%` }));

  svg.append(s('text', { x: pad.l, y: height - 6, text: xLabel(x0) }));
  if (x1 !== x0) svg.append(s('text', { x: pad.l + plotW, y: height - 6, 'text-anchor': 'end', text: xLabel(x1) }));

  const cross = s('line', { class: 'cross', y1: pad.t, y2: pad.t + plotH, visibility: 'hidden' });
  const marker = s('circle', { class: 'dot', r: 5, visibility: 'hidden' });
  svg.append(cross, marker);

  const show = (i) => {
    const p = pts[i];
    const x = sx(p.x);
    const y = sy(p.y);
    cross.setAttribute('x1', x);
    cross.setAttribute('x2', x);
    marker.setAttribute('cx', x);
    marker.setAttribute('cy', y);
    cross.setAttribute('visibility', 'visible');
    marker.setAttribute('visibility', 'visible');
    const box = svg.getBoundingClientRect();
    showTip(tipLines(p), box.left + x, box.top + y);
  };
  const clear = () => {
    cross.setAttribute('visibility', 'hidden');
    marker.setAttribute('visibility', 'hidden');
    hideTip();
  };
  const nearest = (clientX) => {
    const box = svg.getBoundingClientRect();
    const x = clientX - box.left;
    let best = 0;
    for (let i = 1; i < pts.length; i += 1) {
      if (Math.abs(sx(pts[i].x) - x) < Math.abs(sx(pts[best].x) - x)) best = i;
    }
    return best;
  };
  const overlay = s('rect', { class: 'hit', x: pad.l - 6, y: pad.t, width: plotW + 12, height: plotH, style: 'touch-action: pan-y' });
  overlay.addEventListener('pointermove', (e) => show(nearest(e.clientX)));
  overlay.addEventListener('pointerdown', (e) => show(nearest(e.clientX)));
  overlay.addEventListener('pointerleave', clear);
  svg.append(overlay);
  rove(svg, pts.length, show, clear);
  el.replaceChildren(svg);
}

/* --------------------------------------------------------------------------
   Columns: one value per category, rounded at the data end.
   -------------------------------------------------------------------------- */

export function columns(el, data, { label, value, max, axisLabel, valueLabel, cls, tipLines, labelEvery = 1, height = 170 }) {
  const width = widthOf(el);
  const pad = { t: 22, b: 24 };
  const plotH = height - pad.t - pad.b;
  const band = width / data.length;
  const barW = clamp(Math.floor(band * 0.64), 3, 24);
  const top = max ?? Math.max(1, ...data.map(value));
  const base = pad.t + plotH;

  const svg = s('svg', { width, height, role: 'img', 'aria-label': label });
  svg.append(s('line', { class: 'axis', x1: 0, x2: width, y1: base + 0.5, y2: base + 0.5 }));

  const bars = data.map((d, i) => {
    const v = value(d);
    const barH = v > 0 ? Math.max(3, (v / top) * plotH) : 0;
    const x = Math.round(i * band + (band - barW) / 2);
    const y = base - barH;
    const bar = s('path', { class: `bar ${cls ? cls(d, i) : ''}`, d: barH ? roundTop(x, y, barW, barH, 4) : '' });
    svg.append(bar);
    const text = valueLabel?.(d, i);
    if (text) svg.append(s('text', { class: 't-strong', x: x + barW / 2, y: y - 6, 'text-anchor': 'middle', text }));
    if (axisLabel && i % labelEvery === 0) {
      const t = axisLabel(d, i);
      if (t) svg.append(s('text', { x: x + barW / 2, y: height - 6, 'text-anchor': 'middle', text: t }));
    }
    return { bar, x: x + barW / 2, y: barH ? y : base };
  });

  const activate = (i) => {
    el.classList.add('is-hovering');
    bars.forEach((b, j) => b.bar.classList.toggle('is-active', j === i));
    const box = svg.getBoundingClientRect();
    showTip(tipLines(data[i], i), box.left + bars[i].x, box.top + bars[i].y);
  };
  const clear = () => {
    el.classList.remove('is-hovering');
    bars.forEach((b) => b.bar.classList.remove('is-active'));
    hideTip();
  };
  data.forEach((_, i) => {
    const hit = s('rect', { class: 'hit', x: i * band, y: 0, width: band, height: base });
    hit.addEventListener('pointerenter', () => activate(i));
    hit.addEventListener('pointerdown', () => activate(i));
    hit.addEventListener('pointerleave', clear);
    svg.append(hit);
  });
  rove(svg, data.length, activate, clear);
  el.replaceChildren(svg);
}

/* --------------------------------------------------------------------------
   Activity calendar: weeks as columns, Monday at the top.
   -------------------------------------------------------------------------- */

export function calendar(el, days, { label, tipLines }) {
  const width = widthOf(el);
  const labelW = 30;
  const cell = 13;
  const gap = 3;
  const step = cell + gap;
  const top = 18;
  const weeks = clamp(Math.floor((width - labelW + gap) / step), 8, 53);
  const today = startOfDay(new Date());
  const weekday = (today.getDay() + 6) % 7;
  const first = addDays(today, -weekday - (weeks - 1) * 7);

  const cells = [];
  for (let w = 0; w < weeks; w += 1) {
    for (let d = 0; d < 7; d += 1) {
      const date = addDays(first, w * 7 + d);
      if (date > today) continue;
      cells.push({ date, w, d, row: days.get(dayKey(date)) ?? { answered: 0, correct: 0 } });
    }
  }
  const counts = cells.map((c) => c.row.answered).filter(Boolean).sort((a, b) => a - b);
  const quantile = (p) => counts[Math.min(counts.length - 1, Math.floor(p * counts.length))] ?? 0;
  const cuts = [quantile(0.25), quantile(0.5), quantile(0.75)];
  const level = (n) => (n === 0 ? 0 : n <= cuts[0] ? 1 : n <= cuts[1] ? 2 : n <= cuts[2] ? 3 : 4);

  const height = top + 7 * step;
  const svg = s('svg', { width: labelW + weeks * step, height, role: 'img', 'aria-label': label });
  ['Mon', 'Wed', 'Fri'].forEach((name, i) => {
    svg.append(s('text', { x: 0, y: top + i * 2 * step + cell - 2, text: name }));
  });
  let lastMonth = -1;
  for (let w = 0; w < weeks; w += 1) {
    const monday = addDays(first, w * 7);
    if (monday.getMonth() !== lastMonth && monday.getDate() <= 7) {
      svg.append(s('text', { x: labelW + w * step, y: 11, text: formatMonth(monday) }));
    }
    lastMonth = monday.getMonth();
  }

  const rects = cells.map((c) => {
    const rect = s('rect', {
      class: 'cell',
      x: labelW + c.w * step,
      y: top + c.d * step,
      width: cell,
      height: cell,
      rx: 3,
      style: `fill: var(--heat-${level(c.row.answered)})`,
    });
    svg.append(rect);
    return rect;
  });

  const activate = (i) => {
    rects.forEach((r, j) => r.classList.toggle('is-active', j === i));
    showTipAbove(rects[i], tipLines(cells[i].date, cells[i].row));
  };
  const clear = () => {
    rects.forEach((r) => r.classList.remove('is-active'));
    hideTip();
  };
  cells.forEach((c, i) => {
    const hit = s('rect', { class: 'hit', x: labelW + c.w * step - gap / 2, y: top + c.d * step - gap / 2, width: step, height: step });
    hit.addEventListener('pointerenter', () => activate(i));
    hit.addEventListener('pointerdown', () => activate(i));
    hit.addEventListener('pointerleave', clear);
    svg.append(hit);
  });
  rove(svg, cells.length, activate, clear);
  el.replaceChildren(svg);
  return weeks;
}

/* --------------------------------------------------------------------------
   Horizontal bars (HTML) with direct labels, e.g. accuracy by topic.
   -------------------------------------------------------------------------- */

export function barList(el, rows, { name, fraction, value, note, passAt }) {
  el.replaceChildren(
    h(
      'ul',
      { class: 'bars' },
      rows.map((row, i) =>
        h(
          'li',
          { class: 'bar-row' },
          h('span', { class: 'bar-name', text: name(row) }),
          h('span', { class: 'bar-value' }, value(row), h('small', { text: note(row) })),
          h(
            'span',
            { class: 'bar-track', 'aria-hidden': 'true' },
            h('span', { class: 'bar-fill', style: `width: ${(fraction(row) * 100).toFixed(1)}%; --i: ${i}` }),
            passAt != null ? h('span', { class: 'bar-pass', style: `left: ${(passAt * 100).toFixed(2)}%` }) : null,
          ),
        ),
      ),
    ),
  );
}

/* --------------------------------------------------------------------------
   Table twin for any chart: the same numbers, readable without hovering.
   -------------------------------------------------------------------------- */

export function tableTwin(summary, headers, rows) {
  return h(
    'details',
    { class: 'viz-table' },
    h('summary', { text: summary }),
    h(
      'div',
      { class: 'table-wrap' },
      h(
        'table',
        { class: 'data-table' },
        h('thead', {}, h('tr', {}, headers.map((t) => h('th', { scope: 'col', text: t })))),
        h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c) => h('td', { text: c }))))),
      ),
    ),
  );
}
