import AsyncStorage from '@react-native-async-storage/async-storage';
import {LOCAL_AI_MODEL} from './local-ai-model-manager';
import type {LocalAIChunkAnalysis} from './local-ai-study-planner';
import type {StudyPreferences} from '../types';

const STORAGE_PREFIX = 'brujula.local-ai-progress.v1.';
const RECORD_VERSION = 1;
const ANALYSIS_PIPELINE_VERSION = 2;

export type LocalAIAnalysisProgress = {
  version: number;
  fingerprint: string;
  totalChunks: number;
  completedChunks: number;
  chunks: LocalAIChunkAnalysis[];
  updatedAt: string;
};

export type LocalAIProgressStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

function storageKey(ownerId: string, materialId: string) {
  return `${STORAGE_PREFIX}${encodeURIComponent(ownerId)}.${encodeURIComponent(materialId)}`;
}

export function createLocalAIAnalysisFingerprint(materialId: string, preferences: StudyPreferences, languageTag: string) {
  return JSON.stringify({
    pipeline: ANALYSIS_PIPELINE_VERSION,
    materialId,
    languageTag,
    modelId: LOCAL_AI_MODEL.id,
    preferences,
  });
}

/** Saves each completed analysis chunk on this device so interrupted work can resume. */
export function createLocalAIProgressStore(storage: LocalAIProgressStorage) {
  return {
    async load(ownerId: string, materialId: string): Promise<LocalAIAnalysisProgress | null> {
      const key = storageKey(ownerId, materialId);
      const serialized = await storage.getItem(key);
      if (!serialized) return null;

      try {
        const parsed: unknown = JSON.parse(serialized);
        if (isValidProgress(parsed)) return parsed;
      } catch {
        // A truncated local checkpoint is safe to discard; the source PDF remains intact.
      }

      await storage.removeItem(key).catch(() => undefined);
      return null;
    },

    async save(
      ownerId: string,
      materialId: string,
      fingerprint: string,
      totalChunks: number,
      chunks: LocalAIChunkAnalysis[],
    ): Promise<LocalAIAnalysisProgress> {
      if (!fingerprint || !Number.isInteger(totalChunks) || totalChunks < 1 || chunks.length > totalChunks) {
        throw new Error('No se pudo guardar el avance del análisis.');
      }
      const progress: LocalAIAnalysisProgress = {
        version: RECORD_VERSION,
        fingerprint,
        totalChunks,
        completedChunks: chunks.length,
        chunks,
        updatedAt: new Date().toISOString(),
      };
      await storage.setItem(storageKey(ownerId, materialId), JSON.stringify(progress));
      return progress;
    },

    remove(ownerId: string, materialId: string) {
      return storage.removeItem(storageKey(ownerId, materialId));
    },
  };
}

function isValidProgress(value: unknown): value is LocalAIAnalysisProgress {
  if (!isRecord(value)) return false;
  return value.version === RECORD_VERSION
    && typeof value.fingerprint === 'string'
    && Number.isInteger(value.totalChunks)
    && Number(value.totalChunks) > 0
    && Number.isInteger(value.completedChunks)
    && Number(value.completedChunks) >= 0
    && Number(value.completedChunks) <= Number(value.totalChunks)
    && Array.isArray(value.chunks)
    && value.chunks.length === value.completedChunks
    && value.chunks.every(isChunkAnalysisEnvelope)
    && typeof value.updatedAt === 'string'
    && Number.isFinite(Date.parse(value.updatedAt));
}

function isChunkAnalysisEnvelope(value: unknown): value is LocalAIChunkAnalysis {
  return isRecord(value)
    && typeof value.summary === 'string'
    && Array.isArray(value.keyPoints)
    && value.keyPoints.every(item => typeof item === 'string')
    && Array.isArray(value.topics);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const localProgressStore = createLocalAIProgressStore(AsyncStorage);

export const loadLocalAIAnalysisProgress = localProgressStore.load;
export const saveLocalAIAnalysisProgress = localProgressStore.save;
export const removeLocalAIAnalysisProgress = localProgressStore.remove;
