const mockValues = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((key: string) => Promise.resolve(mockValues.get(key) ?? null)),
    setItem: jest.fn((key: string, value: string) => { mockValues.set(key, value); return Promise.resolve(); }),
    removeItem: jest.fn((key: string) => { mockValues.delete(key); return Promise.resolve(); }),
  },
}));

import {calculateLessonAward, loadLocalLearningProgress, recordLocalLessonCompletion} from '../../src/services/local-learning-progress';

describe('local gamified study progress', () => {
  beforeEach(() => mockValues.clear());

  it('awards XP, starts a streak, and stores completion only on this device account', async () => {
    const now = new Date(2026, 9, 27, 12);
    const award = await recordLocalLessonCompletion('student A', 'pdf-1:0', 2, 3, now);

    expect(award.xpEarned).toBe(35);
    expect(award.progress.experiencePoints).toBe(35);
    expect(award.progress.currentStreak).toBe(1);
    expect(await loadLocalLearningProgress('student B')).toEqual({experiencePoints: 0, currentStreak: 0, bestStreak: 0, lastStudyDate: null, completedLessons: []});
    await expect(loadLocalLearningProgress('student A')).resolves.toEqual(award.progress);
  });

  it('extends a consecutive-day streak and preserves its best value after a missed day', () => {
    const previous = {
      experiencePoints: 50,
      currentStreak: 3,
      bestStreak: 4,
      lastStudyDate: '2026-10-26',
      completedLessons: ['old'],
    };
    const nextDay = calculateLessonAward(previous, 'next', 1, 3, new Date(2026, 9, 27, 12));
    expect(nextDay.progress.currentStreak).toBe(4);
    expect(nextDay.progress.bestStreak).toBe(4);

    const afterGap = calculateLessonAward(nextDay.progress, 'after-gap', 0, 3, new Date(2026, 9, 30, 12));
    expect(afterGap.progress.currentStreak).toBe(1);
    expect(afterGap.progress.bestStreak).toBe(4);
  });

  it('does not let learners farm XP by repeating the same lesson', () => {
    const first = calculateLessonAward({experiencePoints: 0, currentStreak: 0, bestStreak: 0, lastStudyDate: null, completedLessons: []}, 'same', 3, 3, new Date(2026, 9, 27, 12));
    const repeated = calculateLessonAward(first.progress, 'same', 3, 3, new Date(2026, 9, 28, 12));
    expect(first.xpEarned).toBe(45);
    expect(repeated.xpEarned).toBe(0);
    expect(repeated.alreadyCompleted).toBe(true);
    expect(repeated.progress.currentStreak).toBe(first.progress.currentStreak);
  });

  it('clears invalid local data before returning an empty progress record', async () => {
    mockValues.set('brujula.learning-progress.v1.bad', '{broken');
    await expect(loadLocalLearningProgress('bad')).resolves.toEqual({experiencePoints: 0, currentStreak: 0, bestStreak: 0, lastStudyDate: null, completedLessons: []});
    expect(mockValues.has('brujula.learning-progress.v1.bad')).toBe(false);
  });
});
