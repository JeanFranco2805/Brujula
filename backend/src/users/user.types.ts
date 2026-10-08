export type StudyPreferences = {
  formats: ('read' | 'listen' | 'visual' | 'practice')[];
  rhythm: 'spaced' | 'longBlocks';
  minutesPerDay: 15 | 25 | 40;
  goal: 'exam' | 'understand' | 'habit';
};

export type UserProfile = {
  id: string;
  name: string;
  email: string;
  preferences: StudyPreferences;
  onboardingCompleted: boolean;
};

export type UserCredentials = UserProfile & {passwordHash: string | null};
