import {BadRequestException, NotFoundException} from '@nestjs/common';
import {DatabaseService} from '../database/database.service';
import {UsersService} from '../users/users.service';
import {StudyPlanService} from './study-plan.service';

describe('StudyPlanService', () => {
  const user = {id: 'user-1', preferences: {formats: ['visual', 'practice'] as ('visual' | 'practice')[], rhythm: 'spaced' as const, minutesPerDay: 25 as const, goal: 'understand' as const}};
  const database = {query: jest.fn()};
  const users = {findById: jest.fn()};
  let service: StudyPlanService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StudyPlanService(database as unknown as DatabaseService, users as unknown as UsersService);
    users.findById.mockResolvedValue(user);
  });

  it('lists sessions in the signed-in user scope', async () => {
    database.query.mockResolvedValue({rows: [{id: 'session-1', title: 'Fotosíntesis'}]});
    await expect(service.list('user-1')).resolves.toEqual([{id: 'session-1', title: 'Fotosíntesis'}]);
    expect(database.query).toHaveBeenCalledWith(expect.stringContaining('WHERE user_id = $1'), ['user-1']);
  });

  it('generates sessions from uploaded topics and profile preferences', async () => {
    database.query
      .mockResolvedValueOnce({rows: [{id: 'material-1', originalName: 'Bio.pdf', topics: [{title: 'Fotosíntesis'}, {title: 'Cloroplastos'}]}]})
      .mockResolvedValueOnce({rows: [{id: 's1'}, {id: 's2'}]});

    await expect(service.generate('user-1', 2, 600)).resolves.toEqual([{id: 's1'}, {id: 's2'}]);
    expect(users.findById).toHaveBeenCalledWith('user-1');
    expect(database.query).toHaveBeenNthCalledWith(2, expect.stringContaining('jsonb_to_recordset'), [
      'user-1', expect.any(String),
    ]);
    const plan = JSON.parse(database.query.mock.calls[1][1][1]) as Array<Record<string, unknown>>;
    expect(plan).toHaveLength(2);
    expect(plan[0]).toMatchObject({materialId: 'material-1', topicIndex: 0, title: 'Fotosíntesis', startMinute: 600, durationMinutes: 25, learningFormat: 'visual'});
    expect(plan[1]).toMatchObject({materialId: 'material-1', topicIndex: 1, title: 'Cloroplastos', startMinute: 600, durationMinutes: 25, learningFormat: 'practice'});
  });

  it('requires a saved profile and at least one PDF topic to generate a plan', async () => {
    users.findById.mockResolvedValueOnce(null);
    await expect(service.generate('missing')).rejects.toBeInstanceOf(NotFoundException);
    users.findById.mockResolvedValue(user);
    database.query.mockResolvedValueOnce({rows: []});
    await expect(service.generate('user-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('completes and reschedules only sessions owned by the user', async () => {
    database.query.mockResolvedValueOnce({rows: [{id: 's1', status: 'completed'}]});
    await expect(service.complete('user-1', 's1')).resolves.toMatchObject({status: 'completed'});
    database.query.mockResolvedValueOnce({rows: [{id: 's1', date: '2026-10-09', startMinute: 750}]});
    await expect(service.reschedule('user-1', 's1', '2026-10-09', 750)).resolves.toMatchObject({startMinute: 750});
    expect(database.query).toHaveBeenLastCalledWith(expect.stringContaining("status = 'planned'"), ['s1', 'user-1', '2026-10-09', 750]);
  });

  it('rejects impossible dates and reports missing sessions', async () => {
    await expect(service.reschedule('user-1', 's1', '2026-02-31', 600)).rejects.toBeInstanceOf(BadRequestException);
    database.query.mockResolvedValueOnce({rows: []});
    await expect(service.complete('user-1', 'foreign-session')).rejects.toBeInstanceOf(NotFoundException);
  });
});
