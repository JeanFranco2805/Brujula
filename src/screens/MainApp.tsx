import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import {RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState} from 'expo-audio';
import * as Speech from 'expo-speech';
import {apiRequest} from '../api/client';
import {cancelStudyReminder, exportSessionsToDeviceCalendar, scheduleStudyReminders, syncEnabledStudyTools, type DeviceStudySession} from '../services/device-study-tools';
import {deleteLocalPdf, importLocalPdf, loadLocalPdfs, openLocalPdf, type LocalPdf} from '../services/local-pdfs';
import {AppPage, Brand, Pill, PrimaryButton, SectionHeading, SurfaceCard} from '../components/ui';
import {colors, radius} from '../theme';
import type {LearningFormat, UserProfile} from '../types';

export type TabKey = 'home' | 'materials' | 'plan' | 'progress';
type MaterialRecord = {id: string; originalName: string; fileSize: number; summary: string; keyPoints: string[]; topics: {title: string; explanation: string; questions: string[]}[]; analysisProvider: 'openai' | 'local'};
type Material = {id?: string; name: string; topics: number; progress: number; summary?: string; isLocal?: boolean; localFile?: LocalPdf};
type VoiceNoteRecord = {id: string; title: string; transcript: string; summary: string; keyPoints: string[]; createdAt: string};
type StudySessionRecord = DeviceStudySession & {materialId: string; topicIndex: number; learningFormat: LearningFormat};

const formatLabels: Record<LearningFormat, string> = {
  read: 'Leer',
  listen: 'Escuchar',
  visual: 'Ver esquemas',
  practice: 'Practicar',
};

export function MainApp({
  account,
  accessToken,
  activeTab,
  onEditPreferences,
  onSignOut,
  onOpenLesson,
  onOpenMaterials,
}: {
  account: UserProfile;
  accessToken: string | null;
  activeTab: TabKey;
  onEditPreferences: () => void;
  onSignOut: () => void;
  onOpenLesson: (materialId?: string, topicIndex?: number) => void;
  onOpenMaterials: () => void;
}) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [sessions, setSessions] = useState<StudySessionRecord[]>([]);
  const firstName = account.name.trim().split(/\s+/)[0] || 'Estudiante';

  useEffect(() => {
    let active = true;
    loadLocalPdfs(account.id)
      .then(files => { if (active) setMaterials(previous => [...previous.filter(material => !material.isLocal), ...files.map(toLocalMaterial)]); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [account.id]);

  useEffect(() => {
    let active = true;
    if (!accessToken || accessToken.startsWith('local:')) return;
    apiRequest<MaterialRecord[]>('/materials', {}, accessToken)
      .then(records => { if (active) setMaterials(previous => [...previous.filter(material => material.isLocal), ...records.map(toMaterial)]); })
      .catch(() => undefined);
    apiRequest<StudySessionRecord[]>('/study-plan', {}, accessToken)
      .then(records => { if (active) setSessions(records); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [accessToken]);

  return (
    <AppPage edges={['top', 'right', 'left']}>
      <View style={styles.topbar}>
        <Brand compact />
        <View style={styles.topActions}>
          <Pressable style={styles.topIconButton} onPress={() => Alert.alert('Recordatorios', 'Las notificaciones del dispositivo se conectarán en la siguiente etapa.')} accessibilityLabel="Recordatorios">
            <Ionicons name="notifications-outline" size={20} color={colors.text} />
          </Pressable>
          <Pressable style={styles.avatar} onPress={onEditPreferences} accessibilityLabel="Editar preferencias de estudio">
            <Text style={styles.avatarText}>{firstName.slice(0, 1).toUpperCase()}</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.mainContent} showsVerticalScrollIndicator={false}>
        {activeTab === 'home' ? <HomeTab firstName={firstName} account={account} materials={materials} sessions={sessions} onContinue={onOpenLesson} onOpenMaterials={onOpenMaterials} onEditPreferences={onEditPreferences} /> : null}
        {activeTab === 'materials' ? <MaterialsTab ownerId={account.id} accessToken={accessToken} materials={materials} setMaterials={setMaterials} onOpenLesson={onOpenLesson} /> : null}
        {activeTab === 'plan' ? <PlanTab accessToken={accessToken} onOpenLesson={onOpenLesson} /> : null}
        {activeTab === 'progress' ? <ProgressTab account={account} materials={materials} sessions={sessions} onEditPreferences={onEditPreferences} /> : null}
        <Pressable style={styles.signOut} onPress={() => Alert.alert('Cerrar sesión', '¿Quieres volver a la pantalla de acceso?', [{text: 'Cancelar', style: 'cancel'}, {text: 'Cerrar sesión', style: 'destructive', onPress: onSignOut}])}>
          <Ionicons name="log-out-outline" size={16} color={colors.muted} /><Text style={styles.signOutText}>Cerrar sesión</Text>
        </Pressable>
      </ScrollView>

    </AppPage>
  );
}

function HomeTab({firstName, account, materials, sessions, onContinue, onOpenMaterials, onEditPreferences}: {firstName: string; account: UserProfile; materials: Material[]; sessions: StudySessionRecord[]; onContinue: (materialId?: string, topicIndex?: number) => void; onOpenMaterials: () => void; onEditPreferences: () => void}) {
  const nextSession = sessions.find(session => session.status === 'planned');
  const nextMaterial = materials.find(material => material.id === nextSession?.materialId) ?? materials[0];
  const completedThisWeek = getCurrentWeekSessions(sessions).filter(session => session.status === 'completed');
  return (
    <>
      <Text style={styles.greeting}>Hola, {firstName}</Text>
      <Text style={styles.subGreeting}>Un paso claro para tu estudio de hoy.</Text>

      <View style={styles.todayCard}>
        <View style={styles.todayHeader}>
          <Text style={styles.todayEyebrow}>{nextSession ? 'TU PRÓXIMA SESIÓN' : 'EMPIEZA A ESTUDIAR'}</Text>
          <View style={styles.todayDate}><Ionicons name="calendar-outline" size={14} color={colors.muted} /><Text style={styles.todayDateText}>{nextSession ? `${nextSession.durationMinutes} min` : 'A tu ritmo'}</Text></View>
        </View>
        <View style={styles.todayBody}>
          <View style={styles.subjectIcon}><Ionicons name="leaf-outline" size={27} color={colors.teal} /></View>
          <View style={styles.todayCopy}><Text style={styles.todayTitle}>{nextSession?.title ?? nextMaterial?.name ?? 'Todavía no hay un plan'}</Text><Text style={styles.todayDetail}>{nextSession ? `${nextSession.date} · ${formatLabels[nextSession.learningFormat]}` : nextMaterial?.isLocal ? 'PDF guardado en este dispositivo.' : 'Importa un PDF para tenerlo a mano.'}</Text></View>
        </View>
        <PrimaryButton title={nextSession ? 'Continuar estudiando' : 'Importar material'} icon={nextSession ? 'play' : 'add'} onPress={nextSession ? () => onContinue(nextSession.materialId, nextSession.topicIndex) : onOpenMaterials} />
      </View>

      <SurfaceCard style={styles.weekCard}>
        <View style={styles.weekTitleRow}><Text style={styles.sectionTitle}>Tu progreso esta semana</Text><Text style={styles.weekCount}>{completedThisWeek.length} de 5</Text></View>
        <View style={styles.progressTrack}><View style={[styles.progressFill, {width: `${Math.min(completedThisWeek.length / 5, 1) * 100}%`}]} /></View>
        <Text style={styles.cardCaption}>{completedThisWeek.length ? 'Vas avanzando a tu ritmo.' : 'Completa una sesión para comenzar tu progreso.'}</Text>
      </SurfaceCard>

      <SectionHeading title="Material reciente" action="Ver todo" onAction={onOpenMaterials} />
      <Pressable style={styles.materialMini} onPress={onOpenMaterials}>
        <View style={styles.pdfIcon}><Ionicons name={materials[0] ? 'document-text' : 'add'} size={20} color={colors.primary} /></View>
        <View style={styles.materialMiniCopy}><Text style={styles.materialName}>{materials[0]?.name ?? 'Agrega tu primer material'}</Text><Text style={styles.materialMeta}>{materials[0]?.isLocal ? 'PDF guardado en este dispositivo' : materials[0] ? `${materials[0].topics} temas organizados` : 'Importa un PDF para guardarlo aquí'}</Text></View>
        <Ionicons name="chevron-forward" size={20} color={colors.muted} />
      </Pressable>

      <SurfaceCard style={styles.preferencesCard}>
        <View style={styles.preferenceTitleRow}><View><Text style={styles.sectionTitle}>Tu forma de estudiar</Text><Text style={styles.cardCaption}>Personalízala cuando quieras</Text></View><Pressable onPress={onEditPreferences} style={styles.editButton}><Ionicons name="create-outline" size={18} color={colors.primary} /></Pressable></View>
        <View style={styles.pillRow}>
          {account.preferences.formats.slice(0, 3).map(format => <Pill key={format} label={formatLabels[format]} selected />)}
        </View>
        <Text style={styles.preferenceMeta}>{account.preferences.minutesPerDay} min al día · {account.preferences.rhythm === 'spaced' ? 'repasos espaciados' : 'bloques largos'}</Text>
      </SurfaceCard>
    </>
  );
}

function MaterialsTab({ownerId, accessToken, materials, setMaterials, onOpenLesson}: {ownerId: string; accessToken: string | null; materials: Material[]; setMaterials: React.Dispatch<React.SetStateAction<Material[]>>; onOpenLesson: () => void}) {
  const [uploading, setUploading] = useState(false);

  const importPdf = async () => {
    setUploading(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({type: 'application/pdf', copyToCacheDirectory: true});
      if (result.canceled || !result.assets[0]) return;
      const saved = await importLocalPdf(ownerId, result.assets[0]);
      setMaterials(previous => [toLocalMaterial(saved), ...previous.filter(item => item.id !== saved.id)]);
      Alert.alert('PDF guardado', `${saved.name} quedó guardado en el dispositivo y estará disponible sin conexión.`);
    } catch (error) {
      Alert.alert('No se pudo importar el PDF', error instanceof Error ? error.message : 'Ocurrió un error inesperado al guardar el archivo en este dispositivo.');
    } finally {
      setUploading(false);
    }
  };

  const removeMaterial = (material: Material) => {
    if (material.isLocal && material.localFile) {
      Alert.alert('Eliminar PDF del dispositivo', `¿Quieres borrar “${material.name}” de Brújula y de este dispositivo?`, [
        {text: 'Cancelar', style: 'cancel'},
        {text: 'Eliminar', style: 'destructive', onPress: () => {
          void deleteLocalPdf(ownerId, material.localFile!.id)
            .then(() => setMaterials(previous => previous.filter(item => item.id !== material.id)))
            .catch(error => Alert.alert('No se pudo eliminar el PDF', error instanceof Error ? error.message : 'Inténtalo de nuevo.'));
        }},
      ]);
      return;
    }
    if (!accessToken || !material.id) return;
    Alert.alert('Eliminar material', `¿Quieres eliminar “${material.name}” y sus sesiones asociadas?`, [
      {text: 'Cancelar', style: 'cancel'},
      {text: 'Eliminar', style: 'destructive', onPress: () => {
        void apiRequest<{deleted: boolean}>(`/materials/${material.id}`, {method: 'DELETE'}, accessToken)
          .then(() => setMaterials(previous => previous.filter(item => item.id !== material.id)))
          .catch(error => Alert.alert('No se pudo eliminar', error instanceof Error ? error.message : 'Inténtalo de nuevo.'));
      }},
    ]);
  };

  return (
    <>
      <Text style={styles.pageTitle}>Materiales</Text>
      <Text style={styles.subGreeting}>Elige un PDF de Archivos. Se guarda en este dispositivo y no se sube a un servidor.</Text>
      <PrimaryButton title={uploading ? 'Guardando PDF…' : 'Importar PDF'} icon={uploading ? 'hourglass-outline' : 'add'} onPress={() => { void importPdf(); }} disabled={uploading} />
      <View style={styles.materialList}>
        {materials.map((material, index) => (
          <Pressable key={material.id ?? `${material.name}-${index}`} style={styles.materialCard} onPress={() => {
            if (material.localFile) void openLocalPdf(material.localFile).catch(error => Alert.alert('No se pudo abrir el PDF', error instanceof Error ? error.message : 'Inténtalo de nuevo.'));
            else if (material.summary) Alert.alert(material.name, material.summary);
            else onOpenLesson();
          }}>
            <View style={[styles.pdfIcon, index % 2 === 1 && styles.pdfIconAlt]}><Ionicons name="document-text" size={21} color={index % 2 === 1 ? colors.teal : colors.primary} /></View>
            <View style={styles.materialInfo}><Text numberOfLines={1} style={styles.materialName}>{material.name}</Text><Text style={styles.materialMeta}>{material.isLocal ? `En este dispositivo · ${formatFileSize(material.localFile?.size ?? 0)}` : `${material.topics} temas organizados`}</Text>
              {!material.isLocal ? <><Text style={styles.progressLabel}>{material.progress} de {material.topics} temas</Text><View style={styles.progressTrackSmall}><View style={[styles.progressFillSmall, {width: `${material.topics ? (material.progress / material.topics) * 100 : 0}%`}]} /></View></> : null}
            </View>
            <View style={styles.materialActions}><Pressable onPress={event => { event.stopPropagation(); removeMaterial(material); }} hitSlop={10} accessibilityLabel={`Eliminar ${material.name}`}><Ionicons name="trash-outline" size={18} color={colors.muted} /></Pressable><Ionicons name={material.isLocal ? 'share-outline' : 'chevron-forward'} size={19} color={colors.muted} /></View>
          </Pressable>
        ))}
      </View>
      <View style={styles.infoBox}><Ionicons name="phone-portrait-outline" size={18} color={colors.primary} /><Text style={styles.infoBoxText}>Los PDFs se copian al almacenamiento privado de Brújula y siguen disponibles sin conexión. Toca uno para abrirlo con una aplicación de tu teléfono.</Text></View>
      <VoiceNotesPanel accessToken={accessToken} />
    </>
  );
}

function toMaterial(record: MaterialRecord): Material {
  return {id: record.id, name: record.originalName, topics: record.topics?.length ?? 0, progress: 0, summary: record.summary};
}

function toLocalMaterial(file: LocalPdf): Material {
  return {id: file.id, name: file.name, topics: 0, progress: 0, isLocal: true, localFile: file};
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function VoiceNotesPanel({accessToken}: {accessToken: string | null}) {
  const recorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const [uploading, setUploading] = useState(false);
  const [notes, setNotes] = useState<VoiceNoteRecord[]>([]);

  useEffect(() => {
    let active = true;
    if (!accessToken || accessToken.startsWith('local:')) return;
    apiRequest<VoiceNoteRecord[]>('/voice-notes', {}, accessToken)
      .then(records => { if (active) setNotes(records); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [accessToken]);

  const recordOrTranscribe = async () => {
    if (!accessToken || accessToken.startsWith('local:')) {
      Alert.alert('Conecta Brújula API', 'Las notas de voz se guardan y transcriben en una cuenta conectada al backend.');
      return;
    }
    if (!recorderState.isRecording) {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permiso requerido', 'Permite el uso del micrófono para grabar tus apuntes.');
        return;
      }
      try {
        await setAudioModeAsync({allowsRecording: true, playsInSilentMode: true});
        await recorder.prepareToRecordAsync();
        recorder.record();
      } catch {
        Alert.alert('No se pudo iniciar la grabación', 'Revisa el permiso del micrófono e inténtalo otra vez.');
      }
      return;
    }

    setUploading(true);
    try {
      await recorder.stop();
      await setAudioModeAsync({allowsRecording: false, playsInSilentMode: true});
      if (!recorder.uri) throw new Error('No encontramos el archivo de audio grabado.');
      const recordedAt = new Date().toLocaleString('sv-SE').replace(' ', '-').replace(/:/g, '-');
      const fileName = `Apunte-${recordedAt}.m4a`;
      const is3gp = fileName.toLowerCase().endsWith('.3gp');
      const body = new FormData();
      body.append('file', {uri: recorder.uri, name: fileName, type: is3gp ? 'audio/3gpp' : 'audio/mp4'} as unknown as Blob);
      const note = await apiRequest<VoiceNoteRecord>('/voice-notes', {method: 'POST', body}, accessToken);
      setNotes(previous => [note, ...previous]);
      Alert.alert('Apunte guardado', note.summary);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Revisa la conexión y vuelve a intentarlo.';
      Alert.alert('No se pudo guardar el apunte', message);
    } finally {
      setUploading(false);
    }
  };

  const removeNote = (note: VoiceNoteRecord) => {
    if (!accessToken) return;
    Alert.alert('Eliminar apunte', `¿Quieres eliminar “${note.title}” y su transcripción?`, [
      {text: 'Cancelar', style: 'cancel'},
      {text: 'Eliminar', style: 'destructive', onPress: () => {
        void apiRequest<{deleted: boolean}>(`/voice-notes/${note.id}`, {method: 'DELETE'}, accessToken)
          .then(() => setNotes(previous => previous.filter(item => item.id !== note.id)))
          .catch(error => Alert.alert('No se pudo eliminar', error instanceof Error ? error.message : 'Inténtalo de nuevo.'));
      }},
    ]);
  };

  return (
    <SurfaceCard style={styles.voiceNotesCard}>
      <View style={styles.voiceNotesHeading}><View style={{flex: 1}}><Text style={styles.sectionTitle}>Apuntes de voz</Text><Text style={styles.cardCaption}>Graba una idea y Brújula la transcribe y resume.</Text></View><Ionicons name="mic-outline" size={22} color={colors.primary} /></View>
      <PrimaryButton
        title={uploading ? 'Transcribiendo…' : recorderState.isRecording ? `Detener y guardar · ${Math.round(recorderState.durationMillis / 1000)} s` : 'Grabar apunte'}
        icon={uploading ? 'hourglass-outline' : recorderState.isRecording ? 'stop' : 'mic'}
        onPress={() => { void recordOrTranscribe(); }}
        disabled={uploading}
      />
      {notes.slice(0, 4).map(note => (
        <Pressable key={note.id} style={styles.voiceNoteRow} onPress={() => Alert.alert(note.title, `${note.summary}\n\n${note.transcript}`)}>
          <View style={styles.voiceNoteIcon}><Ionicons name="mic-outline" size={17} color={colors.teal} /></View>
          <View style={{flex: 1}}><Text style={styles.materialName}>{note.title}</Text><Text style={styles.materialMeta} numberOfLines={2}>{note.summary}</Text></View>
          <Pressable onPress={event => { event.stopPropagation(); removeNote(note); }} hitSlop={10} accessibilityLabel={`Eliminar ${note.title}`}><Ionicons name="trash-outline" size={17} color={colors.muted} /></Pressable>
        </Pressable>
      ))}
      {!notes.length ? <Text style={styles.cardCaption}>Tus transcripciones aparecerán aquí.</Text> : null}
    </SurfaceCard>
  );
}

function PlanTab({accessToken, onOpenLesson}: {accessToken: string | null; onOpenLesson: (materialId?: string, topicIndex?: number) => void}) {
  const [sessions, setSessions] = useState<StudySessionRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const loadPlan = useCallback(async () => {
    if (!accessToken || accessToken.startsWith('local:')) return;
    const result = await apiRequest<StudySessionRecord[]>('/study-plan', {}, accessToken);
    if (result.length) {
      setSessions(result);
      await syncEnabledStudyTools(result).catch(() => undefined);
      return;
    }
    const generated = await apiRequest<StudySessionRecord[]>('/study-plan/generate', {method: 'POST', body: JSON.stringify({})}, accessToken);
    setSessions(generated);
    await syncEnabledStudyTools(generated).catch(() => undefined);
  }, [accessToken]);
  useEffect(() => {
    const timer = setTimeout(() => {
      void loadPlan().catch(error => Alert.alert('No se pudo cargar el plan', error instanceof Error ? error.message : 'Inténtalo de nuevo.'));
    }, 0);
    return () => clearTimeout(timer);
  }, [loadPlan]);

  const reschedule = (session: StudySessionRecord) => {
    const tomorrow = new Date(`${session.date}T00:00:00`);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    Alert.alert('Reprogramar sesión', 'Moverla al siguiente día a las 6:30 p. m.:', [
      {text: 'Reprogramar', onPress: () => {
        if (!accessToken || accessToken.startsWith('local:')) return;
        void apiRequest<StudySessionRecord>(`/study-plan/${session.id}/schedule`, {method: 'PATCH', body: JSON.stringify({date: nextDate, startMinute: 1110})}, accessToken)
          .then(() => loadPlan()).catch(error => Alert.alert('No se pudo reprogramar', error instanceof Error ? error.message : 'Inténtalo de nuevo.'));
      }},
      {text: 'Cancelar', style: 'cancel'},
    ]);
  };
  const markComplete = async (session: StudySessionRecord) => {
    if (!accessToken || accessToken.startsWith('local:')) return;
    try {
      const updated = await apiRequest<StudySessionRecord>(`/study-plan/${session.id}/complete`, {method: 'PATCH'}, accessToken);
      setSessions(previous => previous.map(item => item.id === updated.id ? updated : item));
      await cancelStudyReminder(session.id);
    } catch (error) {
      Alert.alert('No se pudo actualizar la sesión', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    }
  };
  const prepareReminders = async () => {
    setBusy(true);
    try {
      const count = await scheduleStudyReminders(sessions);
      Alert.alert('Recordatorios listos', count ? `Programamos ${count} notificaciones para tus sesiones pendientes.` : 'No hay sesiones futuras en este plan.');
    } catch (error) { Alert.alert('No se pudieron activar los recordatorios', error instanceof Error ? error.message : 'Inténtalo de nuevo.'); }
    finally { setBusy(false); }
  };
  const exportCalendar = async () => {
    setBusy(true);
    try {
      const count = await exportSessionsToDeviceCalendar(sessions);
      Alert.alert('Calendario actualizado', count ? `Añadimos ${count} sesiones al calendario de tu dispositivo.` : 'Las sesiones ya estaban en tu calendario o no hay sesiones pendientes.');
    } catch (error) { Alert.alert('No se pudo acceder al calendario', error instanceof Error ? error.message : 'Inténtalo de nuevo.'); }
    finally { setBusy(false); }
  };
  const weekDays = getCurrentWeekDays();
  return (
    <>
      <Text style={styles.pageTitle}>Tu semana</Text>
      <Text style={styles.subGreeting}>Organiza tu tiempo de estudio con calma.</Text>
      <View style={styles.planActionRow}>
        <Pressable style={styles.planAction} onPress={() => { void prepareReminders(); }} disabled={busy}><Ionicons name="notifications-outline" size={17} color={colors.primary} /><Text style={styles.planActionText}>Recordatorios</Text></Pressable>
        <Pressable style={styles.planAction} onPress={() => { void exportCalendar(); }} disabled={busy}><Ionicons name="calendar-outline" size={17} color={colors.primary} /><Text style={styles.planActionText}>Añadir al calendario</Text></Pressable>
      </View>
      <SurfaceCard style={styles.calendarCard}>
        <View style={styles.weekDays}>
          {weekDays.map(day => <View key={day.date.toISOString()} style={styles.dayCell}><Text style={styles.dayName}>{day.label}</Text><View style={[styles.dayNumber, day.isToday && styles.daySelected]}><Text style={[styles.dayNumberText, day.isToday && styles.dayNumberTextSelected]}>{day.date.getDate()}</Text></View></View>)}
        </View>
      </SurfaceCard>
      <SectionHeading title="Sesiones" />
      {sessions.map((session, index) => {
        const time = `${String(Math.floor(session.startMinute / 60)).padStart(2, '0')}:${String(session.startMinute % 60).padStart(2, '0')}`;
        const dateLabel = new Date(`${session.date}T00:00:00`).toLocaleDateString('es', {weekday: 'short', day: 'numeric', month: 'short'});
        const status = session.status === 'completed' ? 'done' : index === 0 ? 'next' : 'planned';
        return <SessionRow key={session.id} time={time} title={session.title} detail={`${dateLabel} · ${session.durationMinutes} min · ${formatLabels[session.learningFormat]}`} status={status} onPress={() => onOpenLesson(session.materialId, session.topicIndex)} onReschedule={session.status === 'planned' ? () => reschedule(session) : undefined} onComplete={session.status === 'planned' ? () => { void markComplete(session); } : undefined} />;
      })}
      {!sessions.length ? <View style={styles.infoBox}><Ionicons name="cloud-offline-outline" size={18} color={colors.primary} /><Text style={styles.infoBoxText}>Tus PDFs se guardan localmente desde Materiales. La extracción del contenido y la generación automática de sesiones aún no están disponibles. Cuando tengas sesiones, podrás programar recordatorios y añadirlas al calendario.</Text></View> : null}
    </>
  );
}

function ProgressTab({account, materials, sessions, onEditPreferences}: {account: UserProfile; materials: Material[]; sessions: StudySessionRecord[]; onEditPreferences: () => void}) {
  const completedThisWeek = getCurrentWeekSessions(sessions).filter(session => session.status === 'completed');
  const studiedMinutes = completedThisWeek.reduce((total, session) => total + session.durationMinutes, 0);
  return (
    <>
      <Text style={styles.pageTitle}>Tu progreso</Text>
      <Text style={styles.subGreeting}>Cada sesión cuenta. Mira lo que ya avanzaste.</Text>
      <View style={styles.statGrid}>
        <StatCard value={String(completedThisWeek.length)} label="sesiones esta semana" icon="checkmark-circle-outline" tint={colors.tealSoft} />
        <StatCard value={`${studiedMinutes} min`} label="tiempo de estudio" icon="time-outline" tint={colors.amberSoft} />
      </View>
      <SurfaceCard style={styles.progressSummary}>
        <Text style={styles.sectionTitle}>Temas en curso</Text>
        {materials.filter(material => !material.isLocal).map(material => {
          const completed = sessions.filter(session => session.materialId === material.id && session.status === 'completed').length;
          const percent = material.topics ? Math.min(Math.round(completed / material.topics * 100), 100) : 0;
          return <ProgressTopic key={material.id ?? material.name} title={material.name} detail={`${completed} de ${material.topics} sesiones completadas`} percent={percent} />;
        })}
        {!materials.some(material => !material.isLocal) ? <Text style={styles.cardCaption}>Los PDFs locales se guardan en Materiales. El progreso aparece cuando haya sesiones de estudio.</Text> : null}
      </SurfaceCard>
      <SurfaceCard style={styles.preferencesCard}>
        <Text style={styles.sectionTitle}>Preferencias de estudio</Text>
        <Text style={styles.cardCaption}>Brújula las usa para sugerirte un formato inicial.</Text>
        <View style={[styles.pillRow, {marginTop: 13}]}>{account.preferences.formats.map(format => <Pill key={format} label={formatLabels[format]} selected />)}</View>
        <View style={{marginTop: 16}}><PrimaryButton variant="secondary" title="Editar mis preferencias" icon="options-outline" onPress={onEditPreferences} /></View>
      </SurfaceCard>
    </>
  );
}

function getCurrentWeekSessions(sessions: StudySessionRecord[]) {
  const today = new Date();
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const nextMonday = new Date(monday);
  nextMonday.setDate(nextMonday.getDate() + 7);
  return sessions.filter(session => {
    const date = new Date(`${session.date}T00:00:00`);
    return date >= monday && date < nextMonday;
  });
}

function getCurrentWeekDays() {
  const today = new Date();
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return Array.from({length: 7}, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return {date, label: date.toLocaleDateString('es', {weekday: 'short'}).replace('.', ''), isToday: date.toDateString() === today.toDateString()};
  });
}

export function LessonScreen({preferences, accessToken, materialId, topicIndex = 0, onBack}: {preferences: UserProfile['preferences']; accessToken: string | null; materialId?: string; topicIndex?: number; onBack: () => void}) {
  const [mode, setMode] = useState<'read' | 'listen' | 'visual'>('read');
  const [material, setMaterial] = useState<MaterialRecord | null>(null);
  const [showPractice, setShowPractice] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const suggested = useMemo(() => formatLabels[preferences.formats[0]] ?? 'Practicar', [preferences.formats]);
  useEffect(() => {
    let active = true;
    if (!accessToken || accessToken.startsWith('local:') || !materialId) return;
    apiRequest<MaterialRecord>(`/materials/${materialId}`, {}, accessToken)
      .then(record => { if (active) setMaterial(record); })
      .catch(error => Alert.alert('No se pudo abrir el tema', error instanceof Error ? error.message : 'Inténtalo de nuevo.'));
    return () => { active = false; };
  }, [accessToken, materialId]);
  const topic = material?.topics[topicIndex];
  const keyPoints = topic ? [topic.title, topic.explanation, ...topic.questions.slice(0, 3)] : material?.keyPoints ?? [];
  const speechText = topic?.explanation ?? material?.summary ?? '';
  useEffect(() => () => { void Speech.stop(); }, []);
  const toggleSpeech = () => {
    if (speaking) {
      void Speech.stop();
      setSpeaking(false);
      return;
    }
    if (!speechText) {
      Alert.alert('Carga un tema para escuchar', 'Abre esta pantalla desde una sesión de estudio.');
      return;
    }
    setSpeaking(true);
    Speech.speak(speechText, {language: 'es-ES', onDone: () => setSpeaking(false), onStopped: () => setSpeaking(false), onError: () => setSpeaking(false)});
  };
  return (
    <AppPage>
      <View style={styles.lessonTopbar}>
        <Pressable onPress={onBack} style={styles.backCircle}><Ionicons name="arrow-back" size={20} color={colors.text} /></Pressable>
        <Brand compact />
        <Pressable onPress={() => Alert.alert('Guardado', 'El progreso de esta sesión queda guardado en el prototipo local.')}><Ionicons name="bookmark-outline" size={21} color={colors.text} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.lessonContent} showsVerticalScrollIndicator={false}>
        <View style={styles.lessonHeading}>
          <View style={styles.lessonIcon}><Ionicons name="leaf-outline" size={25} color={colors.teal} /></View>
          <View style={{flex: 1}}><Text style={styles.lessonTitle}>{topic?.title ?? material?.originalName ?? 'Tu sesión de estudio'}</Text><Text style={styles.materialMeta}>{material?.originalName ?? 'Contenido de tu material'}</Text></View>
        </View>
        <View style={styles.suggestedBanner}><Ionicons name="sparkles-outline" size={16} color={colors.primary} /><Text style={styles.suggestedText}>Sugerido para ti: {suggested}</Text></View>
        <View style={styles.lessonModes}>
          <LessonMode title="Leer" icon="book-outline" active={mode === 'read'} onPress={() => setMode('read')} />
          <LessonMode title="Escuchar" icon="headset-outline" active={mode === 'listen'} onPress={() => setMode('listen')} />
          <LessonMode title="Esquema" icon="git-network-outline" active={mode === 'visual'} onPress={() => setMode('visual')} />
        </View>
        {mode === 'read' ? <LessonSection title={topic?.title ?? 'Resumen del material'} body={topic?.explanation ?? material?.summary ?? 'Abre una sesión desde tu plan para estudiar los temas que organizamos desde tu PDF.'} /> : null}
        {mode === 'read' && material?.summary ? <LessonSection title="Resumen del documento" body={material.summary} /> : null}
        {mode === 'listen' ? <SurfaceCard style={styles.audioCard}><Pressable style={styles.audioCircle} onPress={toggleSpeech} accessibilityLabel={speaking ? 'Detener lectura en voz alta' : 'Escuchar resumen'}><Ionicons name={speaking ? 'stop' : 'play'} size={20} color={colors.surface} /></Pressable><View style={{flex: 1}}><Text style={styles.sectionTitle}>{speaking ? 'Reproduciendo resumen' : 'Escucha el resumen'}</Text><Text style={styles.cardCaption}>{speechText || 'Carga un tema desde tu plan para escucharlo.'}</Text></View><Ionicons name="volume-high-outline" size={20} color={colors.teal} /></SurfaceCard> : null}
        {mode === 'visual' ? <VisualSummary points={keyPoints} /> : null}
        <SurfaceCard style={styles.sourceCard}><Ionicons name="document-text-outline" size={18} color={colors.muted} /><Text style={styles.sourceText}>{material ? `Organizado desde ${material.originalName}` : 'Contenido de tu sesión'}</Text></SurfaceCard>
        <PrimaryButton title={showPractice ? 'Ocultar preguntas' : `Practicar ${topic?.questions.length || 5} preguntas`} icon="help-circle-outline" onPress={() => {
          if (!topic?.questions.length) { Alert.alert('Sin preguntas', 'Vuelve a procesar el PDF con la API y Brújula preparará preguntas para este tema.'); return; }
          setShowPractice(value => !value);
        }} />
        {showPractice ? topic?.questions.map((question, index) => <LessonSection key={`${index}-${question}`} title={`Pregunta ${index + 1}`} body={question} />) : null}
      </ScrollView>
    </AppPage>
  );
}

function LessonMode({title, icon, active, onPress}: {title: string; icon: keyof typeof Ionicons.glyphMap; active: boolean; onPress: () => void}) {
  return <Pressable onPress={onPress} style={[styles.lessonMode, active && styles.lessonModeActive]}><Ionicons name={icon} size={18} color={active ? colors.primary : colors.muted} /><Text style={[styles.lessonModeText, active && styles.lessonModeTextActive]}>{title}</Text></Pressable>;
}

function LessonSection({title, body}: {title: string; body: string}) {
  return <SurfaceCard style={styles.lessonSection}><Text style={styles.lessonSectionTitle}>{title}</Text><Text style={styles.lessonBody}>{body}</Text></SurfaceCard>;
}

function VisualSummary({points}: {points: string[]}) {
  return (
    <SurfaceCard style={styles.visualCard}>
      <Text style={styles.lessonSectionTitle}>Ideas clave</Text>
      {points.length ? points.slice(0, 6).map((point, index) => <View key={`${index}-${point}`} style={styles.visualPoint}><View style={[styles.visualStepIcon, {backgroundColor: index % 2 ? colors.tealSoft : colors.amberSoft}]}><Text style={styles.visualPointIndex}>{index + 1}</Text></View><Text style={styles.visualPointText}>{point}</Text></View>) : <Text style={styles.lessonBody}>No hay un esquema para este tema todavía.</Text>}
    </SurfaceCard>
  );
}

function SessionRow({time, title, detail, status, onPress, onReschedule, onComplete}: {time: string; title: string; detail: string; status: 'done' | 'next' | 'planned'; onPress: () => void; onReschedule?: () => void; onComplete?: () => void}) {
  const accent = status === 'done' ? colors.teal : status === 'next' ? colors.amber : colors.primary;
  return (
    <Pressable onPress={onPress} style={[styles.sessionRow, status === 'next' && styles.sessionRowNext]}>
      <Text style={styles.sessionTime}>{time}</Text>
      <View style={[styles.sessionAccent, {backgroundColor: accent}]} />
      <View style={styles.sessionCopy}><Text style={styles.materialName}>{title}</Text><Text style={styles.materialMeta}>{detail}</Text></View>
      {onComplete ? <Pressable onPress={onComplete} hitSlop={12} style={styles.rescheduleButton} accessibilityLabel="Completar sesión"><Ionicons name="checkmark-outline" size={19} color={colors.teal} /></Pressable> : null}
      {onReschedule ? <Pressable onPress={onReschedule} hitSlop={12} style={styles.rescheduleButton} accessibilityLabel="Reprogramar sesión"><Ionicons name="refresh-outline" size={19} color={colors.primary} /></Pressable> : <Ionicons name={status === 'done' ? 'checkmark-circle' : 'chevron-forward'} size={19} color={status === 'done' ? colors.teal : colors.muted} />}
    </Pressable>
  );
}

function StatCard({value, label, icon, tint}: {value: string; label: string; icon: keyof typeof Ionicons.glyphMap; tint: string}) {
  return <SurfaceCard style={styles.statCard}><View style={[styles.statIcon, {backgroundColor: tint}]}><Ionicons name={icon} size={19} color={colors.teal} /></View><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></SurfaceCard>;
}

function ProgressTopic({title, detail, percent}: {title: string; detail: string; percent: number}) {
  return <View style={styles.topicProgress}><View style={styles.topicText}><Text style={styles.materialName}>{title}</Text><Text style={styles.materialMeta}>{detail}</Text></View><View style={styles.progressTrackSmall}><View style={[styles.progressFillSmall, {width: `${percent}%`}]} /></View></View>;
}

const styles = StyleSheet.create({
  topbar: {height: 58, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  topActions: {flexDirection: 'row', alignItems: 'center', gap: 10},
  topIconButton: {height: 38, width: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border},
  avatar: {width: 38, height: 38, borderRadius: 19, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center'},
  avatarText: {fontSize: 16, fontWeight: '800', color: colors.teal},
  mainContent: {paddingHorizontal: 20, paddingTop: 13, paddingBottom: 24},
  greeting: {fontSize: 27, color: colors.text, fontWeight: '800', letterSpacing: -0.6},
  subGreeting: {fontSize: 14, color: colors.muted, marginTop: 5, marginBottom: 20, lineHeight: 20},
  todayCard: {backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: 16, marginBottom: 15},
  todayHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 17},
  todayEyebrow: {fontSize: 11, letterSpacing: 0.8, fontWeight: '800', color: colors.primary},
  todayDate: {flexDirection: 'row', alignItems: 'center', gap: 5},
  todayDateText: {fontSize: 12, color: colors.muted, fontWeight: '600'},
  todayBody: {flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 17},
  subjectIcon: {width: 56, height: 56, borderRadius: 17, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center'},
  todayCopy: {flex: 1},
  todayTitle: {fontSize: 17, fontWeight: '700', color: colors.text},
  todayDetail: {fontSize: 13, color: colors.muted, marginTop: 4},
  weekCard: {marginBottom: 23},
  weekTitleRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  sectionTitle: {fontSize: 16, color: colors.text, fontWeight: '700'},
  weekCount: {fontSize: 13, color: colors.teal, fontWeight: '700'},
  progressTrack: {height: 8, backgroundColor: '#E5E9EE', borderRadius: 4, marginTop: 13, overflow: 'hidden'},
  progressFill: {width: '60%', height: 8, borderRadius: 4, backgroundColor: colors.teal},
  cardCaption: {fontSize: 12, lineHeight: 17, color: colors.muted, marginTop: 7},
  materialMini: {flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: 13, marginBottom: 16},
  pdfIcon: {width: 42, height: 42, borderRadius: 13, backgroundColor: '#EEEFFE', alignItems: 'center', justifyContent: 'center'},
  pdfIconAlt: {backgroundColor: colors.tealSoft},
  materialMiniCopy: {flex: 1},
  materialName: {fontSize: 14, fontWeight: '700', color: colors.text},
  materialMeta: {fontSize: 12, color: colors.muted, marginTop: 4},
  preferencesCard: {marginTop: 2},
  preferenceTitleRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  editButton: {width: 34, height: 34, borderRadius: 11, backgroundColor: '#EEEFFE', alignItems: 'center', justifyContent: 'center'},
  pillRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12},
  preferenceMeta: {fontSize: 12, color: colors.muted, marginTop: 10},
  signOut: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 22},
  signOutText: {fontSize: 12, color: colors.muted},
  pageTitle: {fontSize: 27, color: colors.text, fontWeight: '800', letterSpacing: -0.5, marginTop: 9},
  materialList: {gap: 11, marginTop: 18},
  voiceNotesCard: {marginTop: 15},
  voiceNotesHeading: {flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 13},
  voiceNoteRow: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border},
  voiceNoteIcon: {width: 34, height: 34, borderRadius: 11, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center'},
  planActionRow: {flexDirection: 'row', gap: 9, marginBottom: 14},
  planAction: {flex: 1, minHeight: 42, paddingHorizontal: 9, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6},
  planActionText: {fontSize: 11, color: colors.primary, fontWeight: '700'},
  materialCard: {flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 13, borderRadius: radius.md},
  materialActions: {flexDirection: 'row', alignItems: 'center', gap: 10},
  materialInfo: {flex: 1},
  progressLabel: {fontSize: 11, color: colors.muted, marginTop: 9, marginBottom: 5},
  progressTrackSmall: {height: 5, backgroundColor: '#E7EAF0', borderRadius: 3, overflow: 'hidden', marginTop: 7},
  progressFillSmall: {height: 5, borderRadius: 3, backgroundColor: colors.teal},
  infoBox: {flexDirection: 'row', alignItems: 'flex-start', gap: 9, backgroundColor: '#F0F1FF', padding: 13, borderRadius: radius.sm, marginTop: 17},
  infoBoxText: {flex: 1, fontSize: 12, lineHeight: 18, color: colors.muted},
  calendarCard: {paddingHorizontal: 7, paddingVertical: 15, marginBottom: 23},
  weekDays: {flexDirection: 'row', justifyContent: 'space-around'},
  dayCell: {alignItems: 'center', gap: 9},
  dayName: {fontSize: 11, color: colors.muted},
  dayNumber: {width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center'},
  daySelected: {backgroundColor: colors.primary},
  dayNumberText: {fontSize: 12, color: colors.text, fontWeight: '600'},
  dayNumberTextSelected: {color: colors.surface},
  sessionRow: {minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 11, marginBottom: 10},
  sessionRowNext: {backgroundColor: '#FFFCF5', borderColor: '#F5D38D'},
  sessionTime: {width: 43, fontSize: 11, color: colors.muted, fontWeight: '600'},
  sessionAccent: {width: 4, height: 42, borderRadius: 2},
  sessionCopy: {flex: 1},
  rescheduleButton: {width: 34, height: 34, borderRadius: 11, backgroundColor: '#F0F1FF', alignItems: 'center', justifyContent: 'center'},
  statGrid: {flexDirection: 'row', gap: 11, marginTop: 4, marginBottom: 15},
  statCard: {flex: 1, minHeight: 132},
  statIcon: {width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 10},
  statValue: {fontSize: 20, color: colors.text, fontWeight: '800'},
  statLabel: {fontSize: 11, color: colors.muted, marginTop: 4},
  progressSummary: {marginBottom: 15},
  topicProgress: {marginTop: 15},
  topicText: {flexDirection: 'row', justifyContent: 'space-between'},
  lessonTopbar: {height: 58, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  backCircle: {width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center'},
  lessonContent: {paddingHorizontal: 20, paddingTop: 15, paddingBottom: 28},
  lessonHeading: {flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 15},
  lessonIcon: {width: 54, height: 54, borderRadius: 17, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center'},
  lessonTitle: {fontSize: 22, color: colors.text, fontWeight: '800'},
  suggestedBanner: {flexDirection: 'row', alignItems: 'center', gap: 7, padding: 10, borderRadius: radius.sm, backgroundColor: '#F0F1FF', marginBottom: 16},
  suggestedText: {fontSize: 12, color: colors.primary, fontWeight: '700'},
  lessonModes: {flexDirection: 'row', gap: 7, marginBottom: 14},
  lessonMode: {flex: 1, height: 42, borderRadius: radius.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5},
  lessonModeActive: {borderColor: colors.primary, backgroundColor: '#F0F1FF'},
  lessonModeText: {fontSize: 11, color: colors.muted, fontWeight: '600'},
  lessonModeTextActive: {color: colors.primary},
  lessonSection: {marginBottom: 11},
  lessonSectionTitle: {fontSize: 16, color: colors.text, fontWeight: '700', marginBottom: 7},
  lessonBody: {fontSize: 14, lineHeight: 22, color: colors.muted},
  audioCard: {flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14},
  audioCircle: {width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center'},
  visualCard: {marginBottom: 14},
  visualSteps: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8},
  visualStep: {alignItems: 'center', gap: 6},
  visualStepIcon: {width: 42, height: 42, borderRadius: 14, backgroundColor: colors.amberSoft, alignItems: 'center', justifyContent: 'center'},
  visualPoint: {flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 8},
  visualPointIndex: {fontSize: 15, fontWeight: '800', color: colors.primary},
  visualPointText: {flex: 1, fontSize: 12, lineHeight: 18, color: colors.muted},
  visualStepText: {fontSize: 10, color: colors.muted, fontWeight: '600'},
  sourceCard: {flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 11, marginBottom: 14},
  sourceText: {fontSize: 12, color: colors.muted},
});
