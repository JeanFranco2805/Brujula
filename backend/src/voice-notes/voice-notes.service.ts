import {Injectable, NotFoundException} from '@nestjs/common';
import type {Express} from 'express';
import {DatabaseService} from '../database/database.service';
import {StudyContentService} from '../materials/study-content.service';
import {AudioTranscriptionService} from './audio-transcription.service';

export type VoiceNote = {
  id: string;
  title: string;
  sourceName: string;
  transcript: string;
  summary: string;
  keyPoints: string[];
  createdAt: Date;
};

@Injectable()
export class VoiceNotesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly transcription: AudioTranscriptionService,
    private readonly studyContent: StudyContentService,
  ) {}

  async create(userId: string, file: Express.Multer.File): Promise<VoiceNote> {
    const transcript = await this.transcription.transcribe(file);
    const content = await this.studyContent.analyze(transcript);
    const sourceName = this.sanitizeName(file.originalname);
    const title = sourceName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 255) || 'Nota de voz';
    const result = await this.database.query<VoiceNote>(
      `INSERT INTO voice_notes (user_id, title, source_name, transcript, summary, key_points)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING id, title, source_name AS "sourceName", transcript, summary,
                 key_points AS "keyPoints", created_at AS "createdAt"`,
      [userId, title, sourceName, transcript, content.summary, JSON.stringify(content.keyPoints)],
    );
    return this.normalize(result.rows[0]);
  }

  async list(userId: string): Promise<VoiceNote[]> {
    const result = await this.database.query<VoiceNote>(
      `SELECT id, title, source_name AS "sourceName", transcript, summary,
              key_points AS "keyPoints", created_at AS "createdAt"
       FROM voice_notes WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );
    return result.rows.map(row => this.normalize(row));
  }

  async findOne(userId: string, id: string): Promise<VoiceNote> {
    const result = await this.database.query<VoiceNote>(
      `SELECT id, title, source_name AS "sourceName", transcript, summary,
              key_points AS "keyPoints", created_at AS "createdAt"
       FROM voice_notes WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    if (!result.rows[0]) throw new NotFoundException('No encontramos esta nota de voz.');
    return this.normalize(result.rows[0]);
  }

  async remove(userId: string, id: string): Promise<void> {
    const result = await this.database.query('DELETE FROM voice_notes WHERE id = $1 AND user_id = $2', [id, userId]);
    if (result.rowCount !== 1) throw new NotFoundException('No encontramos esta nota de voz.');
  }

  private sanitizeName(name: string) {
    const basename = (name ?? 'nota-de-voz.m4a').replace(/\\/g, '/').split('/').pop() ?? 'nota-de-voz.m4a';
    return basename.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 255) || 'nota-de-voz.m4a';
  }

  private normalize(row: VoiceNote): VoiceNote {
    return {...row, keyPoints: Array.isArray(row.keyPoints) ? row.keyPoints : []};
  }
}
