import {BadRequestException, ServiceUnavailableException} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {AudioTranscriptionService} from './audio-transcription.service';

describe('AudioTranscriptionService', () => {
  const config = {get: jest.fn()};
  let service: AudioTranscriptionService;
  const originalFetch = global.fetch;
  const file = {buffer: Buffer.from('sample audio'), mimetype: 'audio/mp4', originalname: 'class-note.m4a'} as Express.Multer.File;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AudioTranscriptionService(config as unknown as ConfigService);
    config.get.mockImplementation((key: string) => ({OPENAI_API_KEY: 'test-key', OPENAI_TRANSCRIPTION_MODEL: 'test-model'}[key]));
  });

  afterEach(() => { global.fetch = originalFetch; });

  it('sends supported audio as multipart and returns the Spanish transcript', async () => {
    global.fetch = jest.fn().mockResolvedValue({ok: true, json: async () => ({text: 'Repasar mitosis mañana.'})}) as unknown as typeof fetch;
    await expect(service.transcribe(file)).resolves.toBe('Repasar mitosis mañana.');
    expect(global.fetch).toHaveBeenCalledWith('https://api.openai.com/v1/audio/transcriptions', expect.objectContaining({
      method: 'POST',
      headers: {Authorization: 'Bearer test-key'},
      body: expect.any(FormData),
    }));
  });

  it('rejects missing or unsupported recordings before making a provider request', async () => {
    await expect(service.transcribe(undefined as unknown as Express.Multer.File)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.transcribe({...file, mimetype: 'application/pdf'})).rejects.toBeInstanceOf(BadRequestException);
    expect(global.fetch).toBe(originalFetch);
  });

  it('requires provider configuration and reports provider failures safely', async () => {
    config.get.mockReturnValue(undefined);
    await expect(service.transcribe(file)).rejects.toBeInstanceOf(ServiceUnavailableException);
    config.get.mockImplementation((key: string) => ({OPENAI_API_KEY: 'test-key'}[key]));
    global.fetch = jest.fn().mockResolvedValue({ok: false, status: 429}) as unknown as typeof fetch;
    await expect(service.transcribe(file)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
