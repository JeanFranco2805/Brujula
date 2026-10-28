import AsyncStorage from '@react-native-async-storage/async-storage';

export type LocalLearningProgress = {
  experiencePoints: number;
  currentStreak: number;
  bestStreak: number;
  lastStudyDate: string | null;
  completedLessons: string[];
};

export type LessonAward = {progress: LocalLearningProgress; xpEarned: number; alreadyCompleted: boolean};

const STORAGE_PREFIX = 'brujula.learning-progress.v1.';

export const emptyLearningProgress: LocalLearningProgress = {
  experiencePoints: 0,
  currentStreak: 0,
  bestStreak: 0,
  lastStudyDate: null,
  completedLessons: [],
};

function storageKey(ownerId: string) {
  return `${STORAGE_PREFIX}${encodeURIComponent(ownerId)}`;
}

export async function loadLocalLearningProgress(ownerId: string): Promise<LocalLearningProgress> {
  const key = storageKey(ownerId);
  const saved = await AsyncStorage.getItem(key);
  if (!saved) return {...emptyLearningProgress};

  try {
    const parsed: unknown = JSON.parse(saved);
    if (!isRecord(parsed)) throw new Error('Invalid local learning progress');
    return {
      experiencePoints: asNonNegativeInteger(parsed.experiencePoints),
      currentStreak: asNonNegativeInteger(parsed.currentStreak),
      bestStreak: asNonNegativeInteger(parsed.bestStreak),
      lastStudyDate: typeof parsed.lastStudyDate === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(parsed.lastStudyDate) ? parsed.lastStudyDate : null,
      completedLessons: Array.isArray(parsed.completedLessons)
        ? [...new Set(parsed.completedLessons.filter((item): item is string => typeof item === 'string' && item.length > 0 && item.length <= 256))]
        : [],
    };
  } catch {
    await AsyncStorage.removeItem(key);
    return {...emptyLearningProgress};
  }
}

export function calculateLessonAward(
  previous: LocalLearningProgress,
  lessonKey: string,
  firstTryCorrectCount: number,
  totalActivities: number,
  now = new Date(),
): LessonAward {
  if (previous.completedLessons.includes(lessonKey)) {
    return {progress: previous, xpEarned: 0, alreadyCompleted: true};
  }

  const today = localDateKey(now);
  const yesterdayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yesterday = localDateKey(yesterdayDate);
  const currentStreak = previous.lastStudyDate === today
    ? Math.max(1, previous.currentStreak)
    : previous.lastStudyDate === yesterday
      ? previous.currentStreak + 1
      : 1;
  const safeTotal = Math.max(0, Math.floor(totalActivities));
  const safeCorrect = Math.min(safeTotal, Math.max(0, Math.floor(firstTryCorrectCount)));
  const xpEarned = 15 + safeCorrect * 10;
  const progress: LocalLearningProgress = {
    experiencePoints: previous.experiencePoints + xpEarned,
    currentStreak,
    bestStreak: Math.max(previous.bestStreak, currentStreak),
    lastStudyDate: today,
    completedLessons: [...previous.completedLessons, lessonKey],
  };
  return {progress, xpEarned, alreadyCompleted: false};
}

export async function recordLocalLessonCompletion(
  ownerId: string,
  lessonKey: string,
  firstTryCorrectCount: number,
  totalActivities: number,
  now = new Date(),
): Promise<LessonAward> {
  const current = await loadLocalLearningProgress(ownerId);
  const award = calculateLessonAward(current, lessonKey, firstTryCorrectCount, totalActivities, now);
  if (!award.alreadyCompleted) await AsyncStorage.setItem(storageKey(ownerId), JSON.stringify(award.progress));
  return award;
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function asNonNegativeInteger(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
