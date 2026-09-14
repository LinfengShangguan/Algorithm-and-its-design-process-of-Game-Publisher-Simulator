import { it, expect } from 'vitest';
import { advanceDay, newGame } from '../../src/simulation/game';
import { canonical, digest } from '../../src/simulation/random';
import { encode, decode } from '../../src/infrastructure/save-store';

it('playable-1 golden seed reaches year one with business overhead and stable proposal history', () => {
  let state = newGame('0123456789abcdef0123456789abcdef', '黄金发行');
  for (let d = 1; d <= 365; d++) {
    state = advanceDay(state).state;
    if (d === 123) state = decode(encode(state));
  }
  expect(state.currentDay).toBe(365);
  expect(state.weeklySettlements).toHaveLength(52);
  expect(state.monthlyReports).toHaveLength(12);
  expect(state.company.cash).toBe('463500000');
  expect(state.ledger.filter(l=>l.kind==='expense')).toHaveLength(365);
  expect(digest(canonical(state))).toBe('ae4c83e70a2005f64a2ba6aa3bff81928fd5b4fd2a8785fc8cf0dddddc8de92e');
});

it('three-year assessment autosaves once and continuation keeps the same world', () => {
  let state = newGame('11111111111111111111111111111111', '长期发行');
  let pauses = 0;
  for (let d = 1; d <= 1100; d++) {
    const wasAssessed=state.assessmentShown;
    const next = advanceDay(state); state = next.state;
    if (!wasAssessed&&state.assessmentShown) {expect(next.pause).toBe(false);expect(next.autosave).toBe(true);expect(d).toBe(1095);pauses++;}
  }
  expect(pauses).toBe(1);
  expect(state.assessmentShown).toBe(true);
},20000);
