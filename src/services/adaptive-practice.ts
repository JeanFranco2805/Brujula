import type {StudyGoal} from '../types';
import type {LearningActivity} from './local-study-planner';

export type AdaptiveRound = {activity: LearningActivity; retryNumber: 0 | 1};

const activityOrderByGoal: Record<StudyGoal, LearningActivity['kind'][]> = {
  exam: ['recall', 'choice', 'cloze'],
  understand: ['choice', 'recall', 'cloze'],
  habit: ['cloze', 'choice', 'recall'],
};

export function createAdaptiveRounds(activities: LearningActivity[], goal: StudyGoal): AdaptiveRound[] {
  const priorities = activityOrderByGoal[goal];
  return [...activities]
    .sort((left, right) => priorities.indexOf(left.kind) - priorities.indexOf(right.kind))
    .map(activity => ({activity, retryNumber: 0}));
}

/** Missed activities return once at the end, so the learner practices the weak point again. */
export function queueRetryRound(rounds: AdaptiveRound[], currentIndex: number, mastered: boolean): AdaptiveRound[] {
  const current = rounds[currentIndex];
  if (!current || mastered || current.retryNumber > 0) return rounds;
  return [...rounds, {...current, retryNumber: 1}];
}

export function isSameAnswer(left: string, right: string) {
  return normalizeAnswer(left) === normalizeAnswer(right);
}

function normalizeAnswer(value: string) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
