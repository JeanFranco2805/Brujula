import {createLocalAIProgressStore, type LocalAIProgressStorage} from '../../src/services/local-ai-progress-store';

function makeStorage(): LocalAIProgressStorage & {values: Map<string, string>} {
  const values = new Map<string, string>();
  return {
    values,
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { values.set(key, value); },
    async removeItem(key) { values.delete(key); },
  };
}

describe('local AI progress store', () => {
  it('saves and restores completed chunks in the local per-user, per-material checkpoint', async () => {
    const storage = makeStorage();
    const progressStore = createLocalAIProgressStore(storage);
    const chunk = {summary: 'Resumen breve', keyPoints: ['Idea clave'], topics: []};

    const saved = await progressStore.save('user-1', 'pdf-1', 'fingerprint', 4, [chunk]);
    const restored = await progressStore.load('user-1', 'pdf-1');

    expect(saved).toMatchObject({completedChunks: 1, totalChunks: 4, chunks: [chunk]});
    expect(restored).toEqual(saved);
    expect(await progressStore.load('user-2', 'pdf-1')).toBeNull();
  });

  it('discards corrupted checkpoints safely', async () => {
    const storage = makeStorage();
    const progressStore = createLocalAIProgressStore(storage);
    await progressStore.save('user-1', 'pdf-1', 'fingerprint', 2, []);
    const key = [...storage.values.keys()][0];
    storage.values.set(key, '{not json');

    await expect(progressStore.load('user-1', 'pdf-1')).resolves.toBeNull();
    expect(storage.values.has(key)).toBe(false);
  });

  it('refuses impossible progress counters', async () => {
    const storage = makeStorage();
    const progressStore = createLocalAIProgressStore(storage);

    await expect(progressStore.save('user-1', 'pdf-1', 'fingerprint', 1, [
      {summary: 'Resumen', keyPoints: [], topics: []},
      {summary: 'Extra', keyPoints: [], topics: []},
    ])).rejects.toThrow('No se pudo guardar el avance');
  });
});
