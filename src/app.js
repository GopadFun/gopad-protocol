import { REGISTRY, find, effectiveState, handleOf, safeUrl, tally, statedContract } from './registry.js';
import { classify } from './gate.js';
import { COPY } from './copy.js';

// Anchor rule: script only ever reaches the page through data-hook attributes we own.
const hook = (name) => document.querySelector('[data-hook="' + name + '"]');
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const el = (tag, attrs = {}, text) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text !== undefined) n.textContent = text;
  return n;
};

/* ---------- chain chip (from registry) ---------- */
function renderChain() {
  const rec = find(REGISTRY, 'chain');
  const node = hook('chain');
  if (!node || !rec || effectiveState(rec) !== 'stated') return;
  node.textContent = rec.value.name + ' · ' + rec.value.id;
}

/* ---------- contract slot: inert until stated, both branches live ---------- */
function renderContract() {
  const rec = find(REGISTRY, 'contract');
  const state = effectiveState(rec);
  const box = hook('ca');
  const btn = hook('ca-copy');
  const val = hook('ca-value');
  const hint = hook('ca-hint');
  const live = hook('ca-live');
  box.dataset.state = state;
  if (state !== 'stated') {
    btn.disabled = true;
    btn.setAttribute('aria-disabled', 'true');
    val.textContent = state === 'absent' ? COPY.ca.absent : COPY.ca.unconfirmed;
    hint.textContent = COPY.ca.checked + ' ' + (rec ? rec.dated : '');
    return;
  }
  const address = statedContract(REGISTRY);
  btn.disabled = false;
  btn.removeAttribute('aria-disabled');
  btn.setAttribute('aria-label', address + '. ' + COPY.ca.grab);
  val.textContent = address;
  hint.textContent = COPY.ca.grab;
  let timer = 0;
  btn.addEventListener('click', async () => {
    let ok = true;
    try {
      await navigator.clipboard.writeText(address);
    } catch {
      ok = false;
    }
    box.dataset.feedback = ok ? 'done' : 'blocked';
    hint.textContent = ok ? COPY.ca.done : COPY.ca.blocked;
    live.textContent = hint.textContent;
    clearTimeout(timer);
    timer = setTimeout(() => {
      delete box.dataset.feedback;
      hint.textContent = COPY.ca.grab;
      live.textContent = '';
    }, 1600);
  });
}

/* ---------- social: an icon becomes a link only when its record is stated ---------- */
const GITHUB_MARK = 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.921.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12';

function markSvg(d) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', d);
  svg.appendChild(path);
  return svg;
}

function renderSocial() {
  linkIcon('x', 'social-x', COPY.social.xLive);
  linkIcon('github', 'social-github', COPY.social.githubLive, GITHUB_MARK);
}

function linkIcon(key, hookName, label, markPath) {
  const rec = find(REGISTRY, key);
  if (effectiveState(rec) !== 'stated') return;
  const url = safeUrl(rec.value);
  const a = el('a', {
    class: 'icon-btn',
    href: url.href,
    target: '_blank',
    rel: 'noopener noreferrer',
    'data-hook': hookName,
    'aria-label': label + ' ' + handleOf(rec.value),
  });
  const slot = hook(hookName);
  if (slot) {
    while (slot.firstChild) a.appendChild(slot.firstChild);
    slot.replaceWith(a);
    return;
  }
  a.append(el('span', { class: 'glow', 'aria-hidden': 'true' }), markSvg(markPath));
  hook('social').appendChild(a);
}

/* ---------- register: rows + tiles, every count from the registry ---------- */
function renderRegister() {
  const t = tally(REGISTRY);
  hook('count-line').textContent = t.total + ' ' + COPY.count.onFile + ', ' + COPY.count.ofWhich + ' ' + t.stated + ' ' + COPY.state.stated.toLowerCase() + '.';
  const tiles = hook('tiles');
  for (const key of ['stated', 'absent', 'unconfirmed']) {
    const tile = el('div', { class: 'tile', 'data-tile': key });
    tile.append(el('span', { class: 'tile-n' }, String(t[key])), el('span', { class: 'tile-l' }, COPY.state[key]));
    tiles.appendChild(tile);
  }
  const rows = hook('rows');
  for (const rec of REGISTRY) {
    const state = effectiveState(rec);
    const li = el('li', { class: 'row', 'data-row': rec.key, 'data-state': state });
    const main = el('div', { class: 'row-main' });
    main.appendChild(el('p', { class: 'row-label' }, rec.label));
    const detail = el('div', { class: 'row-detail' });
    if (state === 'stated' && rec.key === 'chain') {
      detail.append(
        el('p', { class: 'row-value' }, rec.value.name + ' · ' + COPY.row.idLabel + ' ' + rec.value.id + ' (' + rec.value.idHex + ')'),
        el('p', { class: 'row-mono' }, COPY.row.rpc + ' ' + rec.value.rpc),
        el('p', { class: 'row-mono' }, COPY.row.source + ' ' + rec.source)
      );
    } else if (state === 'stated') {
      detail.appendChild(el('p', { class: 'row-mono' }, String(rec.value)));
    } else {
      detail.appendChild(el('p', { class: 'row-value muted' }, state === 'absent' ? COPY.row.absent : COPY.row.unconfirmed));
    }
    main.appendChild(detail);
    const side = el('div', { class: 'row-side' });
    side.append(
      el('span', { class: 'chip', 'data-chip': state }, COPY.state[state]),
      el('time', { class: 'row-date', datetime: rec.dated }, (state === 'stated' ? '' : COPY.row.dated + ' ') + rec.dated)
    );
    li.append(main, side);
    rows.appendChild(li);
  }
}

/* ---------- checker ---------- */
function renderChecker() {
  const form = hook('checker');
  const input = hook('input');
  const out = hook('verdict');
  const run = () => {
    const { verdict } = classify(input.value, REGISTRY);
    out.dataset.verdict = verdict;
    if (verdict === 'idle') {
      out.hidden = true;
      out.textContent = '';
      return;
    }
    out.hidden = false;
    out.textContent = COPY.verdict[verdict];
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    run();
  });
  input.addEventListener('input', run);
}

/* ---------- typewriter placeholder (reference cadence: 65ms type / 35ms erase / 900ms hold / 350ms gap) ---------- */
function typewriter() {
  const input = hook('input');
  const hints = COPY.hints;
  input.placeholder = hints[0];
  if (reduceMotion()) return;
  let i = 0;
  let n = 0;
  let erasing = false;
  let timer = 0;
  const step = () => {
    if (input.value) {
      input.placeholder = '';
      timer = setTimeout(step, 400);
      return;
    }
    const phrase = hints[i % hints.length];
    if (erasing) {
      n -= 1;
      input.placeholder = phrase.slice(0, n);
      if (n <= 0) {
        erasing = false;
        i += 1;
        timer = setTimeout(step, 350);
      } else timer = setTimeout(step, 35);
      return;
    }
    n += 1;
    input.placeholder = phrase.slice(0, n);
    if (n >= phrase.length) {
      erasing = true;
      timer = setTimeout(step, 900);
    } else timer = setTimeout(step, 65);
  };
  input.placeholder = '';
  timer = setTimeout(step, 300);
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
    if (e.matches) {
      clearTimeout(timer);
      input.placeholder = hints[0];
    }
  });
}

/* ---------- falling stars: 34 streaks, ranges measured off the reference ---------- */
function stars() {
  const field = hook('stars');
  let s = 0x9e3779b9;
  const rnd = () => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x297a2d39) | 0;
    return ((s >>> 0) % 100000) / 100000;
  };
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 34; i += 1) {
    const b = el('span', { class: 'falling-star', 'data-tone': String(i % 3) });
    b.style.top = (-4 - rnd() * 22).toFixed(2) + '%';
    b.style.left = (rnd() * 98).toFixed(2) + '%';
    b.style.height = (10 + rnd() * 14).toFixed(1) + 'px';
    b.style.width = rnd() > 0.78 ? '2.5px' : '1.5px';
    b.style.setProperty('--fall-dist', (85 + rnd() * 45).toFixed(0) + 'vh');
    b.style.animationDelay = (-rnd() * 26).toFixed(2) + 's';
    b.style.animationDuration = (9 + rnd() * 14).toFixed(2) + 's';
    frag.appendChild(b);
  }
  field.appendChild(frag);
}

renderChain();
renderContract();
renderSocial();
renderRegister();
renderChecker();
typewriter();
stars();
