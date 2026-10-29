import {Directory, File, Paths} from 'expo-file-system';
import {initLlama, loadLlamaModelInfo} from 'llama.rn';
import type {StudyPreferences} from '../types';
import {analyzeWithLocalAI, type LocalAIChunkAnalysis, type LocalAIProgress} from './local-ai-study-planner';
import {createLocalAIModelManager, LOCAL_AI_MODEL, type LocalAIModelStorage, type ModelDownloadProgress, type StoredModelFile} from './local-ai-model-manager';

const modelDirectory = new Directory(Paths.document, 'brujula-local-ai');

function createStoredFile(uri: string): StoredModelFile {
  const file = new File(uri);
  return {
    uri: file.uri,
    get exists() { return file.exists; },
    get sizeBytes() { return file.exists ? file.info().size ?? null : null; },
    delete: () => { if (file.exists) file.delete(); },
    moveTo: async destination => { await file.move(new File(destination.uri)); },
  };
}

const storage: LocalAIModelStorage = {
  availableBytes: () => Paths.availableDiskSpace,
  async ensureDirectory() {
    if (!modelDirectory.exists) modelDirectory.create({idempotent: true, intermediates: true});
  },
  modelFile: () => createStoredFile(new File(modelDirectory, LOCAL_AI_MODEL.filename).uri),
  partialFile: () => createStoredFile(new File(modelDirectory, LOCAL_AI_MODEL.filename + '.part').uri),
  createDownloadTask(url, destinationUri, onProgress) {
    const task = File.createDownloadTask(url, new File(destinationUri), {
      onProgress: progress => onProgress(progress.bytesWritten, progress.totalBytes),
    });
    return {
      async downloadAsync() {
        const result = await task.downloadAsync();
        if (!result) throw new Error('La descarga se canceló antes de terminar.');
      },
      cancel: () => task.cancel(),
      release: () => task.release(),
    };
  },
};

const modelManager = createLocalAIModelManager(storage, async uri => {
  await loadLlamaModelInfo(uri);
});

export async function isLocalAIModelInstalled() {
  return modelManager.isInstalled();
}

export async function ensureLocalAIModelInstalled(onProgress?: (progress: ModelDownloadProgress) => void) {
  return modelManager.ensureInstalled(progress => {
    onProgress?.(progress);
  });
}

export function cancelLocalAIModelDownload() {
  modelManager.cancelDownload();
}

export function removeLocalAIModel() {
  modelManager.remove();
}

export async function generateLocalAIAnalysis(
  sourceText: string,
  preferences: StudyPreferences,
  pageCount: number | undefined,
  languageTag: string,
  onProgress?: (progress: LocalAIProgress) => void,
  resume?: {
    resumeAnalyses?: readonly unknown[];
    onCheckpoint?: (checkpoint: {completedChunks: number; totalChunks: number; analyses: LocalAIChunkAnalysis[]}) => void | Promise<void>;
  },
) {
  return analyzeWithLocalAI(sourceText, {
    preferences,
    pageCount,
    languageTag,
    modelName: LOCAL_AI_MODEL.name,
    onProgress,
    ...resume,
    createContext: async reportLoadProgress => {
      const modelPath = await modelManager.ensureInstalled();
      onProgress?.({stage: 'loading-model', percent: 0});
      const context = await initLlama({
        model: modelPath,
        n_ctx: 4096,
        n_batch: 512,
        use_mmap: true,
        use_mlock: false,
        n_gpu_layers: 0,
      }, percent => {
        const normalizedPercent = Math.floor(percent * 100);
        reportLoadProgress(Math.max(0, Math.min(99, normalizedPercent)));
      });
      return context;
    },
  });
}
