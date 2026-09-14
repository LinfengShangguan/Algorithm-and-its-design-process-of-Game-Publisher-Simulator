import { mkdir, open, readFile, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { GameState } from '../domain/state';
import { validateState, migrateState } from '../simulation/game';
import { canonical, digest } from '../simulation/random';

const envelopeSchema = z.strictObject({ format: z.literal('gps-save-1'), checksum: z.string().regex(/^[a-f0-9]{64}$/), state: z.unknown() });
export function encode(state: GameState): string {
  validateState(state);
  return JSON.stringify({ format: 'gps-save-1', checksum: digest(canonical(state)), state });
}
export function decode(data: string): GameState {
  const envelope = envelopeSchema.parse(JSON.parse(data));
  if (digest(canonical(envelope.state)) !== envelope.checksum) throw new Error('CHECKSUM_MISMATCH');
  return migrateState(envelope.state);
}
export class SaveStore {
  private queue: Promise<unknown> = Promise.resolve();
  private recoveryAuthorized = false;
  constructor(private readonly directory: string) {}
  private file(slot: 'manual' | 'auto' | 'backup') { return join(this.directory, `${slot}.json`); }
  async status() {
    const exists = async (slot: 'manual' | 'auto' | 'backup') => { try { await stat(this.file(slot)); return true; } catch { return false; } };
    return { manual: await exists('manual'), auto: await exists('auto'), backup: await exists('backup') };
  }
  async load(slot: 'manual' | 'auto' | 'backup'): Promise<GameState> {
    await this.queue.catch(() => undefined);
    const path = this.file(slot);
    if ((await stat(path)).size > 100 * 1024 * 1024) throw new Error('SAVE_TOO_LARGE');
    const loaded = decode(await readFile(path, 'utf8'));
    if (slot === 'backup') this.recoveryAuthorized = true;
    return loaded;
  }
  save(state: GameState, slot: 'manual' | 'auto'): Promise<void> {
    const data = encode(state); // freeze at request time, not later queue execution
    const task = this.queue.catch(() => undefined).then(async () => {
      await mkdir(this.directory, { recursive: true });
      const target = this.file(slot), temp = `${target}.candidate`;
      const writeVerified = async (path: string, content: string) => {
        const handle = await open(path, 'w');
        try { await handle.writeFile(content, 'utf8'); await handle.sync(); } finally { await handle.close(); }
        decode(await readFile(path, 'utf8'));
      };
      await writeVerified(temp, data);
      let old: string | undefined;
      try { old = await readFile(target, 'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      if (old !== undefined) {
        let valid = true;
        try { decode(old); } catch { valid = false; }
        if (!valid) {
          if (!this.recoveryAuthorized) throw new Error('CORRUPT_EXISTING_SAVE');
          await rename(target, `${target}.damaged-${randomUUID()}`);
        } else {
          const backupTemp = `${this.file('backup')}.candidate`;
          await writeVerified(backupTemp, old);
          await rename(backupTemp, this.file('backup'));
        }
      }
      await rename(temp, target);
    });
    this.queue = task;
    return task;
  }
}
