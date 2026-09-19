// npm run gates
// 1. runs every gate against the real tree
// 2. proves each gate CAN FAIL: mutates a throwaway copy (inside .gate-scratch/) and requires the gate to trip
// exit 0 only if (1) is clean and every mutation in (2) was caught.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REAL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST_MODE = process.argv.includes('--dist');
const SITE = DIST_MODE ? path.join(REAL, 'dist') : REAL; // the tree the gates judge
if (DIST_MODE && !fs.existsSync(path.join(SITE, 'index.html'))) {
  console.error('dist/ is missing: run npm run build first');
  process.exit(1);
}
const SCRATCH = path.join(REAL, '.gate-scratch');
const rd = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (root, rel) => fs.existsSync(path.join(root, rel));
const srcFiles = (root, ext) => fs.readdirSync(path.join(root, 'src')).filter((f) => f.endsWith(ext)).map((f) => 'src/' + f);
let uniq = 0;
const load = (root, rel) => import(pathToFileURL(path.join(root, rel)).href + '?v=' + ++uniq);

/* ============================ gates: (root) => problems[] ============================ */
const gates = {};

gates.registry = async (root) => {
  const p = [];
  const { REGISTRY, STATES, effectiveState, tally } = await load(root, 'src/registry.js');
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  const keys = new Set();
  for (const r of REGISTRY) {
    if (keys.has(r.key)) p.push('duplicate key ' + r.key);
    keys.add(r.key);
    if (!STATES.includes(r.state)) p.push(r.key + ': bad state ' + r.state);
    if (!ISO.test(r.dated || '')) p.push(r.key + ': missing ISO dated');
    if (r.state === 'stated' && (r.value == null || !r.source)) p.push(r.key + ': stated without value+source');
    if (r.state !== 'stated' && r.value != null) p.push(r.key + ': ' + r.state + ' must hold no value');
  }
  const t = tally(REGISTRY);
  if (t.total !== REGISTRY.length || t.stated + t.absent + t.unconfirmed !== REGISTRY.length) p.push('tally does not add up');
  if (!/reg\.length/.test(rd(root, 'src/registry.js'))) p.push('tally must count from registry length');
  // degrade rule: a stated record with junk payload must not render as stated
  if (effectiveState({ key: 'contract', state: 'stated', value: 'junk', source: 's', dated: '2026-01-01' }) === 'stated') p.push('junk contract counted as stated');
  return p;
};

gates.counts = async (root) => {
  const p = [];
  const html = rd(root, 'index.html');
  const app = rd(root, 'src/app.js');
  for (const h of ['count-line', 'tiles', 'rows']) {
    const m = html.match(new RegExp('data-hook="' + h + '"[^>]*>([\\s\\S]*?)</(span|div|ul)>'));
    if (!m) p.push('missing slot ' + h);
    else if (m[1].trim() !== '') p.push('slot ' + h + ' has hand-typed content: ' + m[1].trim().slice(0, 30));
  }
  if (!/tally\(REGISTRY\)/.test(app)) p.push('app.js must derive counts with tally(REGISTRY)');
  if (!/t\.total/.test(app) || !/t\[key\]/.test(app)) p.push('counts must come from t.total / t[key]');
  if (/\b\d+\s+(records?|entries|rows|facts|on file)\b/i.test(html + app)) p.push('hardcoded count phrase');
  return p;
};

gates.links = async (root) => {
  const p = [];
  const html = rd(root, 'index.html');
  const { REGISTRY, effectiveState, find } = await load(root, 'src/registry.js');
  const app = rd(root, 'src/app.js');
  for (const m of html.matchAll(/\b(?:href|src)="([^"]*)"/g)) {
    const u = m[1];
    if (u === '#' || u === '') p.push('empty link');
    if (/^https?:\/\//.test(u) && !/^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|gopad\.fun)\b/.test(u)) p.push('unlisted external url ' + u);
  }
  for (const m of html.matchAll(/content="(https?:[^"]*)"/g)) if (!/gopad\.fun/.test(m[1])) p.push('meta url off-domain ' + m[1]);
  if (effectiveState(find(REGISTRY, 'x')) !== 'stated' && /(x\.com|twitter\.com)/i.test(html + app)) p.push('X url present while record not stated');
  if (/github/i.test(html)) p.push('github rendered although absent');
  if (!/effectiveState\(rec\) !== 'stated'\) return/.test(app)) p.push('renderSocial lost its stated-only guard');
  if (!/handleOf\(rec\.value\)/.test(app)) p.push('handle must be derived from stored url');
  // both icons rule: X exists at every breakpoint (no display:none on the social slot)
  const css = rd(root, 'src/site.css');
  if (/\.social[^{}]*\{[^}]*display:\s*none/.test(css) || /icon-btn[^{}]*\{[^}]*display:\s*none/.test(css)) p.push('social icon hidden at some breakpoint');
  if (/<svg[^>]*>[^]*?<\/svg>/.test(html) === false) p.push('X svg mark missing');
  if (!/M18\.244 2\.25h3\.308/.test(html)) p.push('official X mark path missing');
  if (/aria-label="[^"]*X[^"]*"/.test(html) === false) p.push('X icon has no accessible name');
  return p;
};

gates.ca = async (root) => {
  const p = [];
  const html = rd(root, 'index.html');
  const app = rd(root, 'src/app.js');
  const css = rd(root, 'src/site.css');
  const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
  if (!/data-hook="ca-copy"/.test(header)) p.push('CA slot is not in the top header');
  if (!/data-hook="ca-copy"[^>]*\bdisabled\b/.test(html)) p.push('CA button must ship disabled (inert until stated)');
  if (!/btn\.disabled = true/.test(app)) p.push('non-stated branch must disable the button');
  if (/address\.slice|\.slice\(-4\)|…|\.\.\./.test(app)) p.push('address must render in full, never truncated');
  if (!/navigator\.clipboard\.writeText\(address\)/.test(app)) p.push('copy handler missing');
  if (!/data-feedback|dataset\.feedback/.test(app) || !/COPY\.ca\.done/.test(app)) p.push('copy feedback missing');
  if (/\.ca-value[^{}]*\{[^}]*(text-overflow|white-space:\s*nowrap)/.test(css)) p.push('CA value is clipped by CSS');
  const m = css.match(/\.ca-value\s*\{[^}]*font-size:\s*([\d.]+)rem/);
  if (!m || parseFloat(m[1]) < 1) p.push('CA font must be large (>=1rem)');
  return p;
};

gates.gate = async (root) => {
  const p = [];
  const { classify } = await load(root, 'src/gate.js');
  const { COPY } = await load(root, 'src/copy.js');
  const A = '0x' + 'ab'.repeat(20);
  const B = '0x' + 'cd'.repeat(20);
  const absent = [{ key: 'contract', label: 'Contract', state: 'absent', value: null, dated: '2026-01-01' }];
  const stated = [{ key: 'contract', label: 'Contract', state: 'stated', value: A, source: 'throwaway', dated: '2026-01-01' }];
  const junk = [{ key: 'contract', label: 'Contract', state: 'stated', value: 'junk', source: 'throwaway', dated: '2026-01-01' }];
  const cases = [
    [absent, A, 'unverifiable', 'absent registry + contract-shaped 0x'],
    [absent, B.toUpperCase().replace('0X', '0x'), 'unverifiable', 'absent registry + uppercase hex body'],
    [absent, 'hello', 'malformed', 'plain text'],
    [absent, '0x12', 'malformed', 'short 0x'],
    [absent, '', 'idle', 'empty'],
    [stated, A, 'match', 'stated + exact'],
    [stated, A.toUpperCase().replace('0X', '0x'), 'match', 'stated + case-insensitive'],
    [stated, '  ' + A + '  ', 'match', 'stated + padded'],
    [stated, B, 'mismatch', 'stated + other contract-shaped'],
    [stated, '0x12', 'malformed', 'stated + short'],
    [junk, A, 'unverifiable', 'junk stated value never matches'],
  ];
  for (const [reg, input, want, label] of cases) {
    const got = classify(input, reg).verdict;
    if (got !== want) p.push(label + ': wanted ' + want + ', got ' + got);
  }
  for (const v of ['malformed', 'unverifiable', 'match', 'mismatch']) if (!COPY.verdict[v]) p.push('no copy for verdict ' + v);
  return p;
};

gates.anchors = async (root) => {
  const p = [];
  for (const f of srcFiles(root, '.js')) {
    const s = rd(root, f);
    for (const m of s.matchAll(/querySelector(?:All)?\(\s*(['"`])(.{0,12})/g)) if (!m[2].startsWith('[data-')) p.push(f + ': selector not anchored to data-: ' + m[2]);
    if (/getElementById|getElementsBy|\.closest\(\s*['"`][^\[]/.test(s)) p.push(f + ': id/class lookup');
  }
  return p;
};

const HEX = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{1,5})?\b/;
const COLOUR_FN = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i;
const NAMED = /:\s*[^;{}]*\b(?:white|black|red|blue|green|gray|grey|yellow|orange|purple|pink|cyan|magenta|silver|gold|navy|teal|lime|aqua)\b/i;
gates.palette = async (root) => {
  const p = [];
  const tokens = rd(root, 'src/tokens.css');
  const targets = ['index.html', ...srcFiles(root, '.css').filter((f) => f !== 'src/tokens.css'), ...srcFiles(root, '.js')];
  for (const f of targets) {
    let s = rd(root, f).replace(/href="#[^"]*"/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    if (HEX.test(s)) p.push(f + ': hex literal outside tokens.css');
    if (COLOUR_FN.test(s.replace(/color-mix\(/g, ''))) p.push(f + ': colour function outside tokens.css');
    if (f.endsWith('.css') && NAMED.test(s.replace(/var\(--[\w-]+\)/g, '').replace(/--[\w-]+/g, ''))) p.push(f + ': named colour');
  }
  const decls = [...tokens.matchAll(/--c-([\w-]+):\s*(#[0-9a-fA-F]{6});\s*\/\*([^*]*)\*\//g)];
  if (decls.length < 6) p.push('tokens.css: too few palette entries');
  for (const d of decls) if (!/@ x=\d+,y=\d+/.test(d[3]) || !/k-means|brightest pixel/.test(d[3])) p.push('token --c-' + d[1] + ' lacks provenance');
  if (/#[0-9a-fA-F]{3,8}\b/.test(tokens.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--c-[\w-]+:\s*#[0-9a-fA-F]{6};/g, ''))) p.push('tokens.css: stray hex');
  const fav = rd(root, 'assets/favicon.svg');
  const hexes = [...fav.matchAll(/#[0-9a-fA-F]{6}/g)].map((m) => m[0].toLowerCase());
  if (!hexes.length || hexes.some((h) => !tokens.toLowerCase().includes(h))) p.push('favicon colour is not a token');
  // dist/ carries no tooling: judge its tokens + favicon as byte-identical to source, then verify source pixels
  const own = path.join(root, 'scripts/assets.py');
  if (!fs.existsSync(own)) for (const f of ['src/tokens.css', 'assets/favicon.svg']) if (rd(root, f) !== rd(REAL, f)) p.push(f + ' differs from source');
  const py = spawnSync('python', [fs.existsSync(own) ? own : path.join(REAL, 'scripts/assets.py'), '--verify'], { encoding: 'utf8' });
  if (py.status !== 0) p.push('pixel verification failed: ' + (py.stdout + py.stderr).trim().split('\n').slice(-2).join(' | '));
  return p;
};

gates.units = async (root) => {
  const p = [];
  for (const f of ['index.html', ...srcFiles(root, '.css'), ...srcFiles(root, '.js')]) {
    const s = rd(root, f).replace(/\/\*[\s\S]*?\*\//g, '');
    if (/(?:\d|\.)ch\b/.test(s.replace(/\bcontent="[^"]*"/g, ''))) p.push(f + ': ch unit');
  }
  return p;
};

gates.motion = async (root) => {
  const p = [];
  const css = rd(root, 'src/site.css');
  const blk = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*)\}\s*$/);
  if (!blk) p.push('no prefers-reduced-motion block');
  else {
    if (!/\.falling-star\s*\{[^}]*animation:\s*none/.test(blk[1]) && !/\.star-field\s*\{[^}]*display:\s*none/.test(blk[1])) p.push('stars not disabled under reduced motion');
    if (!/transition-duration/.test(blk[1])) p.push('transitions not shortened under reduced motion');
  }
  if (!/matchMedia\('\(prefers-reduced-motion: reduce\)'\)/.test(rd(root, 'src/app.js'))) p.push('script ignores reduced motion');
  return p;
};

gates.tap = async (root) => {
  const p = [];
  const tokens = rd(root, 'src/tokens.css');
  const css = rd(root, 'src/site.css');
  if (!/--tap-min:\s*44px/.test(tokens)) p.push('--tap-min is not 44px');
  const need = { '.icon-btn': 2, '.ca-btn': 1, '.btn-hero': 2 };
  for (const [sel, n] of Object.entries(need)) {
    const m = css.match(new RegExp('(?:^|\\n)' + sel.replace('.', '\\.') + '\\s*\\{([^}]*)\\}'));
    const c = m ? (m[1].match(/var\(--tap-min\)/g) || []).length : 0;
    if (c < n) p.push(sel + ' does not enforce the 44px tap size');
  }
  return p;
};

const AI_TRACE = new RegExp(['co-authored-by', 'generated (?:with|by)', 'cl' + 'aude', 'anth' + 'ropic', 'ai-generated'].join('|'), 'i');
gates.hygiene = async (root) => {
  const p = [];
  const walk = (d, out = []) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (['node_modules', '.git', '.gate-scratch', 'brand', 'reference'].includes(e.name)) continue;
      const f = path.join(d, e.name);
      if (/^claude\.md$/i.test(e.name) || e.name.toLowerCase() === '.claude') p.push('forbidden path ' + path.relative(root, f));
      if (e.isDirectory()) walk(f, out);
      else out.push(f);
    }
    return out;
  };
  for (const f of walk(root)) {
    if (/\.(png|jpe?g|ico)$/i.test(f) || f.endsWith('gates.mjs')) continue;
    if (AI_TRACE.test(fs.readFileSync(f, 'utf8'))) p.push('attribution trace in ' + path.relative(root, f));
  }
  return p;
};

const STOP = new Set('a an the and or but of to in on at by for with from as is are was be it its this that these those you your youre we our us not no if then than so do does did can will any each every one into me my i s re t'.split(' '));
const words = (s) => (s.toLowerCase().replace(/[’']/g, '').match(/[a-z0-9]+/g) || []);
const bigrams = (w) => w.slice(1).map((x, i) => w[i] + ' ' + x);
gates.copy = async (root) => {
  const p = [];
  const html = rd(root, 'index.html');
  const { COPY } = await load(root, 'src/copy.js');
  const { REGISTRY } = await load(root, 'src/registry.js');
  const ours = [];
  const flat = (o) => Object.values(o).forEach((v) => (typeof v === 'string' ? ours.push(v) : Array.isArray(v) ? v.forEach((x) => ours.push(x)) : flat(v)));
  flat(COPY);
  for (const r of REGISTRY) {
    ours.push(r.label);
    if (r.value && r.value.name) ours.push(r.value.name);
  }
  const body = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ');
  for (const m of body.matchAll(/(?:alt|title|aria-label|placeholder)="([^"]+)"/g)) ours.push(m[1]);
  for (const m of body.matchAll(/<(?:title)>([^<]+)</g)) ours.push(m[1]);
  for (const m of body.matchAll(/<meta[^>]*(?:name|property)="(?:description|og:title|og:description|twitter:title)"[^>]*content="([^"]+)"/g)) ours.push(m[1]);
  for (const m of body.replace(/<head[\s\S]*?<\/head>/, ' ').matchAll(/>([^<>]+)</g)) if (m[1].trim()) ours.push(m[1].trim());
  const refLines = rd(exists(root, 'scripts/ref-copy.txt') ? root : REAL, 'scripts/ref-copy.txt').split('\n').filter(Boolean);
  const refWords = new Set();
  const refBi = new Set();
  for (const l of refLines) {
    const w = words(l);
    w.filter((x) => !STOP.has(x) && x.length > 1).forEach((x) => refWords.add(x));
    bigrams(w).forEach((b) => refBi.add(b));
  }
  for (const s of ours) {
    const w = words(s);
    for (const x of w) if (!STOP.has(x) && x.length > 1 && refWords.has(x)) p.push('shared word "' + x + '" in: ' + s);
    for (const b of bigrams(w)) if (refBi.has(b)) p.push('shared 2-gram "' + b + '" in: ' + s);
  }
  if (ours.length < 20) p.push('copy scan found too little text (' + ours.length + ')');
  return p;
};

gates.assets = async (root) => {
  const p = [];
  for (const f of ['assets/favicon.svg', 'assets/logo-160.png', 'assets/logo-512.png', 'assets/mountains.jpg', 'assets/banner.jpg']) if (!exists(root, f)) p.push('missing ' + f);
  if (p.length) return p;
  const fav = rd(root, 'assets/favicon.svg');
  if (!/viewBox="0 0 32 32"/.test(fav) || !/width="32"/.test(fav) || !/height="32"/.test(fav)) p.push('favicon is not 32x32');
  if (/<(text|image|use)\b/.test(fav)) p.push('favicon must be a traced path only');
  const d = (fav.match(/ d="([^"]+)"/) || [])[1] || '';
  if ((d.match(/L/g) || []).length < 20) p.push('favicon path is too coarse to be a trace');
  for (const m of d.matchAll(/(-?\d+\.?\d*) (-?\d+\.?\d*)/g)) if (+m[1] < 0 || +m[1] > 32 || +m[2] < 0 || +m[2] > 32) p.push('favicon point outside 32x32');
  for (const f of ['assets/logo-160.png', 'assets/logo-512.png']) {
    const b = fs.readFileSync(path.join(root, f));
    if (b.readUInt8(25) !== 6) p.push(f + ': not RGBA (colortype ' + b.readUInt8(25) + ')');
  }
  if (!/rel="icon" type="image\/svg\+xml" href="assets\/favicon\.svg"/.test(rd(root, 'index.html'))) p.push('favicon not linked');
  return p;
};

// dist gate (dist mode only): the deploy folder holds exactly the runtime files, every reference resolves, and it matches source.
const DEPLOY = ['index.html', 'src/tokens.css', 'src/site.css', 'src/app.js', 'src/registry.js', 'src/gate.js', 'src/copy.js', 'assets/favicon.svg', 'assets/logo-160.png', 'assets/logo-512.png', 'assets/mountains.jpg', 'assets/banner.jpg'];
gates.dist = async (root) => {
  const p = [];
  if (!DIST_MODE) return p;
  const list = (d, base = '') => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? list(path.join(d, e.name), base + e.name + '/') : [base + e.name]));
  const have = list(root).sort();
  for (const f of DEPLOY) if (!have.includes(f)) p.push('missing from dist: ' + f);
  for (const f of have) if (!DEPLOY.includes(f)) p.push('stray file in dist: ' + f);
  const refs = [];
  const html = rd(root, 'index.html');
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) refs.push(['index.html', m[1]]);
  for (const m of html.matchAll(/srcset="([^"]+)"/g)) for (const part of m[1].split(',')) refs.push(['index.html', part.trim().split(/\s+/)[0]]);
  for (const f of have.filter((x) => x.endsWith('.css'))) for (const m of rd(root, f).matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) refs.push([f, m[1]]);
  for (const f of have.filter((x) => x.endsWith('.js'))) for (const m of rd(root, f).matchAll(/from\s+['"](\.[^'"]+)['"]/g)) refs.push([f, m[1]]);
  for (const [from, ref] of refs) {
    if (/^(https?:|data:|#|mailto:)/.test(ref)) continue;
    const target = path.normalize(path.join(path.dirname(from), ref.split('#')[0].split('?')[0]));
    if (!fs.existsSync(path.join(root, target))) p.push(from + ' references missing ' + ref);
  }
  for (const f of DEPLOY) if (have.includes(f) && !fs.readFileSync(path.join(root, f)).equals(fs.readFileSync(path.join(REAL, f)))) p.push('dist/' + f + ' is out of date vs source (run npm run build)');
  return p;
};

/* ============================ mutations: prove each gate can fail ============================ */
const sub = (rel, from, to) => ({ rel, apply: (s) => { if (!s.includes(from)) throw new Error('mutation target missing: ' + from); return s.replace(from, to); } });
const mutations = {
  registry: [sub('src/registry.js', "{ key: 'github', label: 'GitHub', state: 'absent', value: null, dated: '2026-09-19' }", "{ key: 'github', label: 'GitHub', state: 'stated', value: null, dated: '2026-09-19' }")],
  counts: [sub('index.html', 'data-hook="count-line"></span>', 'data-hook="count-line">4 on file</span>'), sub('src/app.js', "t.total + ' '", "'4 '")],
  links: [sub('index.html', '<div class="social" data-hook="social">', '<div class="social" data-hook="social"><a href="https://x.com/gopad">x</a>'), sub('index.html', '<title>', '<a href="#"></a><title>')],
  ca: [sub('index.html', 'data-hook="ca-copy" disabled aria-disabled="true"', 'data-hook="ca-copy"'), sub('src/app.js', 'val.textContent = address;', 'val.textContent = address.slice(0, 6) + "…";')],
  gate: [sub('src/gate.js', '/*GATE_START*/', "if (/^0x/i.test(s)) return { verdict: 'malformed' };"), sub('src/gate.js', "if (stated === null) return { verdict: 'unverifiable' };", "if (stated === null) return { verdict: 'match' };")],
  anchors: [sub('src/app.js', "const reduceMotion", "document.querySelector('.pill');\nconst reduceMotion")],
  palette: [sub('src/site.css', 'color: var(--c-ink);\n  font: 400', 'color: #ffffff;\n  font: 400'), sub('src/tokens.css', '--c-void: #06090e', '--c-void: #06090f')],
  units: [sub('src/site.css', 'max-width: 48rem; display: flex; flex-direction: column; align-items: center; }', 'max-width: 48rem; width: 20ch; display: flex; flex-direction: column; align-items: center; }')],
  motion: [{ rel: 'src/site.css', apply: (s) => s.replace(/@media \(prefers-reduced-motion: reduce\)[\s\S]*$/, '') }],
  tap: [sub('src/site.css', 'width: var(--tap-min); height: var(--tap-min); border-radius: 999px;', 'width: 24px; height: 24px; border-radius: 999px;')],
  hygiene: [{ rel: 'CLAUDE.md', apply: () => 'notes' }, sub('src/copy.js', '// All words', '// Co-Authored-By: helper\n// All words')],
  copy: [sub('index.html', 'Run check', 'Just type it'), sub('index.html', 'Paste any 0x string.', 'Bring your idea today. Paste any 0x string.')],
  assets: [sub('assets/favicon.svg', 'viewBox="0 0 32 32"', 'viewBox="0 0 64 64"')],
  dist: [
    { rel: 'scripts/leak.py', apply: () => 'x' },
    sub('index.html', 'src/app.js', 'src/appp.js'),
    sub('src/copy.js', '// All words', '// All wordz'),
  ],
};

/* ============================ runner ============================ */
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
const skipMut = process.argv.includes('--no-mutations');
let failed = false;

async function runAll(root, names) {
  const res = {};
  for (const n of names) {
    try {
      res[n] = await gates[n](root);
    } catch (e) {
      res[n] = ['gate crashed: ' + e.message];
    }
  }
  return res;
}
const names = only ? [only] : Object.keys(gates).filter((n) => DIST_MODE || n !== 'dist');

console.log('== gates on ' + (DIST_MODE ? 'dist/ (the deploy folder)' : 'the source tree') + ' ==');
const real = await runAll(SITE, names);
for (const n of names) {
  const bad = real[n].length > 0;
  failed ||= bad;
  console.log((bad ? 'FAIL ' : 'ok   ') + n.padEnd(10) + (bad ? '\n       ' + real[n].join('\n       ') : ''));
}

if (!skipMut) {
  console.log('\n== each gate must be able to fail (mutated throwaway copies in .gate-scratch/) ==');
  fs.rmSync(SCRATCH, { recursive: true, force: true });
  let n = 0;
  for (const name of names) {
    for (const mut of mutations[name] || []) {
      const dir = path.join(SCRATCH, 'c' + ++n);
      fs.mkdirSync(dir, { recursive: true });
      for (const e of fs.readdirSync(SITE)) if (!['.gate-scratch', 'node_modules', '.git'].includes(e)) fs.cpSync(path.join(SITE, e), path.join(dir, e), { recursive: true });
      const target = path.join(dir, mut.rel);
      const before = exists(dir, mut.rel) ? fs.readFileSync(target, 'utf8') : '';
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, mut.apply(before));
      const r = (await runAll(dir, [name]))[name];
      const caught = r.length > 0;
      failed ||= !caught;
      console.log((caught ? 'caught  ' : 'MISSED  ') + name.padEnd(10) + mut.rel + '  -> ' + (r[0] || 'gate stayed green').slice(0, 110));
    }
    if (!(mutations[name] || []).length) {
      failed = true;
      console.log('NO MUTATION DEFINED for gate ' + name);
    }
  }
  fs.rmSync(SCRATCH, { recursive: true, force: true });
}

console.log(failed ? '\nGATES FAILED' : skipMut ? '\nall gates green (mutation proof skipped)' : '\nall gates green, every gate proven able to fail');
process.exit(failed ? 1 : 0);
