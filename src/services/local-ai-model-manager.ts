export const LOCAL_AI_MODEL = {
  id: 'qwen3-1.7b-q4_k_m',
  name: 'Qwen3 1.7B · Q4_K_M',
  filename: 'Qwen3-1.7B-Q4_K_M.gguf',
  repositoryRevision: 'daeb8e2d528a760970442092f6bf1e55c3b659eb',
  sizeBytes: 1_282_439_264,
  downloadUrl: 'https://huggingface.co/ggml-org/Qwen3-1.7B-GGUF/resolve/daeb8e2d528a760970442092f6bf1e55c3b659eb/Qwen3-1.7B-Q4_K_M.gguf?download=true',
} as const;

const REQUIRED_FREE_SPACE_BYTES = LOCAL_AI_MODEL.sizeBytes + 128 * 1024 * 1024;

export type ModelDownloadProgress = {bytesWritten: number; totalBytes: number; percent: number};

export type StoredModelFile = {
  uri: string;
  exists: boolean;
  sizeBytes: number | null;
  delete(): void;
  moveTo(destination: StoredModelFile): Promise<void>;
};

export type ModelDownloadTask = {
  downloadAsync(): Promise<void>;
  cancel(): void;
  release(): void;
};

export type LocalAIModelStorage = {
  availableBytes(): number;
  ensureDirectory(): Promise<void>;
  modelFile(): StoredModelFile;
  partialFile(): StoredModelFile;
  createDownloadTask(
    url: string,
    destinationUri: string,
    onProgress: (bytesWritten: number, totalBytes: number) => void,
  ): ModelDownloadTask;
};

export class LocalAIModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalAIModelError';
  }
}

/** Keeps model download and validation independent from React Native for unit testing. */
export function createLocalAIModelManager(
  storage: LocalAIModelStorage,
  validateModel: (uri: string) => Promise<void>,
) {
  let activeTask: ModelDownloadTask | null = null;
  let activePromise: Promise<string> | null = null;

  const isInstalled = async () => {
    const file = storage.modelFile();
    if (!file.exists || file.sizeBytes !== LOCAL_AI_MODEL.sizeBytes) return false;
    try {
      await validateModel(file.uri);
      return true;
    } catch {
      file.delete();
      return false;
    }
  };

  const ensureInstalled = (onProgress?: (progress: ModelDownloadProgress) => void): Promise<string> => {
    if (activePromise) return activePromise;

    const existing = storage.modelFile();

    activePromise = (async () => {
      if (existing.exists && existing.sizeBytes === LOCAL_AI_MODEL.sizeBytes) {
        try {
          await validateModel(existing.uri);
          return existing.uri;
        } catch {
          existing.delete();
        }
      } else if (existing.exists) {
        existing.delete();
      }
      if (storage.availableBytes() < REQUIRED_FREE_SPACE_BYTES) {
        throw new LocalAIModelError('No hay espacio suficiente. Libera al menos 1,4 GB en el teléfono e inténtalo de nuevo.');
      }

      await storage.ensureDirectory();
      const partial = storage.partialFile();
      if (partial.exists) partial.delete();
      let lastReportedPercent = -1;
      const task = storage.createDownloadTask(LOCAL_AI_MODEL.downloadUrl, partial.uri, (bytesWritten, totalBytes) => {
        const knownTotal = totalBytes > 0 ? totalBytes : LOCAL_AI_MODEL.sizeBytes;
        const percent = Math.min(100, Math.max(0, Math.floor(bytesWritten / knownTotal * 100)));
        if (percent !== lastReportedPercent) {
          lastReportedPercent = percent;
          onProgress?.({bytesWritten, totalBytes: knownTotal, percent});
        }
      });
      activeTask = task;

      try {
        await task.downloadAsync();
        const downloaded = storage.partialFile();
        if (!downloaded.exists || downloaded.sizeBytes !== LOCAL_AI_MODEL.sizeBytes) {
          throw new LocalAIModelError('La descarga quedó incompleta. Comprueba tu conexión y vuelve a intentarlo.');
        }

        const destination = storage.modelFile();
        if (destination.exists) destination.delete();
        await downloaded.moveTo(destination);
        try {
          await validateModel(destination.uri);
        } catch {
          if (destination.exists) destination.delete();
          throw new LocalAIModelError('El archivo descargado no es un modelo válido. Elimínalo e inténtalo de nuevo.');
        }
        return destination.uri;
      } catch (error) {
        const incomplete = storage.partialFile();
        if (incomplete.exists) incomplete.delete();
        throw error;
      } finally {
        task.release();
        activeTask = null;
      }
    })().finally(() => {
      activePromise = null;
    });

    return activePromise;
  };

  return {
    isInstalled,
    ensureInstalled,
    cancelDownload() {
      activeTask?.cancel();
    },
    remove() {
      if (activeTask) throw new LocalAIModelError('Espera a que termine o cancela la descarga antes de eliminar el modelo.');
      const model = storage.modelFile();
      if (model.exists) model.delete();
    },
  };
}
