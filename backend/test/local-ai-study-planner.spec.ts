import {analyzeWithLocalAI, splitPdfIntoChunks, type LocalAIContext, type LocalAIProgress} from '../../src/services/local-ai-study-planner';
import type {CompletionParams, TokenData} from 'llama.rn';
import type {StudyPreferences} from '../../src/types';

const preferences: StudyPreferences = {
  formats: ['visual', 'practice'],
  rhythm: 'spaced',
  minutesPerDay: 40,
  goal: 'exam',
};

const source = 'La célula es la unidad estructural y funcional de los seres vivos. Contiene membrana y material genético, que permite transmitir información.';

function makeContext(responseText = responseFor(source)) {
  return {
    completion: jest.fn(async (_params: CompletionParams, onToken?: (data: TokenData) => void) => {
      onToken?.({token: 'token'});
      return {text: responseText};
    }),
    release: jest.fn(async () => undefined),
  } as unknown as LocalAIContext;
}

function responseFor(evidence: string) {
  return JSON.stringify({
    summary: 'La célula forma a los seres vivos y transmite información genética.',
    keyPoints: ['La célula tiene funciones estructurales y funcionales.', 'Conserva material genético.'],
    topics: [{
      kind: 'concept',
      title: 'La célula',
      explanation: 'La célula es la unidad estructural y funcional de los seres vivos. Contiene membrana y material genético.',
      keyIdeas: ['Forma la estructura de los seres vivos.', 'Su material genético transmite información.'],
      sourceEvidence: evidence,
      activities: [
        {
          kind: 'choice',
          prompt: '¿Qué dos funciones cumple la célula?',
          options: ['Estructural y funcional', 'Solo reproductiva', 'Almacenar energía'],
          answer: 'Estructural y funcional',
          sourceAnswer: 'unidad estructural y funcional',
          feedback: 'El texto la describe con ambas funciones.',
          evidence: 'La célula es la unidad estructural y funcional de los seres vivos.',
        },
        {
          kind: 'cloze',
          prompt: 'La ______ es la unidad estructural y funcional.',
          options: ['célula', 'membrana', 'información'],
          answer: 'célula',
          sourceAnswer: 'célula',
          feedback: 'La oración define a la célula como unidad de los seres vivos.',
          evidence: 'La célula es la unidad estructural y funcional de los seres vivos.',
        },
        {
          kind: 'recall',
          prompt: 'Explica qué hace importante a la célula en los seres vivos.',
          options: [],
          answer: 'Es la unidad estructural y funcional de los seres vivos.',
          sourceAnswer: 'unidad estructural y funcional',
          feedback: 'Recuerda sus dos funciones y que contiene material genético.',
          evidence: 'La célula es la unidad estructural y funcional de los seres vivos.',
        },
      ],
      visualOutline: ['Estructura de los seres vivos', 'Material genético transmite información.'],
      listenScript: 'La célula forma parte de los seres vivos y contiene la información que transmiten.',
    }],
  });
}

describe('on-device AI study planner', () => {
  it('uses learner preferences and the phone language, and creates short source-grounded learning activities', async () => {
    const context = makeContext();
    const onProgress = jest.fn();
    const createContext = jest.fn(async (reportProgress: (percent: number) => void) => {
      reportProgress(100);
      return context;
    });
    const completion = jest.spyOn(context, 'completion');

    const analysis = await analyzeWithLocalAI(source, {
      preferences,
      modelName: 'Qwen3 1.7B · Q4_K_M',
      languageTag: 'es-CO',
      pageCount: 1,
      now: new Date('2026-10-26T12:00:00.000Z'),
      createContext,
      onProgress,
    });

    const params = completion.mock.calls[0][0];
    const systemPrompt = params.messages?.[0].content as string;
    const userPrompt = params.messages?.[1].content as string;
    expect(systemPrompt).toContain('TODO el contenido dirigido al estudiante en español (es-CO)');
    expect(systemPrompt).toContain('GROUP: 19');
    expect(systemPrompt).toContain('exactamente tres actividades');
    expect(userPrompt).toContain('prepararse para un examen');
    expect(userPrompt).toContain('repasar ideas clave con esquemas');
    expect(userPrompt).toContain('resolver ejercicios interactivos');
    expect(userPrompt).toContain(source);
    expect(params.response_format?.type).toBe('json_schema');
    expect(params.enable_thinking).toBe(false);
    expect(analysis.analysisProvider).toBe('local-llm');
    expect(analysis.modelName).toBe('Qwen3 1.7B · Q4_K_M');
    expect(analysis.plannerVersion).toBe(2);
    expect(analysis.targetLanguage).toBe('es-CO');
    expect(analysis.summary.length).toBeLessThanOrEqual(320);
    expect(analysis.topics[0].keyIdeas).toHaveLength(2);
    expect(analysis.topics[0].explanation.length).toBeLessThanOrEqual(500);
    expect(analysis.topics[0].activities?.map(activity => activity.kind)).toEqual(['choice', 'cloze', 'recall']);
    expect(analysis.topics[0].activities?.every(activity => source.includes(activity.evidence))).toBe(true);
    expect(analysis.topics[0].activities?.[1].prompt).toContain('____');
    expect(analysis.topics[0].visualOutline).toEqual(['Estructura de los seres vivos', 'Material genético transmite información.']);
    expect(analysis.topics[0].listenScript).toContain('La célula');
    expect(context.release).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith({stage: 'analyzing', completedChunks: 1, totalChunks: 1});
    expect(onProgress).toHaveBeenCalledWith({stage: 'analyzing', completedChunks: 0, totalChunks: 1});
    expect(onProgress).toHaveBeenCalledWith({stage: 'generating', completedChunks: 0, totalChunks: 1, elapsedSeconds: expect.any(Number)});
    const progressCalls = onProgress.mock.calls as [LocalAIProgress][];
    expect(progressCalls.every(([event]) => event.stage !== 'loading-model' || event.percent < 100)).toBe(true);
    const firstAnalysisProgressIndex = progressCalls.findIndex(([event]) => event.stage === 'analyzing' && event.completedChunks === 0);
    expect(onProgress.mock.invocationCallOrder[firstAnalysisProgressIndex]).toBeLessThan(completion.mock.invocationCallOrder[0]);
  });

  it('rejects a generated answer whose quote is not present in the PDF excerpt', async () => {
    const context = makeContext(responseFor('La fotosíntesis convierte la luz en energía química para las plantas.'));

    await expect(analyzeWithLocalAI(source, {
      preferences,
      modelName: 'Qwen3',
      languageTag: 'es-MX',
      createContext: async () => context,
    })).rejects.toThrow('separar ideas breves y verificables');
    expect(context.release).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed, duplicated, or group-number questions instead of saving bad exercises', async () => {
    const response = JSON.parse(responseFor(source));
    response.topics[0].activities[0].prompt = 'Explica la idea principal de GROUP: 19';
    const context = makeContext(JSON.stringify(response));
    await expect(analyzeWithLocalAI(source, {
      preferences,
      modelName: 'Qwen3',
      languageTag: 'es-CO',
      createContext: async () => context,
    })).rejects.toThrow('tres ejercicios distintos y comprobables');
  });

  it('rejects content that the local model cannot ground in the PDF excerpt', async () => {
    const response = JSON.parse(responseFor(source));
    response.topics[0].sourceEvidence = 'La fotosíntesis convierte la luz en energía química para las plantas.';
    const context = makeContext(JSON.stringify(response));

    await expect(analyzeWithLocalAI(source, {
      preferences,
      modelName: 'Qwen3',
      languageTag: 'es-CO',
      createContext: async () => context,
    })).rejects.toThrow('separar ideas breves y verificables');
    expect(context.release).toHaveBeenCalledTimes(1);
  });

  it('fails instead of inventing a plan when the text is empty or contains no study topics', async () => {
    const createContext = jest.fn(async () => makeContext(JSON.stringify({summary: '', keyPoints: [], topics: []})));
    await expect(analyzeWithLocalAI('Este texto explica información general de una página sin desarrollar ningún concepto didáctico.', {preferences, modelName: 'Qwen3', languageTag: 'es-CO', createContext})).rejects.toThrow('No se encontraron conceptos');
    await expect(analyzeWithLocalAI(' ', {preferences, modelName: 'Qwen3', languageTag: 'es-CO', createContext})).rejects.toThrow('OCR local');
  });

  it('releases the native model context when generation fails', async () => {
    const context = {
      completion: jest.fn(async () => { throw new Error('native generation failed'); }),
      release: jest.fn(async () => undefined),
    } as unknown as LocalAIContext;

    await expect(analyzeWithLocalAI(source, {
      preferences,
      modelName: 'Qwen3',
      languageTag: 'es-CO',
      createContext: async () => context,
    })).rejects.toThrow('native generation failed');
    expect(context.release).toHaveBeenCalledTimes(1);
  });

  it('splits long PDFs without dropping words or exceeding the local context budget', () => {
    const text = Array.from({length: 4200}, (_, index) => `concepto${index}`).join(' ') + '\fFINAL_DEL_PDF';

    const chunks = splitPdfIntoChunks(text);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.at(-1)?.text).toContain('FINAL_DEL_PDF');
    expect(chunks.flatMap(chunk => chunk.text.split(/\s+/u))).toEqual(text.split(/\s+/u));
    expect(chunks.every(chunk => chunk.text.length <= 3_200)).toBe(true);
  });
});
