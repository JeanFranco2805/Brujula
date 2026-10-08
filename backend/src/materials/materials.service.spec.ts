import {BadRequestException, NotFoundException} from '@nestjs/common';
import type {Express} from 'express';
import {MaterialsService, MAX_PDF_SIZE_BYTES} from './materials.service';
import type {StudyContent} from './study-content.service';

describe('MaterialsService', () => {
  const material = {
    id: '8e676871-55b2-4e8c-8732-1fa8ee7d910f',
    originalName: 'Biologia.pdf',
    fileSize: 18,
    summary: 'Resumen de estudio.',
    keyPoints: ['Idea principal'],
    topics: [{title: 'Células', explanation: 'Contenido celular.', questions: ['¿Qué es una célula?']}],
    analysisProvider: 'local' as const,
    createdAt: new Date('2026-10-08T12:00:00.000Z'),
  };
  const database = {query: jest.fn()};
  const pdfText = {extract: jest.fn()};
  const studyContent = {analyze: jest.fn()};
  let service: MaterialsService;

  function file(buffer: Buffer, originalname = 'Biologia.pdf'): Express.Multer.File {
    return {buffer, originalname, mimetype: 'application/pdf', size: buffer.length} as Express.Multer.File;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    database.query.mockResolvedValue({rows: [material], rowCount: 1});
    pdfText.extract.mockResolvedValue('Texto extraído del PDF con suficiente longitud para estudiar.');
    studyContent.analyze.mockResolvedValue({summary: 'Resumen de estudio.', keyPoints: ['Idea principal'], topics: [], provider: 'local'} satisfies StudyContent);
    service = new MaterialsService(database as never, pdfText as never, studyContent as never);
  });

  it('validates PDF bytes, extracts text, analyzes learning content and stores the user-owned material', async () => {
    const pdf = Buffer.from('%PDF-1.7 some pdf bytes');
    await expect(service.create('user-1', file(pdf, '../clase\u0000.pdf'))).resolves.toEqual(material);

    expect(pdfText.extract).toHaveBeenCalledWith(pdf);
    expect(studyContent.analyze).toHaveBeenCalledWith('Texto extraído del PDF con suficiente longitud para estudiar.');
    expect(database.query.mock.calls[0][0]).toContain('INSERT INTO study_materials');
    expect(database.query.mock.calls[0][1]).toEqual(expect.arrayContaining(['user-1', 'clase.pdf', expect.any(String), pdf.length, pdf]));
    expect(database.query.mock.calls[0][0]).toContain('ON CONFLICT (user_id, sha256)');
  });

  it('rejects missing files, non-PDF content and files over the size limit', async () => {
    await expect(service.create('user-1', undefined as never)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create('user-1', file(Buffer.from('not a PDF')))).rejects.toThrow('no es un PDF válido');
    await expect(service.create('user-1', file(Buffer.alloc(MAX_PDF_SIZE_BYTES + 1, 65)))).rejects.toThrow('no puede superar los 12 MB');
    expect(pdfText.extract).not.toHaveBeenCalled();
    expect(database.query).not.toHaveBeenCalled();
  });

  it('lists user materials and normalizes optional JSON columns', async () => {
    database.query.mockResolvedValueOnce({rows: [{...material, keyPoints: null, topics: null, analysisProvider: null}]});
    await expect(service.list('user-1')).resolves.toEqual([{...material, keyPoints: [], topics: [], analysisProvider: 'local'}]);
    expect(database.query.mock.calls[0][0]).toContain('WHERE user_id = $1 ORDER BY created_at DESC');
    expect(database.query.mock.calls[0][1]).toEqual(['user-1']);
  });

  it('finds a material only for its owner', async () => {
    await expect(service.findOne('user-1', material.id)).resolves.toEqual(material);
    expect(database.query.mock.calls[0][0]).toContain('WHERE id = $1 AND user_id = $2');
    expect(database.query.mock.calls[0][1]).toEqual([material.id, 'user-1']);
  });

  it('returns not found for a material owned by another user or a missing id', async () => {
    database.query.mockResolvedValueOnce({rows: []});
    await expect(service.findOne('other-user', material.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes only the matching user-owned material', async () => {
    await expect(service.remove('user-1', material.id)).resolves.toBeUndefined();
    expect(database.query.mock.calls[0][0]).toContain('DELETE FROM study_materials WHERE id = $1 AND user_id = $2');
    expect(database.query.mock.calls[0][1]).toEqual([material.id, 'user-1']);

    database.query.mockResolvedValueOnce({rows: [], rowCount: 0});
    await expect(service.remove('other-user', material.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});
