import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

export type LocalVoiceNote = {
  id: string;
  title: string;
  uri: string;
  durationMillis: number;
  createdAt: string;
};

const DIRECTORY = `${FileSystem.documentDirectory ?? ''}brujula-voice-notes/`;

function storageKey(ownerId: string) {
  return `brujula.local-voice-notes.v1.${encodeURIComponent(ownerId)}`;
}

export async function loadLocalVoiceNotes(ownerId: string): Promise<LocalVoiceNote[]> {
  const saved = await AsyncStorage.getItem(storageKey(ownerId));
  if (!saved) return [];
  try {
    const value: unknown = JSON.parse(saved);
    return Array.isArray(value) ? value.filter(isLocalVoiceNote) : [];
  } catch {
    await AsyncStorage.removeItem(storageKey(ownerId));
    return [];
  }
}

export async function saveLocalVoiceNote(ownerId: string, sourceUri: string, durationMillis: number) {
  if (!FileSystem.documentDirectory) throw new Error('El almacenamiento local no está disponible en este dispositivo.');
  const directory = await FileSystem.getInfoAsync(DIRECTORY);
  if (!directory.exists) await FileSystem.makeDirectoryAsync(DIRECTORY, {intermediates: true});

  const createdAt = new Date().toISOString();
  const id = `voice-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const uri = `${DIRECTORY}${id}.m4a`;
  await FileSystem.copyAsync({from: sourceUri, to: uri});
  const note: LocalVoiceNote = {
    id,
    title: `Apunte de voz · ${new Date(createdAt).toLocaleDateString('es')}`,
    uri,
    durationMillis,
    createdAt,
  };
  try {
    const notes = await loadLocalVoiceNotes(ownerId);
    await AsyncStorage.setItem(storageKey(ownerId), JSON.stringify([note, ...notes]));
  } catch (error) {
    await FileSystem.deleteAsync(uri, {idempotent: true}).catch(() => undefined);
    throw error;
  }
  return note;
}

export async function deleteLocalVoiceNote(ownerId: string, id: string) {
  const notes = await loadLocalVoiceNotes(ownerId);
  const selected = notes.find(note => note.id === id);
  if (!selected) return;
  await FileSystem.deleteAsync(selected.uri, {idempotent: true});
  await AsyncStorage.setItem(storageKey(ownerId), JSON.stringify(notes.filter(note => note.id !== id)));
}

function isLocalVoiceNote(value: unknown): value is LocalVoiceNote {
  if (!value || typeof value !== 'object') return false;
  const note = value as Partial<LocalVoiceNote>;
  return typeof note.id === 'string'
    && typeof note.title === 'string'
    && typeof note.uri === 'string'
    && typeof note.durationMillis === 'number'
    && typeof note.createdAt === 'string';
}
