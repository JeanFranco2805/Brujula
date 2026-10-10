const mockStore = new Map<string, string>();
const mockFiles = new Set<string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((key: string) => Promise.resolve(mockStore.get(key) ?? null)),
    setItem: jest.fn((key: string, value: string) => { mockStore.set(key, value); return Promise.resolve(); }),
    removeItem: jest.fn((key: string) => { mockStore.delete(key); return Promise.resolve(); }),
  },
}));

jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  documentDirectory: 'file:///private/',
  getInfoAsync: jest.fn((uri: string) => Promise.resolve({exists: mockFiles.has(uri) || uri.endsWith('brujula-voice-notes/')})),
  makeDirectoryAsync: jest.fn(() => Promise.resolve()),
  copyAsync: jest.fn(({to}: {to: string}) => { mockFiles.add(to); return Promise.resolve(); }),
  deleteAsync: jest.fn((uri: string) => { mockFiles.delete(uri); return Promise.resolve(); }),
}));

import {deleteLocalVoiceNote, loadLocalVoiceNotes, saveLocalVoiceNote} from '../../src/services/local-voice-notes';

describe('local voice note storage', () => {
  beforeEach(() => {
    mockStore.clear();
    mockFiles.clear();
  });

  it('copies each audio recording into private storage and keeps metadata local to the account', async () => {
    const note = await saveLocalVoiceNote('student-1', 'file:///cache/take.m4a', 17_000);

    expect(note.uri).toContain('file:///private/brujula-voice-notes/voice-');
    expect(note.durationMillis).toBe(17_000);
    await expect(loadLocalVoiceNotes('student-1')).resolves.toEqual([note]);
    await expect(loadLocalVoiceNotes('student-2')).resolves.toEqual([]);
  });

  it('deletes the device file and its local metadata together', async () => {
    const note = await saveLocalVoiceNote('student', 'file:///cache/take.m4a', 2_000);

    await deleteLocalVoiceNote('student', note.id);

    await expect(loadLocalVoiceNotes('student')).resolves.toEqual([]);
    expect(mockFiles.has(note.uri)).toBe(false);
  });
});
