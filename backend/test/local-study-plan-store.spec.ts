const mockValues = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((key: string) => Promise.resolve(mockValues.get(key) ?? null)),
    setItem: jest.fn((key: string, value: string) => { mockValues.set(key, value); return Promise.resolve(); }),
    removeItem: jest.fn((key: string) => { mockValues.delete(key); return Promise.resolve(); }),
  },
}));

import {loadLocalStudyPlan, removeLocalMaterialSessions, replaceLocalMaterialSessions, saveLocalStudyPlan} from '../../src/services/local-study-plan-store';
import type {LocalStudySession} from '../../src/services/local-study-planner';

const session = (id: string, materialId: string, status: LocalStudySession['status'] = 'planned'): LocalStudySession => ({
  id,
  materialId,
  topicIndex: 0,
  title: `Tema ${id}`,
  date: '2026-10-12',
  startMinute: 1080,
  durationMinutes: 25,
  learningFormat: 'practice',
  status,
});

describe('local study plan storage', () => {
  beforeEach(() => mockValues.clear());

  it('persists sessions independently for each local account and sorts them by date and time', async () => {
    await saveLocalStudyPlan('student A', [session('late', 'pdf-1'), {...session('early', 'pdf-1'), date: '2026-10-09'}]);
    await saveLocalStudyPlan('student B', [session('other', 'pdf-2')]);

    await expect(loadLocalStudyPlan('student A')).resolves.toEqual([
      {...session('early', 'pdf-1'), date: '2026-10-09'},
      session('late', 'pdf-1'),
    ]);
    await expect(loadLocalStudyPlan('student B')).resolves.toEqual([session('other', 'pdf-2')]);
  });

  it('replaces only pending sessions for one PDF and preserves completed study history', async () => {
    await saveLocalStudyPlan('student', [session('old-pending', 'pdf-1'), session('done', 'pdf-1', 'completed'), session('other-file', 'pdf-2')]);

    const updated = await replaceLocalMaterialSessions('student', 'pdf-1', [session('new-1', 'pdf-1'), session('new-2', 'pdf-1')]);

    expect(updated.map(item => item.id)).toEqual(['done', 'new-1', 'new-2', 'other-file']);
    expect(await loadLocalStudyPlan('student')).toEqual(updated);
  });

  it('removes all sessions for a deleted local PDF while keeping other files', async () => {
    await saveLocalStudyPlan('student', [session('removed', 'pdf-1'), session('kept', 'pdf-2')]);

    await expect(removeLocalMaterialSessions('student', 'pdf-1')).resolves.toEqual([session('kept', 'pdf-2')]);
  });

  it('clears corrupt local data and ignores invalid session records', async () => {
    mockValues.set('brujula.local-study-plan.v1.broken', 'not-json');
    await expect(loadLocalStudyPlan('broken')).resolves.toEqual([]);
    expect(mockValues.has('brujula.local-study-plan.v1.broken')).toBe(false);

    await saveLocalStudyPlan('broken', [session('good', 'pdf-1'), {id: 'bad'} as LocalStudySession]);
    await expect(loadLocalStudyPlan('broken')).resolves.toEqual([session('good', 'pdf-1')]);
  });
});
