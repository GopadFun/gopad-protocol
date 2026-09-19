// All words shown by scripts live here or in index.html. The copy gate scans both.
export const COPY = {
  ca: {
    absent: 'Not published',
    unconfirmed: 'Awaiting confirmation',
    grab: 'Tap to grab',
    done: 'On your clipboard',
    blocked: 'Clipboard blocked, select by hand',
    checked: 'checked',
  },
  social: {
    xInert: 'X handle still under review',
    xLive: 'Gopad, X page',
    githubLive: 'Gopad, code repository',
  },
  hints: ['paste a 0x string', 'test it against the register', 'a DM is not a source'],
  verdict: {
    malformed: 'Wrong shape for a contract: expect 0x plus forty hex characters.',
    unverifiable: 'Shaped right, but the register holds no Gopad contract. Nothing can match, so treat this string as unproven.',
    match: 'Exact match: this is the contract the register holds.',
    mismatch: 'No match. The register names a different contract, so this string is not Gopad.',
  },
  state: { stated: 'Stated', absent: 'Absent', unconfirmed: 'Unconfirmed' },
  row: {
    absent: 'Nothing stated',
    unconfirmed: 'Awaiting confirmation',
    dated: 'checked',
    source: 'source',
    rpc: 'rpc',
    idLabel: 'id',
  },
  count: {
    onFile: 'on file',
    ofWhich: 'of which',
  },
};
