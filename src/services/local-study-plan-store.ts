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
    && Number.isInteger(session.topicIndex)
    && typeof session.title === 'string'
    && typeof session.date === 'string'
    && Number.isInteger(session.startMinute)
    && Number.isInteger(session.durationMinutes)
    && ['read', 'listen', 'visual', 'practice'].includes(session.learningFormat ?? '')
    && ['planned', 'completed', 'skipped'].includes(session.status ?? '');
}
