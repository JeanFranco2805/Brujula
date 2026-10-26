import {createLocalAIModelManager, LOCAL_AI_MODEL, LocalAIModelError, type LocalAIModelStorage, type StoredModelFile} from '../../src/services/local-ai-model-manager';

function makeStorage(availableBytes = 2_000_000_000) {
  const model = makeFile('model.gguf');
  const partial = makeFile('model.gguf.part');
  let taskReleased = false;
  let taskCancelled = false;
  let requestedUrl = '';
  let taskProgress: ((written: number, total: number) => void) | undefined;
  let downloadedSize: number = LOCAL_AI_MODEL.sizeBytes;
  let holdDownload: (() => void) | undefined;

  const storage: LocalAIModelStorage = {
    availableBytes: () => availableBytes,
    ensureDirectory: async () => undefined,
    modelFile: () => model,
    partialFile: () => partial,
    createDownloadTask(url, _destinationUri, onProgress) {
      requestedUrl = url;
      taskProgress = onProgress;
      return {
        downloadAsync: () => new Promise<void>((resolve, reject) => {
          holdDownload = () => {
            if (taskCancelled) {
              reject(new Error('cancelled'));
              return;
            }
            partial.exists = true;
            partial.sizeBytes = downloadedSize;
            taskProgress?.(downloadedSize, LOCAL_AI_MODEL.sizeBytes);
            resolve();
          };
          queueMicrotask(() => holdDownload?.());
        }),
        cancel: () => { taskCancelled = true; },
        release: () => { taskReleased = true; },
      };
    },
  };

  return {
    storage,
    model,
    partial,
    state: () => ({taskReleased, taskCancelled, requestedUrl}),
    setAvailableBytes: (value: number) => { availableBytes = value; },
    setDownloadedSize: (value: number) => { downloadedSize = value; },
  };
}

function makeFile(uri: string): StoredModelFile & {sizeBytes: number | null} {
  const file = {
    uri,
    exists: false,
    sizeBytes: null as number | null,
    delete() {
      this.exists = false;
      this.sizeBytes = null;
    },
    async moveTo(destination: StoredModelFile) {
      const target = destination as ReturnType<typeof makeFile>;
      target.exists = this.exists;
      target.sizeBytes = this.sizeBytes;
      this.exists = false;
      this.sizeBytes = null;
    },
  };
  return file;
}

describe('local AI model manager', () => {
  it('downloads the pinned model to a partial file, verifies its size and model format, then installs it', async () => {
    const fake = makeStorage();
    const validate = jest.fn(async () => undefined);
    const manager = createLocalAIModelManager(fake.storage, validate);
    const onProgress = jest.fn();

    const uri = await manager.ensureInstalled(onProgress);

    expect(uri).toBe('model.gguf');
    await expect(manager.isInstalled()).resolves.toBe(true);
    expect(validate).toHaveBeenCalledWith('model.gguf');
    expect(fake.state().requestedUrl).toContain(LOCAL_AI_MODEL.repositoryRevision);
    expect(fake.state().requestedUrl).toMatch(/^https:\/\//);
    expect(fake.state().taskReleased).toBe(true);
    expect(onProgress).toHaveBeenCalledWith({bytesWritten: LOCAL_AI_MODEL.sizeBytes, totalBytes: LOCAL_AI_MODEL.sizeBytes, percent: 100});
    expect(fake.partial.exists).toBe(false);
  });

  it('refuses a download when the phone does not have enough free storage', async () => {
    const fake = makeStorage(LOCAL_AI_MODEL.sizeBytes);
    const manager = createLocalAIModelManager(fake.storage, async () => undefined);

    await expect(manager.ensureInstalled()).rejects.toThrow('No hay espacio suficiente');
    expect(fake.state().requestedUrl).toBe('');
  });

  it('deletes incomplete downloads and does not report them as installed', async () => {
    const fake = makeStorage();
    fake.setDownloadedSize(LOCAL_AI_MODEL.sizeBytes - 1);
    const manager = createLocalAIModelManager(fake.storage, async () => undefined);

    await expect(manager.ensureInstalled()).rejects.toThrow('incompleta');
    expect(fake.partial.exists).toBe(false);
    await expect(manager.isInstalled()).resolves.toBe(false);
    expect(fake.state().taskReleased).toBe(true);
  });

  it('removes a downloaded file when llama.cpp rejects its model format', async () => {
    const fake = makeStorage();
    const manager = createLocalAIModelManager(fake.storage, async () => { throw new Error('invalid GGUF'); });

    await expect(manager.ensureInstalled()).rejects.toThrow('modelo válido');
    expect(fake.model.exists).toBe(false);
  });

  it('can remove a previously installed model', () => {
    const fake = makeStorage();
    fake.model.exists = true;
    fake.model.sizeBytes = LOCAL_AI_MODEL.sizeBytes;
    const manager = createLocalAIModelManager(fake.storage, async () => undefined);

    manager.remove();

    return expect(manager.isInstalled()).resolves.toBe(false);
  });
});
