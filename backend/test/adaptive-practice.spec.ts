import {createAdaptiveRounds, isSameAnswer, queueRetryRound} from '../../src/services/adaptive-practice';
import type {LearningActivity} from '../../src/services/local-study-planner';

const activities: LearningActivity[] = [
  {kind: 'cloze', prompt: 'La ____.', options: ['célula', 'membrana', 'luz'], answer: 'célula', sourceAnswer: 'cell', feedback: 'Definición.', evidence: 'A cell is a unit.'},
  {kind: 'choice', prompt: 'Which?', options: ['A', 'B', 'C'], answer: 'A', sourceAnswer: 'A', feedback: 'Porque.', evidence: 'A is first.'},
  {kind: 'recall', prompt: 'Explain this.', options: [], answer: 'Sample answer', sourceAnswer: 'sample', feedback: 'Recuerda.', evidence: 'A sample is here.'},
];

describe('adaptive study activities', () => {
  it('starts with retrieval practice for exams and changes order for other goals', () => {
    expect(createAdaptiveRounds(activities, 'exam').map(round => round.activity.kind)).toEqual(['recall', 'choice', 'cloze']);
    expect(createAdaptiveRounds(activities, 'habit').map(round => round.activity.kind)).toEqual(['cloze', 'choice', 'recall']);
  });

  it('requeues a missed activity once, and never loops mastered activities', () => {
    const rounds = createAdaptiveRounds(activities, 'exam');
    const retried = queueRetryRound(rounds, 0, false);
    expect(retried).toHaveLength(4);
    expect(retried[3]).toEqual({...rounds[0], retryNumber: 1});
    expect(queueRetryRound(retried, 3, false)).toBe(retried);
    expect(queueRetryRound(rounds, 0, true)).toBe(rounds);
  });

  it('compares answers without punctuation or case differences', () => {
    expect(isSameAnswer('Estructural y funcional.', 'estructural y funcional')).toBe(true);
    expect(isSameAnswer('membrana celular', 'membrana nuclear')).toBe(false);
  });
});
