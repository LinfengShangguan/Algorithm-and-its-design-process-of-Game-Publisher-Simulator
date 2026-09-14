import { z } from 'zod';

export const moneySchema = z.string().regex(/^(0|[1-9]\d*)$/).refine(v => BigInt(v) <= 9223372036854775807n, '金额越界').brand<'Money'>();
export const daySchema = z.number().int().min(0).max(365000).brand<'Day'>();
export const idSchema = z.string().regex(/^[a-z]+:[1-9]\d*$/).brand<'Id'>();
export const rateSchema = z.number().int().min(0).max(1_000_000).brand<'Rate'>();
export const scalarSchema = z.number().finite().min(0).max(1);
export type Money = z.infer<typeof moneySchema>;
export type Day = z.infer<typeof daySchema>;
export type Id = z.infer<typeof idSchema>;
export const money = (v: string | bigint): Money => moneySchema.parse(String(v));
export const day = (v: number): Day => daySchema.parse(v);
export const id = (v: string): Id => idSchema.parse(v);
export function roundHalfUp(n: bigint, d: bigint): bigint {
  if (n < 0n || d <= 0n) throw new Error('INVALID_RATIO');
  return (2n * n + d) / (2n * d);
}

// Gregorian arithmetic intentionally avoids device time, time zones and Date.
const leap = (y: number) => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
const monthDays = (y: number, m: number) => m === 2 ? (leap(y) ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31;
export function calendar(start: string, offset: number): { year: number; month: number; date: number; iso: string; monthEnd: boolean; sunday: boolean } {
  day(offset);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(start);
  if (!match) throw new Error('INVALID_DATE');
  let y = Number(match[1]), m = Number(match[2]), d = Number(match[3]);
  if (y < 1 || m < 1 || m > 12 || d < 1 || d > monthDays(y, m)) throw new Error('INVALID_DATE');
  d += offset;
  while (d > monthDays(y, m)) { d -= monthDays(y, m); if (++m > 12) { m = 1; y++; } }
  const a = Math.floor((14 - m) / 12), yy = y - a, mm = m + 12 * a - 2;
  const weekday = (d + yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) + Math.floor(31 * mm / 12)) % 7;
  return { year: y, month: m, date: d, iso: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, monthEnd: d === monthDays(y, m), sunday: weekday === 0 };
}
