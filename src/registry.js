// REGISTER PATTERN: every external fact is one record with a state.
//   stated      -> value + source + dated are present and renderable
//   absent      -> nothing exists yet; rendered inert, with the date we last looked
//   unconfirmed -> something may exist but is not verified; rendered inert, dated
// Every count on the page is derived from REGISTRY.length / tally(); nothing is typed in by hand.
// To state a fact later, edit ONE record here (value + source + dated + state:'stated'), nothing else.

export const STATES = ['stated', 'absent', 'unconfirmed'];

export const REGISTRY = [
  {
    key: 'chain',
    label: 'Chain',
    state: 'stated',
    value: {
      name: 'Robinhood Chain',
      id: 4663,
      idHex: '0x1237',
      rpc: 'https://rpc.mainnet.chain.robinhood.com',
    },
    source: 'client statement 2026-09-02 batch-level',
    dated: '2026-09-02',
  },
  { key: 'contract', label: 'Contract', state: 'absent', value: null, dated: '2026-09-19' },
  // X and GitHub: stated on client confirmation (2026-09-19). Links render only while state is 'stated'.
  { key: 'x', label: 'X', state: 'stated', value: 'https://x.com/gopadfun', source: 'client confirmation 2026-09-19', dated: '2026-09-19' },
  { key: 'github', label: 'GitHub', state: 'stated', value: 'https://github.com/GopadFun/gopad-protocol', source: 'client confirmation 2026-09-19', dated: '2026-09-19' },
];

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function find(reg, key) {
  return reg.find((r) => r.key === key) || null;
}

/** A record only counts as stated when its payload is actually usable; otherwise it degrades to unconfirmed. */
export function effectiveState(rec) {
  if (!rec || !STATES.includes(rec.state)) return 'unconfirmed';
  if (rec.state !== 'stated') return rec.state;
  if (rec.value === null || rec.value === undefined || !rec.source || !ISO.test(rec.dated || '')) return 'unconfirmed';
  if (rec.key === 'contract' && !ADDRESS.test(String(rec.value))) return 'unconfirmed';
  if ((rec.key === 'x' || rec.key === 'github') && !safeUrl(rec.value)) return 'unconfirmed';
  return 'stated';
}

export function safeUrl(v) {
  try {
    const u = new URL(String(v));
    return u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

/** LINK RULE: the record stores a URL; the handle shown is derived from it, never stored. */
export function handleOf(url) {
  const u = safeUrl(url);
  if (!u) return null;
  const seg = u.pathname.split('/').filter(Boolean)[0];
  return seg ? '@' + seg : null;
}

export function tally(reg) {
  const t = { total: reg.length, stated: 0, absent: 0, unconfirmed: 0 };
  for (const r of reg) t[effectiveState(r)] += 1;
  return t;
}

export function statedContract(reg) {
  const r = find(reg, 'contract');
  return r && effectiveState(r) === 'stated' ? String(r.value) : null;
}
