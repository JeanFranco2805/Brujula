import {createHash} from 'node:crypto';
import {BadRequestException, Injectable, NotFoundException} from '@nestjs/common';
import type {Express} from 'express';
import {DatabaseService} from '../database/database.service';
import {PdfTextExtractorService} from './pdf-text-extractor.service';
import {StudyContentService, type StudyContent, type StudyTopic} from './study-content.service';

export const MAX_PDF_SIZE_BYTES = 12 * 1024 * 1024;

export type StudyMaterial = {
  id: string;
  originalName: string;
  fileSize: number;
  summary: string;
  keyPoints: string[];
  topics: StudyTopic[];
  analysisProvider: 'openai' | 'local';
  createdAt: Date;
};

@Injectable()
export class MaterialsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly pdfText: PdfTextExtractorService,
    private readonly studyContent: StudyContentService,
  ) {}

  async create(userId: string, file: Express.Multer.File): Promise<StudyMaterial> {
    if (!file?.buffer?.length) throw new BadRequestException('Selecciona un archivo PDF para importar.');
    if (file.buffer.length > MAX_PDF_SIZE_BYTES) throw new BadRequestException('El PDF no puede superar los 12 MB.');
    if (file.buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new BadRequestException('El archivo seleccionado no es un PDF válido.');
    }

    const extractedText = await this.pdfText.extract(file.buffer);
    const analysis = await this.studyContent.analyze(extractedText);
    const originalName = this.sanitizeName(file.originalname);
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const result = await this.database.query<StudyMaterial>(
      `INSERT INTO study_materials
         (user_id, original_name, content_type, sha256, file_size, file_data, extracted_text, summary, key_points, topics, analysis_provider)
       VALUES ($1, $2, 'application/pdf', $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)
       ON CONFLICT (user_id, sha256) DO UPDATE
         SET original_name = EXCLUDED.original_name, updated_at = NOW()
       RETURNING id, original_name AS "originalName", file_size AS "fileSize", summary,
                 key_points AS "keyPoints", topics, analysis_provider AS "analysisProvider", created_at AS "createdAt"`,
      [userId, originalName, sha256, file.buffer.length, file.buffer, extractedText, analysis.summary,
        JSON.stringify(analysis.keyPoints), JSON.stringify(analysis.topics), analysis.provider],
    );
    return this.normalize(result.rows[0]);
  }

  async list(userId: string): Promise<StudyMaterial[]> {
    const result = await this.database.query<StudyMaterial>(
      `SELECT id, original_name AS "originalName", file_size AS "fileSize", summary,
              key_points AS "keyPoints", topics, analysis_provider AS "analysisProvider", created_at AS "createdAt"
       FROM study_materials WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );
    return result.rows.map(row => this.normalize(row));
  }

  async findOne(userId: string, id: string): Promise<StudyMaterial> {
    const result = await this.database.query<StudyMaterial>(
      `SELECT id, original_name AS "originalName", file_size AS "fileSize", summary,
              key_points AS "keyPoints", topics, analysis_provider AS "analysisProvider", created_at AS "createdAt"
       FROM study_materials WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    if (!result.rows[0]) throw new NotFoundException('No encontramos este material.');
    return this.normalize(result.rows[0]);
  }

  async remove(userId: string, id: string): Promise<void> {
    const result = await this.database.query(
      'DELETE FROM study_materials WHERE id = $1 AND user_id = $2',
      [id, userId],
    );
    if (result.rowCount !== 1) throw new NotFoundException('No encontramos este material.');
  }

  private sanitizeName(name: string) {
    const basename = (name ?? 'material.pdf').replace(/\\/g, '/').split('/').pop() ?? 'material.pdf';
    const sanitized = basename.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 255);
    return sanitized || 'material.pdf';
  }

  private normalize(row: StudyMaterial & Partial<StudyContent>): StudyMaterial {
    return {
      ...row,
      keyPoints: Array.isArray(row.keyPoints) ? row.keyPoints : [],
      topics: Array.isArray(row.topics) ? row.topics : [],
      analysisProvider: row.analysisProvider ?? 'local',
    };
  }
}
