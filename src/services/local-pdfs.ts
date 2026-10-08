import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

export type LocalPdf = {
  id: string;
  name: string;
  uri: string;
  size: number;
  importedAt: string;
};

type PickedPdf = {uri: string; name: string; size?: number};

const LOCAL_PDF_DIRECTORY = `${FileSystem.documentDirectory ?? ''}brujula-pdfs/`;

function storageKey(ownerId: string) {
  return `brujula.local-pdfs.v1.${encodeURIComponent(ownerId)}`;
}

export async function loadLocalPdfs(ownerId: string): Promise<LocalPdf[]> {
  const saved = await AsyncStorage.getItem(storageKey(ownerId));
  if (!saved) return [];

  let files: LocalPdf[];
  try {
    const parsed: unknown = JSON.parse(saved);
    files = Array.isArray(parsed) ? parsed as LocalPdf[] : [];
  } catch {
    await AsyncStorage.removeItem(storageKey(ownerId));
    return [];
  }

  const existing = await Promise.all(files.map(async file => {
    if (!file?.uri || !file.id || !file.name) return null;
    const info = await FileSystem.getInfoAsync(file.uri).catch(() => null);
    return info?.exists ? file : null;
  }));
  const available = existing.filter((file): file is LocalPdf => file !== null);
  if (available.length !== files.length) await AsyncStorage.setItem(storageKey(ownerId), JSON.stringify(available));
  return available;
}

export async function importLocalPdf(ownerId: string, picked: PickedPdf): Promise<LocalPdf> {
  if (!FileSystem.documentDirectory) throw new Error('El almacenamiento local no está disponible en este dispositivo.');
  const directoryInfo = await FileSystem.getInfoAsync(LOCAL_PDF_DIRECTORY);
  if (!directoryInfo.exists) await FileSystem.makeDirectoryAsync(LOCAL_PDF_DIRECTORY, {intermediates: true});

  const id = `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const safeName = picked.name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 180) || 'material.pdf';
  const uri = `${LOCAL_PDF_DIRECTORY}${id}-${safeName}`;
  await FileSystem.copyAsync({from: picked.uri, to: uri});

  try {
    const info = await FileSystem.getInfoAsync(uri);
    const file: LocalPdf = {
      id,
      name: picked.name || safeName,
      uri,
      size: info.exists ? info.size ?? picked.size ?? 0 : picked.size ?? 0,
      importedAt: new Date().toISOString(),
    };
    const files = await loadLocalPdfs(ownerId);
    await AsyncStorage.setItem(storageKey(ownerId), JSON.stringify([file, ...files]));
    return file;
  } catch (error) {
    await FileSystem.deleteAsync(uri, {idempotent: true}).catch(() => undefined);
    throw error;
  }
}

export async function deleteLocalPdf(ownerId: string, id: string) {
  const files = await loadLocalPdfs(ownerId);
  const selected = files.find(file => file.id === id);
  if (!selected) return;
  await FileSystem.deleteAsync(selected.uri, {idempotent: true});
  await AsyncStorage.setItem(storageKey(ownerId), JSON.stringify(files.filter(file => file.id !== id)));
}

export async function openLocalPdf(file: LocalPdf) {
  if (!await Sharing.isAvailableAsync()) throw new Error('No hay una aplicación disponible para abrir o compartir este PDF.');
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: `Abrir ${file.name}`,
  });
}
