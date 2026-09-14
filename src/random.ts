import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

export function digest(text: string): string { return bytesToHex(sha256(utf8ToBytes(text))); }
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error('UNSERIALIZABLE');
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const entries = Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
}
export function randomAt(seed: string, module: string, entity: string, time: string, purpose: string, record = '', index = 0, rules = 'foundation-1'): number {
  const fields = [seed, rules, module, entity, time, purpose, record, String(index)];
  if (fields.some(f => !/^[\x20-\x7e]*$/.test(f))) throw new Error('RNG_KEY_NOT_ASCII');
  const hash = digest(JSON.stringify(fields));
  return Number(BigInt(`0x${hash.slice(0, 16)}`) >> 11n) / 9007199254740992;
}
