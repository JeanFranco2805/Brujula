import {analyzeLocalStudyText, generateLocalStudyPlan, LocalPdfAnalysisError} from '../../src/services/local-study-planner';
import type {StudyPreferences} from '../../src/types';

const examPreferences: StudyPreferences = {
  formats: ['visual', 'practice'],
  rhythm: 'spaced',
  minutesPerDay: 40,
  goal: 'exam',
};

describe('local study planner', () => {
  it('extracts titled sections, key points, summary, and review prompts from text', () => {
    const text = [
      'TEMA 1: La célula',
      'La célula es la unidad estructural y funcional de los seres vivos. Todas las células contienen membrana y material genético.',
      'TEMA 2: Fotosíntesis',
      'La fotosíntesis convierte energía luminosa en energía química. Las plantas absorben luz mediante pigmentos como la clorofila.',
    ].join('\n');

    const result = analyzeLocalStudyText(text, new Date('2026-10-09T12:00:00.000Z'));

    expect(result.analysisProvider).toBe('on-device');
    expect(result.topics).toHaveLength(2);
    expect(result.topics[0].title).toBe('TEMA 1: La célula');
    expect(result.topics[1].explanation).toContain('energía luminosa');
    expect(result.topics[0].questions[0]).toContain('La célula');
    expect(result.keyPoints).toHaveLength(2);
    expect(result.summary).toContain('La fotosíntesis');
  });

  it('groups unheaded text into manageable topics and strips split words and page numbers', () => {
    const text = [
      'La mitocondria produce energía para la célula mediante la respiración celular y participa en distintos procesos metabólicos.',
      'Su estructura contiene una membrana externa y otra membrana interna que forma pliegues llamados crestas.',
      'El ADN mitocondrial permite sintetizar algunas proteínas necesarias para el funcionamiento de este orgánulo.',
      'La respiración celular transforma nutrientes en energía que la célula puede usar en sus actividades diarias.',
    ].join('\n\n');
    const result = analyzeLocalStudyText(`Pági-\nna 1 de 4\n${text}`);

    expect(result.topics.length).toBeGreaterThan(0);
    expect(result.topics[0].explanation).toContain('membrana');
    expect(result.summary.length).toBeLessThanOrEqual(900);
  });

  it('reports scanned or empty PDFs instead of creating a fake plan', () => {
    expect(() => analyzeLocalStudyText('')).toThrow(LocalPdfAnalysisError);
    expect(() => analyzeLocalStudyText('x'.repeat(120))).toThrow('texto seleccionable');
  });

  it('builds spaced sessions using the learner format and duration preferences on weekdays', () => {
    const analysis = analyzeLocalStudyText([
      'TEMA 1: La célula',
      'La célula es la unidad estructural y funcional de los seres vivos. Todas contienen membrana y material genético.',
      'TEMA 2: Fotosíntesis',
      'La fotosíntesis convierte energía luminosa en energía química. Las plantas utilizan pigmentos para captar la energía.',
    ].join('\n'));
    const monday = new Date(2026, 9, 5, 12, 0, 0);

    const plan = generateLocalStudyPlan('pdf-local-1', analysis.topics, examPreferences, monday);

    expect(plan).toHaveLength(4);
    expect(plan.map(session => session.learningFormat)).toEqual(['visual', 'practice', 'practice', 'practice']);
    expect(plan.every(session => session.durationMinutes === 40 && session.status === 'planned')).toBe(true);
    expect(plan[0].date).toBe('2026-10-06');
    expect(plan.every(session => !['2026-10-10', '2026-10-11'].includes(session.date))).toBe(true);
    expect(plan.slice(2).every(session => session.title.startsWith('Repaso: '))).toBe(true);
  });

  it('uses fewer weekly sessions for a habit goal and leaves long-block plans without repeats', () => {
    const topics = [
      {title: 'Tema uno', explanation: 'Explicación del tema uno.', questions: []},
      {title: 'Tema dos', explanation: 'Explicación del tema dos.', questions: []},
      {title: 'Tema tres', explanation: 'Explicación del tema tres.', questions: []},
    ];
    const habit: StudyPreferences = {...examPreferences, goal: 'habit', rhythm: 'longBlocks'};
    const monday = new Date(2026, 9, 5, 12, 0, 0);

    const plan = generateLocalStudyPlan('pdf-local-2', topics, habit, monday);

    expect(plan.map(session => session.date)).toEqual(['2026-10-07', '2026-10-09', '2026-10-12']);
    expect(plan.every(session => !session.title.startsWith('Repaso: '))).toBe(true);
  });
});
