import {BadRequestException, Injectable, Logger, ServiceUnavailableException} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';

export const MAX_AUDIO_SIZE_BYTES = 25 * 1024 * 1024;
const SUPPORTED_AUDIO_TYPES = new Set([
  'audio/mp4', 'audio/m4a', 'audio/aac', 'audio/mpeg', 'audio/mp3', 'audio/wav',
  'audio/x-wav', 'audio/webm', 'audio/3gpp', 'audio/ogg', 'video/mp4',
]);

@Injectable()
export class AudioTranscriptionService {
  private readonly logger = new Logger(AudioTranscriptionService.name);

  constructor(private readonly config: ConfigService) {}

  async transcribe(file: Express.Multer.File): Promise<string> {
    if (!file?.buffer?.length) throw new BadRequestException('No recibimos una grabación de audio válida.');
    if (file.buffer.length > MAX_AUDIO_SIZE_BYTES) throw new BadRequestException('La grabación supera el máximo de 25 MB.');
    if (!SUPPORTED_AUDIO_TYPES.has(file.mimetype.toLowerCase())) {
      throw new BadRequestException('Formato de audio no compatible. Usa M4A, MP3, WAV, WebM, OGG o 3GP.');
    }
    const apiKey = this.config.get<string>('OPENAI_API_KEY')?.trim();
    if (!apiKey) throw new ServiceUnavailableException('Configura OPENAI_API_KEY para transcribir notas de voz.');

    const form = new FormData();
    form.append('model', this.config.get<string>('OPENAI_TRANSCRIPTION_MODEL')?.trim() || 'gpt-4o-mini-transcribe');
    form.append('language', 'es');
    form.append('response_format', 'json');
    form.append('file', new Blob([new Uint8Array(file.buffer)], {type: file.mimetype}), this.sanitizeFilename(file.originalname));
    try {
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {Authorization: `Bearer ${apiKey}`},
        body: form,
        signal: AbortSignal.timeout(90_000),
      });
      if (!response.ok) throw new Error(`Transcription provider returned HTTP ${response.status}`);
      const payload = await response.json() as {text?: unknown};
      if (typeof payload.text !== 'string' || payload.text.trim().length < 2) throw new Error('Transcription response was empty');
      return payload.text.trim().slice(0, 100_000);
    } catch (error) {
      this.logger.warn(`Audio transcription failed (${error instanceof Error ? error.message : 'unknown error'})`);
      throw new ServiceUnavailableException('No se pudo transcribir la nota de voz. Inténtalo de nuevo en unos minutos.');
    }
  }

  private sanitizeFilename(name: string) {
    return (name ?? 'nota-de-voz.m4a').replace(/[\\/\u0000-\u001f\u007f]/g, '_').slice(0, 255) || 'nota-de-voz.m4a';
  }
}
