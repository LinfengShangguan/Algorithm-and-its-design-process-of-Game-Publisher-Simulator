import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SaveStore, encode, decode } from '../../src/infrastructure/save-store';
import { advanceDay, newGame } from '../../src/simulation/game';

const seed = '0123456789abcdef0123456789abcdef';
describe('save transactions', () => {
  it('restores exact state and preserves the previous valid backup', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'gps-save-'));
    const store = new SaveStore(directory), start = newGame(seed, '存档测试');
    const next = advanceDay(start).state;
    await store.save(start, 'manual'); await store.save(next, 'manual');
    expect(await store.load('manual')).toEqual(next); expect(await store.load('backup')).toEqual(start);
    expect(advanceDay(await store.load('manual'))).toEqual(advanceDay(next));
  });
  it('queues concurrent writes with frozen snapshots', async () => {
    const store = new SaveStore(await mkdtemp(join(tmpdir(), 'gps-queue-')));
    const start = newGame(seed, '顺序测试'), next = advanceDay(start).state;
    await Promise.all([store.save(start, 'auto'), store.save(next, 'auto')]);
    expect((await store.load('auto')).currentDay).toBe(1);
    expect((await store.load('backup')).currentDay).toBe(0);
  });
  it('rejects tampered and truncated files without overwriting the damaged file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'gps-corrupt-')), store = new SaveStore(directory);
    const start = newGame(seed, '损坏测试'); await store.save(start, 'manual');
    const changed = encode(start).replace('500000000', '500000001'); expect(() => decode(changed)).toThrow();
    await writeFile(join(directory, 'manual.json'), '{broken');
    await expect(store.load('manual')).rejects.toThrow();
    await expect(store.save(start, 'manual')).rejects.toThrow('CORRUPT_EXISTING_SAVE');
    expect(await readFile(join(directory, 'manual.json'), 'utf8')).toBe('{broken');
  });
  it('can save after explicit backup recovery, keeping the damaged original separately', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'gps-recovery-')), store = new SaveStore(directory);
    const start = newGame(seed, '恢复测试');
    await store.save(start, 'manual'); await store.save(advanceDay(start).state, 'manual');
    await writeFile(join(directory, 'manual.json'), '{broken');
    const recovered = await store.load('backup');
    await store.save(recovered, 'manual');
    expect(await store.load('manual')).toEqual(start);
    const { readdir } = await import('node:fs/promises');
    const damaged = (await readdir(directory)).find(name => name.startsWith('manual.json.damaged-'))!;
    expect(await readFile(join(directory, damaged), 'utf8')).toBe('{broken');
  });
});
