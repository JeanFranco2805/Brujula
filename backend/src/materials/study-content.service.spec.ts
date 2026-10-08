import {StudyContentService} from './study-content.service';

describe('StudyContentService', () => {
  const config = {get: jest.fn()};
  let service: StudyContentService;

  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockReturnValue(undefined);
    service = new StudyContentService(config as never);
  });

  afterEach(() => jest.restoreAllMocks());

  it('creates a readable local summary and practice prompts without an API key', async () => {
    const result = await service.analyze('Las células convierten nutrientes en energía. La fotosíntesis captura luz solar. La clorofila absorbe luz.');

    expect(result.provider).toBe('local');
    expect(result.summary).toContain('Las células convierten nutrientes en energía.');
    expect(result.keyPoints).toHaveLength(3);
    expect(result.topics[0]).toMatchObject({title: expect.any(String), explanation: expect.any(String)});
    expect(result.topics[0].questions).toHaveLength(1);
  });

  it('uses OpenAI JSON mode when configured and validates the returned learning structure', async () => {
    config.get.mockImplementation((key: string) => ({
      OPENAI_API_KEY: 'unit-test-key',
      OPENAI_STUDY_MODEL: 'test-model',
    } as Record<string, string>)[key]);
    const payload = {
      summary: 'Resumen claro.',
      keyPoints: ['Idea principal'],
      topics: [{title: 'Tema', explanation: 'Explicación', questions: ['¿Por qué?']}],
    };
    const fetch = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({choices: [{message: {content: JSON.stringify(payload)}}]}),
    } as Response);

    await expect(service.analyze('Texto fuente')).resolves.toEqual({...payload, provider: 'openai'});
    expect(fetch).toHaveBeenCalledWith('https://api.openai.com/v1/chat/completions', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({Authorization: 'Bearer unit-test-key'}),
    }));
  });

  it('falls back to local extraction when the AI provider fails or returns malformed data', async () => {
    config.get.mockImplementation((key: string) => key === 'OPENAI_API_KEY' ? 'test-key' : 'test-model');
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({choices: [{message: {content: 'not json'}}]}),
    } as Response);

    await expect(service.analyze('Una oración suficientemente larga para formar un resumen.'))
      .resolves.toMatchObject({provider: 'local'});
  });

  it('bounds oversized model output and discards malformed topics', async () => {
    config.get.mockImplementation((key: string) => key === 'OPENAI_API_KEY' ? 'test-key' : 'test-model');
    const largeSummary = 'A'.repeat(4000);
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({choices: [{message: {content: JSON.stringify({summary: largeSummary, keyPoints: [1, 'ok'], topics: [{title: 'Tema', explanation: 'Texto', questions: ['Pregunta']}, null]})}}]}),
    } as Response);

    await expect(service.analyze('Texto suficientemente largo.')).resolves.toMatchObject({
      provider: 'openai',
      summary: 'A'.repeat(3000),
      keyPoints: ['ok'],
      topics: [{title: 'Tema', explanation: 'Texto', questions: ['Pregunta']}],
    });
  });
});
