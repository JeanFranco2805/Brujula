import AsyncStorage from '@react-native-async-storage/async-storage';
import type {LocalStudySession} from './local-study-planner';

function storageKey(ownerId: string) {
  return `brujula.local-study-plan.v1.${encodeURIComponent(ownerId)}`;
}

export async function loadLocalStudyPlan(ownerId: string): Promise<LocalStudySession[]> {
  const saved = await AsyncStorage.getItem(storageKey(ownerId));
  if (!saved) return [];
  try {
    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed)) throw new Error('Invalid study plan');
    return (parsed as LocalStudySession[])
      .filter(isLocalStudySession)
      .sort((left, right) => left.date.localeCompare(right.date) || left.startMinute - right.startMinute || left.id.localeCompare(right.id));
  } catch {
    await AsyncStorage.removeItem(storageKey(ownerId));
    return [];
  }
}

export async function saveLocalStudyPlan(ownerId: string, sessions: LocalStudySession[]) {
  await AsyncStorage.setItem(storageKey(ownerId), JSON.stringify(sessions));
}

export async function replaceLocalMaterialSessions(ownerId: string, materialId: string, sessions: LocalStudySession[]) {
  const current = await loadLocalStudyPlan(ownerId);
  const retained = current.filter(session => session.materialId !== materialId || session.status !== 'planned');
  const next = [...retained, ...sessions].sort((left, right) => left.date.localeCompare(right.date) || left.startMinute - right.startMinute || left.id.localeCompare(right.id));
  await saveLocalStudyPlan(ownerId, next);
  return next;
}

export async function removeLocalMaterialSessions(ownerId: string, materialId: string) {
  const current = await loadLocalStudyPlan(ownerId);
  const next = current.filter(session => session.materialId !== materialId);
  await saveLocalStudyPlan(ownerId, next);
  return next;
}

function isLocalStudySession(value: unknown): value is LocalStudySession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<LocalStudySession>;
  return typeof session.id === 'string'
    && typeof session.materialId === 'string'
    && typeof session.topicIndex === 'number'
    && Number.isInteger(session.topicIndex)
    && typeof session.title === 'string'
    && session.title.trim().length > 0
    && session.title.length <= 200
    && isLocalDate(session.date)
    && typeof session.startMinute === 'number'
    && Number.isInteger(session.startMinute)
    && session.startMinute >= 0
    && session.startMinute < 24 * 60
    && typeof session.durationMinutes === 'number'
    && Number.isInteger(session.durationMinutes)
    && session.durationMinutes > 0
    && session.durationMinutes <= 360
    && (session.source === undefined || ['material', 'reminder'].includes(session.source))
    && (session.source === 'reminder' ? session.materialId === '' && session.topicIndex === -1 : session.materialId.length > 0 && session.topicIndex >= 0)
    && (session.reminderEnabled === undefined || typeof session.reminderEnabled === 'boolean')
    && (session.reminderMinutesBefore === undefined || (Number.isInteger(session.reminderMinutesBefore) && session.reminderMinutesBefore >= 0 && session.reminderMinutesBefore <= 120))
    && ['read', 'listen', 'visual', 'practice'].includes(session.learningFormat ?? '')
    && ['planned', 'completed', 'skipped'].includes(session.status ?? '');
}

function isLocalDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}
