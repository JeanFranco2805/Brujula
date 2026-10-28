import {analyzeLocalStudyText, generateLocalStudyPlan, getConciseKeyIdeas, LocalPdfAnalysisError} from '../../src/services/local-study-planner';
import type {StudyPreferences} from '../../src/types';

const examPreferences: StudyPreferences = {
  formats: ['visual', 'practice'],
  rhythm: 'spaced',
  minutesPerDay: 40,
  goal: 'exam',
};

describe('local study planner', () => {
  it('turns legacy long outlines into a few short, readable key ideas', () => {
    const ideas = getConciseKeyIdeas({
      title: 'Tema',
      explanation: 'Una explicación útil para estudiar. Un segundo párrafo que no debe aparecer.',
      questions: ['¿Qué significa el grupo 19?'],
      visualOutline: [
        'METODOLOGY AND INSTRUCTIONS',
        'This section describes an assignment with a very long explanation that should be cut down to a concise sentence for comfortable reading on a phone. More unnecessary text.',
        'GROUP: 19',
        'Students should identify the central idea.',
        'Students should identify the central idea.',
      ],
    });

    expect(ideas).toEqual([
      'This section describes an assignment with a very long explanation that should be cut down to a concise sentence for…',
      'Students should identify the central idea.',
    ]);
    expect(ideas).toHaveLength(2);
    expect(ideas.every(idea => idea.length <= 120)).toBe(true);
  });

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
    expect(result.topics[0].questions[0]).toContain('_____');
    expect(result.topics[0].questions[1]).toContain('_____');
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
    expect(result.topics[0].title).toBe('La mitocondria');
    expect(result.topics[0].explanation).toContain('membrana');
    expect(result.summary.length).toBeLessThanOrEqual(900);
  });

  it('reports scanned or empty PDFs instead of creating a fake plan', () => {
    expect(() => analyzeLocalStudyText('')).toThrow(LocalPdfAnalysisError);
    expect(() => analyzeLocalStudyText('x'.repeat(120))).toThrow('texto seleccionable');
  });

  it('preserves sections after the first twenty topics and reports how much text was extracted', () => {
    const text = Array.from({length: 24}, (_, index) => [
      'TEMA ' + (index + 1) + ': Contenido ' + (index + 1),
      'El contenido del tema ' + (index + 1) + ' explica conceptos importantes con suficiente contexto para estudiar.',
      'La última palabra distintiva de esta sección es MARCADOR_' + (index + 1) + '.',
    ].join('\n')).join('\n');

    const analysis = analyzeLocalStudyText(text, new Date('2026-10-26T12:00:00.000Z'), 24);

    expect(analysis.topics).toHaveLength(24);
    expect(analysis.topics.at(-1)?.explanation).toContain('MARCADOR_24');
    expect(analysis.extractedWords).toBeGreaterThan(100);
    expect(analysis.extractedCharacters).toBeGreaterThan(text.length - 20);
    expect(analysis.pageCount).toBe(24);
  });

  it('keeps content past the former sentence and 1500-character limits, including text without punctuation', () => {
    const longText = Array.from({length: 240}, (_, index) => 'fragmento' + index).join(' ') + ' CIERRE_DEL_DOCUMENTO';
    const analysis = analyzeLocalStudyText(longText);
    const extracted = analysis.topics.map(topic => topic.explanation).join(' ');

    expect(analysis.topics.length).toBeGreaterThan(1);
    expect(extracted).toContain('fragmento239');
    expect(extracted).toContain('CIERRE_DEL_DOCUMENTO');
    expect(analysis.extractedCharacters).toBe(longText.length);
  });

  it('uses title-case standalone section headings and warns when pages yield very little text', () => {
    const text = [
      'La Célula',
      'La célula es la unidad estructural y funcional de los seres vivos. Contiene material genético y una membrana.',
      'La Fotosíntesis',
      'La fotosíntesis transforma energía luminosa en energía química. Las plantas realizan este proceso en sus hojas.',
    ].join('\n');

    const analysis = analyzeLocalStudyText(text, new Date('2026-10-26T12:00:00.000Z'), 40);

    expect(analysis.topics.map(topic => topic.title)).toEqual(['La Célula', 'La Fotosíntesis']);
    expect(analysis.warnings?.[0]).toContain('poco texto seleccionable');
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
    expect(plan.every(session => session.reminderEnabled && session.reminderMinutesBefore === 10)).toBe(true);
    expect(plan[0].date).toBe('2026-10-06');
    expect(plan.map(session => session.date)).toEqual(['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']);
    expect(new Set(plan.map(session => session.date)).size).toBe(plan.length);
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
