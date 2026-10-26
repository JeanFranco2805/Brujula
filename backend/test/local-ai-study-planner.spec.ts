import {analyzeWithLocalAI, splitPdfIntoChunks, type LocalAIContext} from '../../src/services/local-ai-study-planner';
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
    completion: jest.fn(async () => ({text: responseText})),
    release: jest.fn(async () => undefined),
  } as unknown as LocalAIContext;
}

function responseFor(evidence: string) {
  return JSON.stringify({
    summary: 'La célula es la unidad funcional de los seres vivos.',
    keyPoints: ['Tiene membrana.', 'Conserva material genético.'],
    topics: [{
      title: 'La célula',
      explanation: 'La célula es la unidad estructural y funcional de los seres vivos y contiene membrana y material genético.',
      sourceEvidence: evidence,
      questions: ['¿Qué funciones cumple la célula?', '¿Qué contiene?'],
      visualOutline: ['Célula', 'Membrana', 'Material genético'],
      listenScript: 'Recuerda que la célula es la unidad funcional de los seres vivos.',
    }],
  });
}

describe('on-device AI study planner', () => {
  it('uses the local model with the learner goal and selected study formats, then returns grounded learning activities', async () => {
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
      pageCount: 1,
      now: new Date('2026-10-26T12:00:00.000Z'),
      createContext,
      onProgress,
    });

    const params = completion.mock.calls[0][0];
    const userPrompt = params.messages?.[1].content as string;
    expect(userPrompt).toContain('prepararse para un examen');
    expect(userPrompt).toContain('estudiar con esquemas visuales');
    expect(userPrompt).toContain('resolver preguntas y ejercicios');
    expect(userPrompt).toContain(source);
    expect(params.response_format?.type).toBe('json_schema');
    expect(params.enable_thinking).toBe(false);
    expect(analysis.analysisProvider).toBe('local-llm');
    expect(analysis.modelName).toBe('Qwen3 1.7B · Q4_K_M');
    expect(analysis.topics[0].sourceEvidence).toBe(source);
    expect(analysis.topics[0].visualOutline).toEqual(['Célula', 'Membrana', 'Material genético']);
    expect(analysis.topics[0].listenScript).toContain('Recuerda');
    expect(context.release).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith({stage: 'analyzing', completedChunks: 1, totalChunks: 1});
  });

  it('rejects content that the local model cannot ground in the PDF excerpt', async () => {
    const context = makeContext(responseFor('La fotosíntesis convierte la luz en energía química para las plantas.'));

    await expect(analyzeWithLocalAI(source, {
      preferences,
      modelName: 'Qwen3',
      createContext: async () => context,
    })).rejects.toThrow('comprobar que uno de los temas corresponda');
    expect(context.release).toHaveBeenCalledTimes(1);
  });

  it('fails instead of inventing a plan when the text is empty or contains no study topics', async () => {
    const createContext = jest.fn(async () => makeContext(JSON.stringify({summary: '', keyPoints: [], topics: []})));
    await expect(analyzeWithLocalAI('Este texto explica información general de una página sin desarrollar ningún concepto didáctico.', {preferences, modelName: 'Qwen3', createContext})).rejects.toThrow('no encontró temas de estudio');
    await expect(analyzeWithLocalAI(' ', {preferences, modelName: 'Qwen3', createContext})).rejects.toThrow('OCR local');
  });

  it('releases the native model context when generation fails', async () => {
    const context = {
      completion: jest.fn(async () => { throw new Error('native generation failed'); }),
      release: jest.fn(async () => undefined),
    } as unknown as LocalAIContext;

    await expect(analyzeWithLocalAI(source, {
      preferences,
      modelName: 'Qwen3',
      createContext: async () => context,
    })).rejects.toThrow('native generation failed');
    expect(context.release).toHaveBeenCalledTimes(1);
  });

  it('splits long PDFs without dropping words or content after later pages', () => {
    const text = Array.from({length: 4200}, (_, index) => `concepto${index}`).join(' ') + '\fFINAL_DEL_PDF';

    const chunks = splitPdfIntoChunks(text);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.at(-1)?.text).toContain('FINAL_DEL_PDF');
    expect(chunks.flatMap(chunk => chunk.text.split(/\s+/u))).toEqual(text.split(/\s+/u));
    expect(chunks.every(chunk => chunk.text.length <= 5_600)).toBe(true);
  });
});
