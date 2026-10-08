export type LearningFormat = 'read' | 'listen' | 'visual' | 'practice';
export type StudyRhythm = 'spaced' | 'longBlocks';
export type StudyGoal = 'exam' | 'understand' | 'habit';

export type StudyPreferences = {
  formats: LearningFormat[];
  rhythm: StudyRhythm;
  minutesPerDay: number;
  goal: StudyGoal;
};

export type UserProfile = {
  name: string;
  email: string;
  preferences: StudyPreferences;
  onboardingCompleted: boolean;
  id: string;
};

export const defaultPreferences: StudyPreferences = {
  formats: ['practice'],
  rhythm: 'spaced',
  minutesPerDay: 25,
  goal: 'understand',
};
