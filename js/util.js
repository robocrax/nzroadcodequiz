export const $ = (selector, root = document) => root.querySelector(selector);

/**
 * Create an element. `attrs` takes plain attributes plus a few conveniences:
 * `class`, `text` (textContent), `style` (object or string), `dataset`, and
 * `on*` functions as event listeners. Children may be nodes, strings or falsy.
 */
export function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  append(node, children);
  return node;
}

function append(node, children) {
  for (const child of children) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) append(node, child);
    else node.append(child instanceof Node ? child : String(child));
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function s(tag, attrs = {}, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of children.flat()) if (child) node.append(child);
  return node;
}

export function icon(name, cls = 'ico') {
  return s('svg', { class: cls, 'aria-hidden': 'true' }, s('use', { href: `#${name}` }));
}

export const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo));

export function percent(part, whole) {
  return whole ? Math.round((part / whole) * 100) : 0;
}

export function plural(n, one, many = `${one}s`) {
  return `${n.toLocaleString('en-NZ')} ${n === 1 ? one : many}`;
}

/** 4.2s, 38s, 2m 05s */
export function formatSeconds(ms) {
  const sec = ms / 1000;
  if (sec < 10) return `${sec.toFixed(1)}s`;
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  return `${m}m ${String(Math.round(sec % 60)).padStart(2, '0')}s`;
}

/** 45s, 12m, 1h 05m */
export function formatDuration(ms) {
  const totalMin = Math.round(ms / 60000);
  if (ms < 60000) return `${Math.max(0, Math.round(ms / 1000))}s`;
  if (totalMin < 60) return `${totalMin}m`;
  return `${Math.floor(totalMin / 60)}h ${String(totalMin % 60).padStart(2, '0')}m`;
}

const dateFmt = new Intl.DateTimeFormat('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' });
const shortDateFmt = new Intl.DateTimeFormat('en-NZ', { day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat('en-NZ', { hour: 'numeric', minute: '2-digit' });
const monthFmt = new Intl.DateTimeFormat('en-NZ', { month: 'short' });

export const formatDate = (d) => dateFmt.format(d);
export const formatShortDate = (d) => shortDateFmt.format(d);
export const formatTime = (d) => timeFmt.format(d).replace(/\s/g, '').toLowerCase();
export const formatMonth = (d) => monthFmt.format(d);

export function formatHour(hour) {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}${hour < 12 ? 'am' : 'pm'}`;
}

/** Local calendar day key, e.g. 2026-10-04. */
export function dayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function debounce(fn, wait) {
  let timer = 0;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
