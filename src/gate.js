// GATE: judges a pasted string against the register.
// It never rejects a string merely for starting with 0x. Anything shaped like a contract is
// matched against what the register states; only strings that are NOT contract-shaped are called malformed.
import { statedContract } from './registry.js';

const SHAPE = /^0x[0-9a-fA-F]{40}$/;

export function isContractShaped(s) {
  return SHAPE.test(s);
}

/** verdicts: idle | malformed | unverifiable | match | mismatch */
export function classify(input, reg) {
  const s = String(input == null ? '' : input).trim();
  if (!s) return { verdict: 'idle' };
  /*GATE_START*/
  if (!isContractShaped(s)) return { verdict: 'malformed' };
  const stated = statedContract(reg);
  if (stated === null) return { verdict: 'unverifiable' };
  return s.toLowerCase() === stated.toLowerCase() ? { verdict: 'match' } : { verdict: 'mismatch' };
  /*GATE_END*/
}
