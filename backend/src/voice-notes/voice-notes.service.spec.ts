import {NotFoundException} from '@nestjs/common';
import {DatabaseService} from '../database/database.service';
import {StudyContentService} from '../materials/study-content.service';
import {AudioTranscriptionService} from './audio-transcription.service';
import {VoiceNotesService} from './voice-notes.service';

describe('VoiceNotesService', () => {
  const database = {query: jest.fn()};
  const transcription = {transcribe: jest.fn()};
  const studyContent = {analyze: jest.fn()};
  let service: VoiceNotesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new VoiceNotesService(database as unknown as DatabaseService, transcription as unknown as AudioTranscriptionService, studyContent as unknown as StudyContentService);
    transcription.transcribe.mockResolvedValue('Explicar la mitosis celular.');
    studyContent.analyze.mockResolvedValue({summary: 'Resumen claro', keyPoints: ['Mitosis'], topics: [], provider: 'local'});
    database.query.mockResolvedValue({rows: [{id: 'note-1', title: 'Clase de biología', keyPoints: ['Mitosis']}]});
  });

  it('transcribes, summarizes, and persists the note under the signed-in user', async () => {
    const file = {originalname: 'Clase-de-biologia.m4a'} as Express.Multer.File;
    await expect(service.create('user-1', file)).resolves.toMatchObject({id: 'note-1', title: 'Clase de biología'});
    expect(transcription.transcribe).toHaveBeenCalledWith(file);
    expect(studyContent.analyze).toHaveBeenCalledWith('Explicar la mitosis celular.');
    expect(database.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO voice_notes'), [
      'user-1', 'Clase de biologia', 'Clase-de-biologia.m4a', 'Explicar la mitosis celular.', 'Resumen claro', '["Mitosis"]',
    ]);
  });

  it('lists and reads notes only for their owner', async () => {
    database.query.mockResolvedValueOnce({rows: [{id: 'note-1', keyPoints: null}]});
    await expect(service.list('user-1')).resolves.toEqual([{id: 'note-1', keyPoints: []}]);
    database.query.mockResolvedValueOnce({rows: []});
    await expect(service.findOne('user-2', 'note-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(database.query).toHaveBeenLastCalledWith(expect.stringContaining('WHERE id = $1 AND user_id = $2'), ['note-1', 'user-2']);
  });

  it('deletes only notes owned by the requester', async () => {
    database.query.mockResolvedValueOnce({rowCount: 1});
    await expect(service.remove('user-1', 'note-1')).resolves.toBeUndefined();
    database.query.mockResolvedValueOnce({rowCount: 0});
    await expect(service.remove('user-2', 'note-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
