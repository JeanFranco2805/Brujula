const mockStore = new Map<string, string>();
const mockFiles = new Map<string, number>();

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
  getInfoAsync: jest.fn((uri: string) => Promise.resolve({exists: mockFiles.has(uri), size: mockFiles.get(uri)})),
  makeDirectoryAsync: jest.fn(() => Promise.resolve()),
  copyAsync: jest.fn(({to}: {to: string}) => { mockFiles.set(to, 1234); return Promise.resolve(); }),
  deleteAsync: jest.fn((uri: string) => { mockFiles.delete(uri); return Promise.resolve(); }),
}));

jest.mock('expo-sharing', () => ({
  __esModule: true,
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  shareAsync: jest.fn(() => Promise.resolve()),
}));

import {deleteLocalPdf, importLocalPdf, loadLocalPdfs, saveLocalPdfAnalysis} from '../../src/services/local-pdfs';
import {analyzeLocalStudyText} from '../../src/services/local-study-planner';

describe('local PDF storage', () => {
  beforeEach(() => {
    mockStore.clear();
    mockFiles.clear();
  });

  it('copies an imported PDF to private device storage and scopes it to the local account', async () => {
    const pdf = await importLocalPdf('student-1', {uri: 'content://downloads/biology', name: 'Biología.pdf', size: 2000});

    expect(pdf.uri).toContain('file:///private/brujula-pdfs/');
    expect(mockFiles.has(pdf.uri)).toBe(true);
    await expect(loadLocalPdfs('student-1')).resolves.toEqual([pdf]);
    await expect(loadLocalPdfs('student-2')).resolves.toEqual([]);
  });

  it('stores extracted study content beside the local PDF and deletes it with the file', async () => {
    const pdf = await importLocalPdf('student', {uri: 'content://downloads/biology', name: 'Biología.pdf'});
    const analysis = analyzeLocalStudyText('La célula contiene material genético y una membrana que la separa del entorno. Las células eucariotas poseen un núcleo que protege su información genética. La membrana regula el intercambio de sustancias entre el interior celular y el ambiente.');

    const updated = await saveLocalPdfAnalysis('student', pdf.id, analysis);
    expect((await loadLocalPdfs('student'))[0].analysis).toEqual(analysis);
    expect(updated.analysis?.analysisProvider).toBe('on-device');

    await deleteLocalPdf('student', pdf.id);
    expect(mockFiles.has(pdf.uri)).toBe(false);
    await expect(loadLocalPdfs('student')).resolves.toEqual([]);
  });
});
