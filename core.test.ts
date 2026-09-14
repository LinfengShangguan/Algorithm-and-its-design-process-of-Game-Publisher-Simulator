import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { calendar, money, day, rateSchema, roundHalfUp } from '../../src/domain/values';
import { randomAt, canonical, digest } from '../../src/simulation/random';
import { advanceDay, newGame, TimeBudget, validateState } from '../../src/simulation/game';
import { playerView } from '../../src/application/projection';

const seed = '0123456789abcdef0123456789abcdef';
describe('values and deterministic simulation', () => {
  it('rejects invalid units and preserves exact integer money', () => {
    expect(() => money('-1')).toThrow(); expect(() => money('9223372036854775808')).toThrow();
    expect(() => day(1.5)).toThrow(); expect(() => rateSchema.parse(1_000_001)).toThrow();
    expect(roundHalfUp(5n, 2n)).toBe(3n); expect(roundHalfUp(4n, 3n)).toBe(1n);
  });
  it('handles leap days, century boundaries, month-end and weekday independently of system time', () => {
    expect(calendar('2028-02-28', 1).iso).toBe('2028-02-29');
    expect(calendar('2100-02-28', 1).iso).toBe('2100-03-01');
    expect(calendar('2027-12-31', 1).iso).toBe('2028-01-01');
    expect(calendar('2027-01-01', 2).sunday).toBe(true);
    expect(calendar('2027-01-01', 30).monthEnd).toBe(true);
  });
  it('matches an independent SHA-256 implementation and key specification', () => {
    const fields = [seed, 'foundation-1', 'module', 'project:1', 'day:0', 'purpose', '', '0'];
    const expected = createHash('sha256').update(JSON.stringify(fields)).digest('hex');
    expect(randomAt(seed, 'module', 'project:1', 'day:0', 'purpose')).toBe(Number(BigInt('0x' + expected.slice(0, 16)) >> 11n) / 2 ** 53);
    expect(digest('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(canonical({ z: 1, a: 2 })).toBe(canonical({ a: 2, z: 1 }));
  });
  it('produces identical proposals on replay without exposing hidden state', () => {
    const a = newGame(seed, '测试发行'), b = newGame(seed, '测试发行');
    expect(a).toEqual(b); expect(a.proposals.length).toBeGreaterThanOrEqual(4);expect(a.proposals.length).toBeLessThanOrEqual(8);
    const json = JSON.stringify(playerView(a, 0));
    expect(json).not.toContain('hiddenQuality'); expect(json).not.toContain('creative'); expect(json).not.toContain(seed);
    const reordered = structuredClone(a); reordered.developers.reverse();
    expect(playerView(reordered, 0)).toEqual(playerView(a, 0));
  });
  it('does not mutate previous commits and records each boundary once', () => {
    const start = newGame(seed, '测试发行'); let state = start;
    for (let i = 0; i < 31; i++) state = advanceDay(state).state;
    expect(start.currentDay).toBe(0); expect(start.weeklySettlements).toHaveLength(0);
    expect(state.weeklySettlements).toEqual([2, 9, 16, 23, 30]);
    expect(state.monthlyReports.map(r => r.month)).toEqual(['2027-01']);
    expect(state.proposals.length).toBeGreaterThan(start.proposals.length);
    state.weeklySettlements.push(day(30)); expect(() => validateState(state)).toThrow();
  });
  it('pause discards elapsed budget and speed only controls day count', () => {
    const clock = new TimeBudget(); expect(clock.consume(1000, 1)).toBe(0);
    expect(clock.consume(1_000_000, 0)).toBe(0); expect(clock.consume(1000, 1)).toBe(0);
    expect(clock.consume(1000, 1)).toBe(1);
    const faster = new TimeBudget(); expect(faster.consume(250, 8)).toBe(1);
  });
});
