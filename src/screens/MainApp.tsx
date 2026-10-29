import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import {RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, useAudioRecorderState} from 'expo-audio';
import {extractTextWithInfo, isAvailable as isPdfTextExtractionAvailable} from 'expo-pdf-text-extract';
import * as Speech from 'expo-speech';
import {getLocales} from 'expo-localization';
import {cancelStudyReminder, exportSessionsToDeviceCalendar, removeSessionFromDeviceCalendar, scheduleStudyReminder, scheduleStudyReminders, syncEnabledStudyTools, type DeviceStudySession} from '../services/device-study-tools';
import {deleteLocalPdf, importLocalPdf, loadLocalPdfs, openLocalPdf, saveLocalPdfAnalysis, type LocalPdf} from '../services/local-pdfs';
import {formatLocalDate, generateLocalStudyPlan, getConciseKeyIdeas, type LocalStudySession, type StudyTopic} from '../services/local-study-planner';
import {cancelLocalAIModelDownload, ensureLocalAIModelInstalled, generateLocalAIAnalysis, isLocalAIModelInstalled, removeLocalAIModel} from '../services/local-ai-device';
import {LOCAL_AI_MODEL, type ModelDownloadProgress} from '../services/local-ai-model-manager';
import {loadLocalStudyPlan, removeLocalMaterialSessions, replaceLocalMaterialSessions, saveLocalStudyPlan} from '../services/local-study-plan-store';
import {deleteLocalVoiceNote, loadLocalVoiceNotes, saveLocalVoiceNote, type LocalVoiceNote} from '../services/local-voice-notes';
import {AppPage, Brand, Pill, PrimaryButton, SectionHeading, SurfaceCard} from '../components/ui';
import {AdaptivePractice} from '../components/AdaptivePractice';
import {getLearningLanguageLabel} from '../services/learning-language';
import {colors, radius} from '../theme';
import type {LearningFormat, UserProfile} from '../types';

export type TabKey = 'home' | 'materials' | 'plan' | 'progress';
type Material = {id: string; name: string; topics: number; summary?: string; localFile: LocalPdf};
type StudySessionRecord = DeviceStudySession & LocalStudySession;
type LocalMaterialContent = {id: string; originalName: string; summary: string; keyPoints: string[]; topics: StudyTopic[]; plannerVersion?: number; targetLanguage?: string};
type AIModelStatus = 'checking' | 'missing' | 'downloading' | 'ready';

const formatLabels: Record<LearningFormat, string> = {
  read: 'Leer',
  listen: 'Escuchar',
  visual: 'Ver esquemas',
  practice: 'Practicar',
};
const lessonModesByFormat: Record<LearningFormat, 'read' | 'listen' | 'visual' | 'practice'> = {read: 'read', listen: 'listen', visual: 'visual', practice: 'practice'};

export function MainApp({
  account,
  activeTab,
  onEditPreferences,
  onSignOut,
  onOpenLesson,
  onOpenMaterials,
  onOpenPlan,
}: {
  account: UserProfile;
  activeTab: TabKey;
  onEditPreferences: () => void;
  onSignOut: () => void;
  onOpenLesson: (materialId?: string, topicIndex?: number, learningFormat?: LearningFormat) => void;
  onOpenMaterials: () => void;
  onOpenPlan: () => void;
}) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [sessions, setSessions] = useState<StudySessionRecord[]>([]);
  const [generatingPlanFor, setGeneratingPlanFor] = useState<string | null>(null);
  const [aiModelStatus, setAIModelStatus] = useState<AIModelStatus>('checking');
  const [modelDownloadProgress, setModelDownloadProgress] = useState<ModelDownloadProgress | null>(null);
  const [planProgress, setPlanProgress] = useState('');
  const firstName = account.name.trim().split(/\s+/)[0] || 'Estudiante';

  useEffect(() => {
    let active = true;
    Promise.all([loadLocalPdfs(account.id), loadLocalStudyPlan(account.id)])
      .then(([files, plan]) => {
        if (!active) return;
        setMaterials(files.map(toLocalMaterial));
        setSessions(plan);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [account.id]);

  useEffect(() => {
    let active = true;
    isLocalAIModelInstalled()
      .then(installed => { if (active) setAIModelStatus(installed ? 'ready' : 'missing'); })
      .catch(() => { if (active) setAIModelStatus('missing'); });
    return () => { active = false; };
  }, []);

  const generatePlanFromPdf = async (file: LocalPdf, downloadModelFirst = false) => {
    if (generatingPlanFor) return;
    if (!isPdfTextExtractionAvailable()) {
      Alert.alert('Actualiza Brújula', 'El análisis local del PDF requiere la versión instalada de Brújula; no funciona desde Expo Go.');
      return;
    }
    setGeneratingPlanFor(file.id);
    try {
      let modelInstalled = await isLocalAIModelInstalled();
      if (!modelInstalled && downloadModelFirst) {
        setAIModelStatus('downloading');
        setModelDownloadProgress({bytesWritten: 0, totalBytes: LOCAL_AI_MODEL.sizeBytes, percent: 0});
        await ensureLocalAIModelInstalled(setModelDownloadProgress);
        modelInstalled = true;
        setAIModelStatus('ready');
        setModelDownloadProgress(null);
      }
      if (!modelInstalled) throw new Error('El modelo de estudio no está instalado. Descárgalo desde Materiales e inténtalo de nuevo.');

      setPlanProgress('Leyendo tu PDF…');
      const extraction = await extractTextWithInfo(file.uri);
      if (!extraction.success) {
        const reason = extraction.passwordRequired
          ? 'Este PDF está protegido con contraseña. Desbloquéalo en tu dispositivo e impórtalo de nuevo.'
          : extraction.error || 'No se pudo extraer el texto del PDF.';
        throw new Error(reason);
      }
      setPlanProgress('Preparando el modelo de estudio…');
      const languageTag = getLocales()[0]?.languageTag ?? 'es-CO';
      const analysis = await generateLocalAIAnalysis(extraction.text, account.preferences, extraction.pageCount, languageTag, progress => {
        if (progress.stage === 'loading-model') setPlanProgress(`Preparando el modelo… ${progress.percent}%`);
        else if (progress.stage === 'generating') {
          const minutes = String(Math.floor(progress.elapsedSeconds / 60)).padStart(2, '0');
          const seconds = String(progress.elapsedSeconds % 60).padStart(2, '0');
          setPlanProgress(`Analizando bloque ${progress.completedChunks + 1} de ${progress.totalChunks} · ${minutes}:${seconds}`);
        }
        else if (progress.completedChunks === 0) setPlanProgress('Analizando el primer bloque. Puede tardar unos minutos…');
        else if (progress.completedChunks >= progress.totalChunks) setPlanProgress('Organizando temas y ejercicios…');
        else setPlanProgress(`Analizados ${progress.completedChunks} de ${progress.totalChunks} bloques…`);
      });
      const savedFile = await saveLocalPdfAnalysis(account.id, file.id, analysis);
      const generated = generateLocalStudyPlan(file.id, analysis.topics, account.preferences);
      const nextSessions = await replaceLocalMaterialSessions(account.id, file.id, generated);
      setMaterials(previous => [...previous.filter(material => material.id !== file.id), toLocalMaterial(savedFile)]);
      setSessions(nextSessions);
      await syncEnabledStudyTools(account.id, nextSessions).catch(() => undefined);
      const extractedWords = analysis.extractedWords?.toLocaleString('es-CO');
      const pages = analysis.pageCount ? ' de ' + analysis.pageCount + ' páginas' : '';
      const warning = analysis.warnings?.length ? '\n\n' + analysis.warnings.join('\n') : '';
      const details = extractedWords ? `Analizó ${extractedWords} palabras${pages} y generó ` : 'Generó ';
      Alert.alert('Tu plan está listo', `${details}${analysis.topics.length} temas en ${generated.length} sesiones según tus preferencias.${warning}\n\nEl PDF, los temas y el plan permanecen en este dispositivo.`, [
        {text: 'Ver mi plan', onPress: onOpenPlan},
        {text: 'Seguir aquí', style: 'cancel'},
      ]);
    } catch (error) {
      if (downloadModelFirst) {
        void isLocalAIModelInstalled()
          .then(installed => setAIModelStatus(installed ? 'ready' : 'missing'))
          .catch(() => setAIModelStatus('missing'));
      }
      setModelDownloadProgress(null);
      Alert.alert('No se pudo crear el plan', error instanceof Error ? error.message : 'Comprueba que el PDF contenga texto seleccionable.');
    } finally {
      setGeneratingPlanFor(null);
      setPlanProgress('');
    }
  };

  const requestPlanForPdf = (file: LocalPdf) => {
    if (generatingPlanFor || aiModelStatus === 'downloading') return;
    void isLocalAIModelInstalled().then(installed => {
      setAIModelStatus(installed ? 'ready' : 'missing');
      if (installed) {
        void generatePlanFromPdf(file);
        return;
      }
      Alert.alert(
        'Descargar modelo de estudio',
        `La primera descarga ocupa aproximadamente ${formatModelSize(LOCAL_AI_MODEL.sizeBytes)} y requiere cerca de 1,4 GB libres. El modelo se queda en el teléfono; el PDF no se envía a ningún servidor.`,
        [
          {text: 'Ahora no', style: 'cancel'},
          {text: 'Descargar y continuar', onPress: () => { void generatePlanFromPdf(file, true); }},
        ],
      );
    }).catch(error => Alert.alert('No se pudo comprobar el modelo', error instanceof Error ? error.message : 'Inténtalo de nuevo.'));
  };

  const requestModelDownload = () => {
    if (aiModelStatus === 'downloading' || aiModelStatus === 'ready') return;
    Alert.alert(
      'Descargar modelo de estudio',
      `Descargará ${LOCAL_AI_MODEL.name} (aprox. ${formatModelSize(LOCAL_AI_MODEL.sizeBytes)}) al almacenamiento privado del teléfono. Necesitas cerca de 1,4 GB libres. Tus PDFs nunca se cargan.`,
      [
        {text: 'Cancelar', style: 'cancel'},
        {text: 'Descargar modelo', onPress: () => {
          setAIModelStatus('downloading');
          setModelDownloadProgress({bytesWritten: 0, totalBytes: LOCAL_AI_MODEL.sizeBytes, percent: 0});
          void ensureLocalAIModelInstalled(setModelDownloadProgress)
            .then(() => { setAIModelStatus('ready'); setModelDownloadProgress(null); })
            .catch(error => {
              setAIModelStatus('missing');
              setModelDownloadProgress(null);
              Alert.alert('No se pudo descargar el modelo', error instanceof Error ? error.message : 'Comprueba tu conexión e inténtalo otra vez.');
            });
        }},
      ],
    );
  };

  const requestModelRemoval = () => Alert.alert(
    'Eliminar modelo local',
    `Se liberarán aproximadamente ${formatModelSize(LOCAL_AI_MODEL.sizeBytes)}. Los PDFs, los temas y tu plan no se borrarán.`,
    [
      {text: 'Conservar', style: 'cancel'},
      {text: 'Eliminar modelo', style: 'destructive', onPress: () => {
        if (generatingPlanFor) return;
        try {
          removeLocalAIModel();
          setAIModelStatus('missing');
        } catch (error) {
          Alert.alert('No se pudo eliminar', error instanceof Error ? error.message : 'Inténtalo otra vez.');
        }
      }},
    ],
  );

  const stopModelDownload = () => cancelLocalAIModelDownload();

  return (
    <AppPage edges={['top', 'right', 'left']}>
      <View style={styles.topbar}>
        <Brand compact />
        <View style={styles.topActions}>
          <Pressable style={styles.topIconButton} onPress={onOpenPlan} accessibilityLabel="Abrir plan y recordatorios">
            <Ionicons name="notifications-outline" size={20} color={colors.text} />
          </Pressable>
          <Pressable style={styles.avatar} onPress={onEditPreferences} accessibilityLabel="Editar preferencias de estudio">
            <Text style={styles.avatarText}>{firstName.slice(0, 1).toUpperCase()}</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.mainContent} showsVerticalScrollIndicator={false}>
        {activeTab === 'home' ? <HomeTab firstName={firstName} account={account} materials={materials} sessions={sessions} onContinue={onOpenLesson} onOpenMaterials={onOpenMaterials} onOpenPlan={onOpenPlan} onEditPreferences={onEditPreferences} /> : null}
        {activeTab === 'materials' ? <MaterialsTab ownerId={account.id} preferences={account.preferences} materials={materials} sessions={sessions} setMaterials={setMaterials} setSessions={setSessions} generatingPlanFor={generatingPlanFor} planProgress={planProgress} aiModelStatus={aiModelStatus} modelDownloadProgress={modelDownloadProgress} onDownloadModel={requestModelDownload} onCancelModelDownload={stopModelDownload} onRemoveModel={requestModelRemoval} onGeneratePlan={requestPlanForPdf} onOpenLesson={onOpenLesson} /> : null}
        {activeTab === 'plan' ? <PlanTab ownerId={account.id} sessions={sessions} setSessions={setSessions} onOpenLesson={onOpenLesson} /> : null}
        {activeTab === 'progress' ? <ProgressTab account={account} materials={materials} sessions={sessions} onEditPreferences={onEditPreferences} /> : null}
        <Pressable style={styles.signOut} onPress={() => Alert.alert('Cerrar sesión', '¿Quieres volver a la pantalla de acceso?', [{text: 'Cancelar', style: 'cancel'}, {text: 'Cerrar sesión', style: 'destructive', onPress: onSignOut}])}>
          <Ionicons name="log-out-outline" size={16} color={colors.muted} /><Text style={styles.signOutText}>Cerrar sesión</Text>
        </Pressable>
      </ScrollView>

    </AppPage>
  );
}

function HomeTab({firstName, account, materials, sessions, onContinue, onOpenMaterials, onOpenPlan, onEditPreferences}: {firstName: string; account: UserProfile; materials: Material[]; sessions: StudySessionRecord[]; onContinue: (materialId?: string, topicIndex?: number, learningFormat?: LearningFormat) => void; onOpenMaterials: () => void; onOpenPlan: () => void; onEditPreferences: () => void}) {
  const nextSession = sessions.find(session => session.status === 'planned' && session.materialId);
  const nextReminder = sessions.find(session => session.status === 'planned' && !session.materialId);
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
          <View style={styles.todayCopy}><Text style={styles.todayTitle}>{nextSession?.title ?? nextReminder?.title ?? nextMaterial?.name ?? 'Todavía no hay un plan'}</Text><Text style={styles.todayDetail}>{nextSession ? `${nextSession.date} · ${formatLabels[nextSession.learningFormat]}` : nextReminder ? `${nextReminder.date} · recordatorio personal` : nextMaterial?.topics ? `${nextMaterial.topics} temas organizados · plan listo.` : nextMaterial ? 'PDF guardado en este dispositivo.' : 'Importa un PDF para tenerlo a mano.'}</Text></View>
        </View>
        <PrimaryButton title={nextSession ? 'Continuar estudiando' : nextReminder ? 'Ver calendario' : 'Importar material'} icon={nextSession ? 'play' : nextReminder ? 'calendar-outline' : 'add'} onPress={nextSession ? () => onContinue(nextSession.materialId, nextSession.topicIndex, nextSession.learningFormat) : nextReminder ? onOpenPlan : onOpenMaterials} />
      </View>

      <SurfaceCard style={styles.weekCard}>
        <View style={styles.weekTitleRow}><Text style={styles.sectionTitle}>Tu progreso esta semana</Text><Text style={styles.weekCount}>{completedThisWeek.length} de 5</Text></View>
        <View style={styles.progressTrack}><View style={[styles.progressFill, {width: `${Math.min(completedThisWeek.length / 5, 1) * 100}%`}]} /></View>
        <Text style={styles.cardCaption}>{completedThisWeek.length ? 'Vas avanzando a tu ritmo.' : 'Completa una sesión para comenzar tu progreso.'}</Text>
      </SurfaceCard>

      <SectionHeading title="Material reciente" action="Ver todo" onAction={onOpenMaterials} />
      <Pressable style={styles.materialMini} onPress={onOpenMaterials}>
        <View style={styles.pdfIcon}><Ionicons name={materials[0] ? 'document-text' : 'add'} size={20} color={colors.primary} /></View>
        <View style={styles.materialMiniCopy}><Text style={styles.materialName}>{materials[0]?.name ?? 'Agrega tu primer material'}</Text><Text style={styles.materialMeta}>{materials[0]?.topics ? `${materials[0].topics} temas · plan de estudio` : materials[0] ? 'PDF guardado en este dispositivo' : 'Importa un PDF para guardarlo aquí'}</Text></View>
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

function MaterialsTab({ownerId, preferences, materials, sessions, setMaterials, setSessions, generatingPlanFor, planProgress, aiModelStatus, modelDownloadProgress, onDownloadModel, onCancelModelDownload, onRemoveModel, onGeneratePlan, onOpenLesson}: {ownerId: string; preferences: UserProfile['preferences']; materials: Material[]; sessions: StudySessionRecord[]; setMaterials: React.Dispatch<React.SetStateAction<Material[]>>; setSessions: React.Dispatch<React.SetStateAction<StudySessionRecord[]>>; generatingPlanFor: string | null; planProgress: string; aiModelStatus: AIModelStatus; modelDownloadProgress: ModelDownloadProgress | null; onDownloadModel: () => void; onCancelModelDownload: () => void; onRemoveModel: () => void; onGeneratePlan: (file: LocalPdf) => void; onOpenLesson: (materialId?: string, topicIndex?: number, learningFormat?: LearningFormat) => void}) {
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
    Alert.alert('Eliminar PDF', `¿Quieres borrar “${material.name}”, sus temas y sus sesiones de este dispositivo?`, [
        {text: 'Cancelar', style: 'cancel'},
        {text: 'Eliminar', style: 'destructive', onPress: () => {
          void (async () => {
            const nextSessions = await removeLocalMaterialSessions(ownerId, material.id);
            const removedSessions = sessions.filter(session => session.materialId === material.id);
            await Promise.all(removedSessions.flatMap(session => [
              cancelStudyReminder(ownerId, session.id),
              removeSessionFromDeviceCalendar(ownerId, session.id),
            ]));
            await deleteLocalPdf(ownerId, material.id);
            setSessions(nextSessions);
            setMaterials(previous => previous.filter(item => item.id !== material.id));
          })()
            .catch(error => Alert.alert('No se pudo eliminar el PDF', error instanceof Error ? error.message : 'Inténtalo de nuevo.'));
        }},
      ]);
  };

  return (
    <>
      <Text style={styles.pageTitle}>Materiales</Text>
      <Text style={styles.subGreeting}>Importa un PDF de tu dispositivo. El contenido y el plan se procesan y guardan solo aquí.</Text>
      <PrimaryButton title={uploading ? 'Guardando PDF…' : 'Importar PDF'} icon={uploading ? 'hourglass-outline' : 'add'} onPress={() => { void importPdf(); }} disabled={uploading} />
      <SurfaceCard style={styles.aiModelCard}>
        <View style={styles.aiModelHeading}>
          <View style={styles.aiModelIcon}><Ionicons name="sparkles-outline" size={19} color={colors.primary} /></View>
          <View style={styles.aiModelCopy}>
            <Text style={styles.sectionTitle}>Estudio inteligente en tu teléfono</Text>
            <Text style={styles.cardCaption}>Modelo de estudio · {LOCAL_AI_MODEL.name}</Text>
          </View>
          <Ionicons name={aiModelStatus === 'ready' ? 'checkmark-circle' : 'phone-portrait-outline'} size={20} color={aiModelStatus === 'ready' ? colors.teal : colors.muted} />
        </View>
        <Text style={styles.aiModelDescription}>
          {aiModelStatus === 'ready'
            ? 'Lista para organizar PDFs sin conexión. El documento, las citas y el plan se quedan en este dispositivo.'
            : aiModelStatus === 'downloading'
              ? 'Descargando el modelo al almacenamiento privado. Tus PDFs no participan en esta descarga.'
              : aiModelStatus === 'checking'
                ? 'Comprobando si el modelo de estudio ya está instalado…'
                : `Descárgalo una sola vez (${formatModelSize(LOCAL_AI_MODEL.sizeBytes)}). Luego podrás organizar tus PDFs aquí mismo.`}
        </Text>
        {aiModelStatus === 'downloading' ? <>
          <View style={styles.progressTrack} accessibilityRole="progressbar" accessibilityValue={{min: 0, max: 100, now: modelDownloadProgress?.percent ?? 0}}>
            <View style={[styles.progressFill, {width: `${modelDownloadProgress?.percent ?? 0}%`}]} />
          </View>
          <View style={styles.aiModelActionRow}>
            <Text style={styles.aiModelMeta}>{modelDownloadProgress ? `${modelDownloadProgress.percent}% · ${formatModelSize(modelDownloadProgress.bytesWritten)} de ${formatModelSize(LOCAL_AI_MODEL.sizeBytes)}` : 'Preparando descarga…'}</Text>
            <Pressable onPress={onCancelModelDownload} accessibilityRole="button" accessibilityLabel="Cancelar descarga del modelo"><Text style={styles.aiModelActionText}>Cancelar</Text></Pressable>
          </View>
        </> : aiModelStatus === 'ready' ? <Pressable onPress={onRemoveModel} disabled={!!generatingPlanFor} style={[styles.aiModelActionRow, !!generatingPlanFor && styles.disabledControl]} accessibilityRole="button">
          <Text style={styles.aiModelMeta}>Modelo descargado · no requiere internet</Text>
          <Text style={styles.aiModelActionText}>Eliminar</Text>
        </Pressable> : aiModelStatus === 'missing' ? <Pressable onPress={onDownloadModel} style={styles.aiModelDownloadButton} accessibilityRole="button">
          <Ionicons name="download-outline" size={18} color={colors.primary} />
          <Text style={styles.aiModelDownloadText}>Descargar modelo · {formatModelSize(LOCAL_AI_MODEL.sizeBytes)}</Text>
        </Pressable> : null}
      </SurfaceCard>
      <View style={styles.materialList}>
        {materials.map((material, index) => (
          <View key={material.id} style={styles.materialCard}>
            <View style={styles.materialCardMain}>
              <Pressable style={styles.materialOpen} onPress={() => {
                void openLocalPdf(material.localFile).catch(error => Alert.alert('No se pudo abrir el PDF', error instanceof Error ? error.message : 'Inténtalo de nuevo.'));
              }} accessibilityRole="button" accessibilityLabel={`Abrir ${material.name}`}>
                <View style={[styles.pdfIcon, index % 2 === 1 && styles.pdfIconAlt]}><Ionicons name="document-text" size={21} color={index % 2 === 1 ? colors.teal : colors.primary} /></View>
                <View style={styles.materialInfo}><Text numberOfLines={1} style={styles.materialName}>{material.name}</Text><Text style={styles.materialMeta}>En este dispositivo · {formatFileSize(material.localFile.size)}</Text></View>
              </Pressable>
              <Pressable style={styles.deleteMaterialButton} onPress={() => removeMaterial(material)} hitSlop={10} accessibilityLabel={`Eliminar ${material.name}`}><Ionicons name="trash-outline" size={18} color={colors.muted} /></Pressable>
            </View>
            <Pressable
              style={styles.createPlanButton}
              disabled={generatingPlanFor === material.localFile.id}
              onPress={() => onGeneratePlan(material.localFile)}
              accessibilityRole="button"
              accessibilityLabel={`${generatingPlanFor === material.localFile.id ? planProgress || 'Analizando documento' : material.topics ? 'Mejorar plan de estudio' : 'Crear plan de estudio'} · ${material.name}`}
            >{generatingPlanFor === material.localFile.id ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="sparkles-outline" size={15} color={colors.primary} />}<Text style={styles.createPlanButtonText}>{generatingPlanFor === material.localFile.id ? planProgress || 'Analizando documento…' : material.topics ? `${material.topics} temas · Mejorar plan` : 'Crear plan de estudio'}</Text></Pressable>
            {material.localFile.analysis ? <View style={styles.analysisPreview}>
              <Text style={styles.analysisProviderLabel}>
                {material.localFile.analysis.analysisProvider === 'local-llm'
                  ? `Organizado en este teléfono · ${material.localFile.analysis.modelName ?? 'modelo de estudio'}`
                  : 'Organización básica · mejora el plan para añadir ejercicios y resúmenes breves'}
              </Text>
              <Text style={styles.analysisSummary} numberOfLines={3}>{material.localFile.analysis.summary}</Text>
              {material.localFile.analysis.plannerVersion !== 2 || !material.localFile.analysis.targetLanguage ? <View style={styles.infoBox}><Ionicons name="sparkles-outline" size={17} color={colors.primary} /><Text style={styles.infoBoxText}>Este plan todavía no tiene ideas breves ni práctica adaptativa. Pulsa “Mejorar plan” para actualizarlo.</Text></View> : <Text style={styles.languageNote}>Adaptado en {getLearningLanguageLabel(material.localFile.analysis.targetLanguage)} · las citas conservan el idioma del PDF.</Text>}
              <Text style={styles.analysisTopicsTitle}>
                Temas organizados
                {material.localFile.analysis.extractedWords ? ' · ' + material.localFile.analysis.extractedWords.toLocaleString('es-CO') + ' palabras' : ''}
                {material.localFile.analysis.pageCount ? ' · ' + material.localFile.analysis.pageCount + ' páginas' : ''}
                {' · toca uno para estudiar'}
              </Text>
              {material.localFile.analysis.warnings?.map((warning, warningIndex) => <Text key={'analysis-warning-' + warningIndex} style={styles.analysisWarning}>{warning}</Text>)}
              {material.localFile.analysis.topics.map((topic, topicIndex) => <Pressable key={`${material.id}-${topicIndex}`} style={styles.analysisTopic} onPress={() => onOpenLesson(material.id, topicIndex, preferences.formats[topicIndex % preferences.formats.length] ?? 'practice')}>
                <Text style={styles.analysisTopicText} numberOfLines={1}>{topic.title}</Text><Ionicons name="chevron-forward" size={16} color={colors.primary} />
              </Pressable>)}
            </View> : null}
          </View>
        ))}
      </View>
      <View style={styles.infoBox}><Ionicons name="phone-portrait-outline" size={18} color={colors.primary} /><Text style={styles.infoBoxText}>Tus PDFs, temas y sesiones nunca se envían a una nube. Brújula los lee y los organiza dentro de este dispositivo.</Text></View>
      <VoiceNotesPanel ownerId={ownerId} />
    </>
  );
}

function toLocalMaterial(file: LocalPdf): Material {
  return {id: file.id, name: file.name, topics: file.analysis?.topics.length ?? 0, summary: file.analysis?.summary, localFile: file};
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatModelSize(size: number) {
  return `${(size / 1_000_000_000).toFixed(2)} GB`;
}

function VoiceNotesPanel({ownerId}: {ownerId: string}) {
  const recorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const player = useAudioPlayer(null);
  const playerStatus = useAudioPlayerStatus(player);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState<LocalVoiceNote[]>([]);
  const [playingNoteId, setPlayingNoteId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadLocalVoiceNotes(ownerId)
      .then(records => { if (active) setNotes(records); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [ownerId]);

  const recordOrSaveLocally = async () => {
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

    const durationMillis = recorderState.durationMillis;
    setSaving(true);
    try {
      await recorder.stop();
      await setAudioModeAsync({allowsRecording: false, playsInSilentMode: true});
      if (!recorder.uri) throw new Error('No encontramos el archivo de audio grabado.');
      const note = await saveLocalVoiceNote(ownerId, recorder.uri, durationMillis);
      setNotes(previous => [note, ...previous]);
      Alert.alert('Audio guardado', 'El audio queda en este dispositivo. La transcripción local no está disponible todavía.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Inténtalo otra vez.';
      Alert.alert('No se pudo guardar el apunte', message);
    } finally {
      setSaving(false);
    }
  };

  const removeNote = (note: LocalVoiceNote) => {
    Alert.alert('Eliminar audio', `¿Quieres eliminar “${note.title}” de este dispositivo?`, [
      {text: 'Cancelar', style: 'cancel'},
      {text: 'Eliminar', style: 'destructive', onPress: () => {
        void deleteLocalVoiceNote(ownerId, note.id)
          .then(() => setNotes(previous => previous.filter(item => item.id !== note.id)))
          .catch(error => Alert.alert('No se pudo eliminar', error instanceof Error ? error.message : 'Inténtalo de nuevo.'));
      }},
    ]);
  };

  const playNote = (note: LocalVoiceNote) => {
    if (playingNoteId === note.id && playerStatus.playing) {
      player.pause();
      return;
    }
    player.replace(note.uri);
    player.play();
    setPlayingNoteId(note.id);
  };

  return (
    <SurfaceCard style={styles.voiceNotesCard}>
      <View style={styles.voiceNotesHeading}><View style={{flex: 1}}><Text style={styles.sectionTitle}>Apuntes de voz</Text><Text style={styles.cardCaption}>Graba y reproduce audios guardados solo en este dispositivo.</Text></View><Ionicons name="mic-outline" size={22} color={colors.primary} /></View>
      <PrimaryButton
        title={saving ? 'Guardando en este dispositivo…' : recorderState.isRecording ? `Detener y guardar · ${Math.round(recorderState.durationMillis / 1000)} s` : 'Grabar apunte'}
        icon={saving ? 'hourglass-outline' : recorderState.isRecording ? 'stop' : 'mic'}
        onPress={() => { void recordOrSaveLocally(); }}
        disabled={saving}
      />
      {notes.slice(0, 4).map(note => (
        <Pressable key={note.id} style={styles.voiceNoteRow} onPress={() => playNote(note)}>
          <View style={styles.voiceNoteIcon}><Ionicons name={playingNoteId === note.id && playerStatus.playing ? 'pause' : 'play'} size={17} color={colors.teal} /></View>
          <View style={{flex: 1}}><Text style={styles.materialName}>{note.title}</Text><Text style={styles.materialMeta} numberOfLines={2}>Audio local · {Math.round(note.durationMillis / 1000)} s</Text></View>
          <Pressable onPress={event => { event.stopPropagation(); removeNote(note); }} hitSlop={10} accessibilityLabel={`Eliminar ${note.title}`}><Ionicons name="trash-outline" size={17} color={colors.muted} /></Pressable>
        </Pressable>
      ))}
      {!notes.length ? <Text style={styles.cardCaption}>Tus grabaciones aparecerán aquí.</Text> : null}
    </SurfaceCard>
  );
}

function PlanTab({ownerId, sessions, setSessions, onOpenLesson}: {ownerId: string; sessions: StudySessionRecord[]; setSessions: React.Dispatch<React.SetStateAction<StudySessionRecord[]>>; onOpenLesson: (materialId?: string, topicIndex?: number, learningFormat?: LearningFormat) => void}) {
  const [busy, setBusy] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState(() => formatLocalDate(new Date()));
  const [hasChosenDate, setHasChosenDate] = useState(false);
  const [editor, setEditor] = useState<StudySessionRecord | null | undefined>(undefined);
  const [draft, setDraft] = useState({title: '', startMinute: 18 * 60, durationMinutes: 25, reminderEnabled: true, reminderMinutesBefore: 10});
  const [calendarStatus, setCalendarStatus] = useState<string | null>(null);
  const [reminderStatus, setReminderStatus] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const todayDate = formatLocalDate(new Date());
  const nextPlannedDate = sessions
    .filter(session => session.status === 'planned' && session.date >= todayDate)
    .map(session => session.date)
    .sort()[0];
  const displayedDate = hasChosenDate ? selectedDate : sessions.some(session => session.date === todayDate) ? todayDate : nextPlannedDate ?? todayDate;
  const displayedWeekOffset = hasChosenDate ? weekOffset : getWeekOffsetForDate(displayedDate);
  const weekDays = getWeekDays(displayedWeekOffset);
  const selectedDaySessions = sessions
    .filter(session => session.date === displayedDate)
    .sort((left, right) => left.startMinute - right.startMinute || left.title.localeCompare(right.title));

  const moveWeek = (amount: number) => {
    const nextOffset = displayedWeekOffset + amount;
    const currentDayIndex = (new Date(`${displayedDate}T00:00:00`).getDay() + 6) % 7;
    setWeekOffset(nextOffset);
    setSelectedDate(formatLocalDate(getWeekDays(nextOffset)[currentDayIndex].date));
    setHasChosenDate(true);
  };

  const openEditor = (session?: StudySessionRecord) => {
    setEditor(session ?? null);
    setDraft(session ? {
      title: session.title,
      startMinute: session.startMinute,
      durationMinutes: session.durationMinutes,
      reminderEnabled: session.reminderEnabled !== false,
      reminderMinutesBefore: session.reminderMinutesBefore ?? 10,
    } : {title: '', startMinute: 18 * 60, durationMinutes: 25, reminderEnabled: true, reminderMinutesBefore: 10});
    setReminderStatus(null);
    setCalendarStatus(null);
    setFormError(null);
  };

  const persistSessions = async (nextSessions: StudySessionRecord[]) => {
    const ordered = [...nextSessions].sort((left, right) => left.date.localeCompare(right.date) || left.startMinute - right.startMinute || left.title.localeCompare(right.title));
    await saveLocalStudyPlan(ownerId, ordered);
    setSessions(ordered);
    return syncEnabledStudyTools(ownerId, ordered);
  };

  const saveSession = async () => {
    const title = draft.title.trim();
    if (!title) return;
    const [year, month, day] = displayedDate.split('-').map(Number);
    const startDate = new Date(year, month - 1, day, Math.floor(draft.startMinute / 60), draft.startMinute % 60);
    const reminderDate = startDate.getTime() - draft.reminderMinutesBefore * 60_000;
    if (startDate.getTime() <= Date.now() || (draft.reminderEnabled && reminderDate <= Date.now())) {
      setFormError(draft.reminderEnabled ? 'Elige una hora que deje tiempo para recibir el aviso.' : 'Elige una hora futura para el evento.');
      return;
    }
    setFormError(null);

    const previous = editor ?? {
      id: `reminder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      materialId: '',
      topicIndex: -1,
      title,
      date: displayedDate,
      startMinute: draft.startMinute,
      durationMinutes: draft.durationMinutes,
      learningFormat: 'practice' as const,
      status: 'planned' as const,
      source: 'reminder' as const,
    };
    const saved: StudySessionRecord = {
      ...previous,
      title,
      date: displayedDate,
      startMinute: draft.startMinute,
      durationMinutes: draft.durationMinutes,
      reminderEnabled: draft.reminderEnabled,
      reminderMinutesBefore: draft.reminderMinutesBefore,
    };
    const next = editor
      ? sessions.map(session => session.id === editor.id ? saved : session)
      : [...sessions, saved];

    setBusy(true);
    try {
      await saveLocalStudyPlan(ownerId, next);
      const ordered = [...next].sort((left, right) => left.date.localeCompare(right.date) || left.startMinute - right.startMinute || left.title.localeCompare(right.title));
      setSessions(ordered);
      setEditor(undefined);
      const failures: string[] = [];
      try { await syncEnabledStudyTools(ownerId, ordered); }
      catch (error) { failures.push(error instanceof Error ? error.message : 'No se pudo actualizar el calendario del dispositivo.'); }
      try {
        if (draft.reminderEnabled) await scheduleStudyReminder(ownerId, saved);
        else await cancelStudyReminder(ownerId, saved.id);
      } catch (error) { failures.push(error instanceof Error ? error.message : 'No se pudo programar la notificación local.'); }
      if (failures.length) setReminderStatus(`El evento quedó en tu agenda local. ${failures.join(' ')}`);
      else setReminderStatus(draft.reminderEnabled ? `Aviso local programado para ${formatTime(draft.startMinute - draft.reminderMinutesBefore)}.` : 'Evento guardado en tu agenda local.');
    } catch (error) {
      Alert.alert('No se pudo guardar el evento', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  const deleteSession = (session: StudySessionRecord) => {
    Alert.alert('Eliminar de la agenda', `¿Quieres eliminar “${session.title}” y su aviso de este dispositivo?`, [
      {text: 'Cancelar', style: 'cancel'},
      {text: 'Eliminar', style: 'destructive', onPress: () => {
        void (async () => {
          const next = sessions.filter(item => item.id !== session.id);
          await saveLocalStudyPlan(ownerId, next);
          setSessions(next);
          await Promise.all([cancelStudyReminder(ownerId, session.id), removeSessionFromDeviceCalendar(ownerId, session.id)]);
          await syncEnabledStudyTools(ownerId, next);
        })().catch(error => Alert.alert('No se pudo eliminar el evento', error instanceof Error ? error.message : 'Inténtalo de nuevo.'));
      }},
    ]);
  };

  const markComplete = async (session: StudySessionRecord) => {
    try {
      const next = sessions.map(item => item.id === session.id ? {...item, status: 'completed' as const} : item);
      await persistSessions(next);
      await cancelStudyReminder(ownerId, session.id);
    } catch (error) {
      Alert.alert('No se pudo actualizar la sesión', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    }
  };

  const prepareReminders = async () => {
    setBusy(true);
    try {
      const count = await scheduleStudyReminders(ownerId, sessions);
      setReminderStatus(count ? `${count} avisos quedaron programados en este dispositivo.` : 'No hay sesiones futuras con avisos activados.');
    } catch (error) { setReminderStatus(error instanceof Error ? error.message : 'No se pudieron activar las notificaciones.'); }
    finally { setBusy(false); }
  };

  const exportCalendar = async () => {
    setBusy(true);
    try {
      const {created, updated} = await exportSessionsToDeviceCalendar(ownerId, sessions);
      setCalendarStatus(created || updated ? `${created} eventos añadidos y ${updated} actualizados en el calendario del dispositivo.` : 'No hay sesiones futuras pendientes para sincronizar.');
    } catch (error) { setCalendarStatus(error instanceof Error ? error.message : 'No se pudo acceder al calendario del dispositivo.'); }
    finally { setBusy(false); }
  };

  const weekLabel = `${weekDays[0].date.toLocaleDateString('es', {day: 'numeric', month: 'short'})} – ${weekDays[6].date.toLocaleDateString('es', {day: 'numeric', month: 'short', year: 'numeric'})}`;
  const selectedLabel = new Date(`${displayedDate}T00:00:00`).toLocaleDateString('es', {weekday: 'long', day: 'numeric', month: 'long'});
  const isValidTitle = draft.title.trim().length > 0 && draft.title.trim().length <= 100;
  return (
    <>
      <Text style={styles.pageTitle}>Tu calendario</Text>
      <Text style={styles.subGreeting}>Crea y mueve tus sesiones. Todo se guarda en este dispositivo.</Text>
      <View style={styles.planActionRow}>
        <Pressable style={styles.planAction} onPress={() => openEditor()}><Ionicons name="add-circle-outline" size={18} color={colors.primary} /><Text style={styles.planActionText}>Nuevo evento</Text></Pressable>
        <Pressable style={styles.planAction} onPress={() => { void prepareReminders(); }} disabled={busy}><Ionicons name="notifications-outline" size={17} color={colors.primary} /><Text style={styles.planActionText}>{busy ? 'Programando…' : 'Activar avisos'}</Text></Pressable>
        <Pressable style={styles.planAction} onPress={() => { void exportCalendar(); }} disabled={busy}><Ionicons name="calendar-outline" size={17} color={colors.primary} /><Text style={styles.planActionText}>Sincronizar</Text></Pressable>
      </View>
      {reminderStatus ? <View style={styles.statusBanner}><Ionicons name="notifications-outline" size={16} color={colors.teal} /><Text style={styles.statusText}>{reminderStatus}</Text></View> : null}
      {calendarStatus ? <View style={styles.statusBanner}><Ionicons name="calendar-outline" size={16} color={colors.teal} /><Text style={styles.statusText}>{calendarStatus}</Text></View> : null}
      <SurfaceCard style={styles.calendarCard}>
        <View style={styles.weekNavigation}>
          <Pressable onPress={() => moveWeek(-1)} hitSlop={10} accessibilityLabel="Semana anterior"><Ionicons name="chevron-back" size={20} color={colors.primary} /></Pressable>
          <Text style={styles.weekRange}>{weekLabel}</Text>
          <Pressable onPress={() => moveWeek(1)} hitSlop={10} accessibilityLabel="Semana siguiente"><Ionicons name="chevron-forward" size={20} color={colors.primary} /></Pressable>
        </View>
        <View style={styles.weekDays}>
          {weekDays.map(day => {
            const date = formatLocalDate(day.date);
            const dayEvents = sessions.filter(session => session.date === date).length;
            const selected = date === displayedDate;
            return <Pressable key={date} style={styles.dayCell} onPress={() => { setSelectedDate(date); setHasChosenDate(true); }} accessibilityRole="button" accessibilityState={{selected}}>
              <Text style={styles.dayName}>{day.label}</Text><View style={[styles.dayNumber, selected && styles.daySelected, !selected && day.isToday && styles.dayToday]}><Text style={[styles.dayNumberText, selected && styles.dayNumberTextSelected]}>{day.date.getDate()}</Text></View>
              <View style={[styles.dayEventDot, dayEvents > 0 && styles.dayEventDotActive]} />
            </Pressable>;
          })}
        </View>
      </SurfaceCard>
      <View style={styles.selectedDayHeader}><View style={{flex: 1}}><Text style={styles.selectedDayTitle}>{selectedLabel}</Text><Text style={styles.cardCaption}>{selectedDaySessions.length} {selectedDaySessions.length === 1 ? 'evento' : 'eventos'} en tu agenda local</Text></View><Pressable style={styles.addDayButton} onPress={() => openEditor()} accessibilityLabel="Crear evento para este día"><Ionicons name="add" size={20} color={colors.surface} /></Pressable></View>
      {selectedDaySessions.map((session, index) => {
        const time = formatTime(session.startMinute);
        const dateLabel = session.source === 'reminder' || !session.materialId ? 'Recordatorio personal' : `${session.durationMinutes} min · ${formatLabels[session.learningFormat]}`;
        const status = session.status === 'completed' ? 'done' : index === 0 ? 'next' : 'planned';
        return <SessionRow key={session.id} time={time} title={session.title} detail={dateLabel} status={status} onPress={session.materialId ? () => onOpenLesson(session.materialId, session.topicIndex, session.learningFormat) : undefined} onEdit={() => openEditor(session)} onDelete={() => deleteSession(session)} onComplete={session.status === 'planned' ? () => { void markComplete(session); } : undefined} />;
      })}
      {!selectedDaySessions.length ? <View style={styles.infoBox}><Ionicons name={sessions.length ? 'sunny-outline' : 'sparkles-outline'} size={18} color={colors.primary} /><Text style={styles.infoBoxText}>{sessions.length ? 'No tienes nada programado este día. Toca + para agregar una sesión o un recordatorio.' : 'Crea un recordatorio aquí, o importa un PDF y toca “Crear plan de estudio” para organizar sus temas con tus preferencias.'}</Text></View> : null}
      <View style={styles.localCalendarNote}><Ionicons name="phone-portrait-outline" size={16} color={colors.teal} /><Text style={styles.localCalendarText}>La agenda y los avisos quedan en el teléfono. “Sincronizar” copia las sesiones al calendario del dispositivo; puedes editar o eliminar las de Brújula desde aquí.</Text></View>

      <Modal visible={editor !== undefined} transparent animationType="slide" onRequestClose={() => setEditor(undefined)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeading}><View style={{flex: 1}}><Text style={styles.modalTitle}>{editor ? 'Editar evento' : 'Nuevo evento'}</Text><Text style={styles.modalSubtitle}>{selectedLabel}</Text></View><Pressable onPress={() => setEditor(undefined)} hitSlop={10} accessibilityLabel="Cerrar formulario"><Ionicons name="close" size={22} color={colors.muted} /></Pressable></View>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalContent}>
              <Text style={styles.formLabel}>¿Qué vas a estudiar?</Text>
              <TextInput value={draft.title} onChangeText={title => { setFormError(null); setDraft(current => ({...current, title})); }} maxLength={100} placeholder="Ej. Repasar biología celular" placeholderTextColor={colors.muted} style={styles.eventTitleInput} returnKeyType="done" accessibilityLabel="Nombre del evento" />
              <View style={styles.formLabelRow}><Text style={styles.formLabel}>Hora</Text><Text style={styles.eventTimeValue}>{formatTime(draft.startMinute)}</Text></View>
              <View style={styles.timeControls}>
                <Pressable style={styles.timeAdjustButton} onPress={() => { setFormError(null); setDraft(current => ({...current, startMinute: (current.startMinute + 23 * 60 + 45) % (24 * 60)})); }} accessibilityLabel="Restar quince minutos"><Ionicons name="remove" size={20} color={colors.primary} /></Pressable>
                <Text style={styles.timeHint}>Ajusta en intervalos de 15 min</Text>
                <Pressable style={styles.timeAdjustButton} onPress={() => { setFormError(null); setDraft(current => ({...current, startMinute: (current.startMinute + 15) % (24 * 60)})); }} accessibilityLabel="Sumar quince minutos"><Ionicons name="add" size={20} color={colors.primary} /></Pressable>
              </View>
              <Text style={styles.formLabel}>Duración</Text>
              <View style={styles.durationChoices}>{[15, 25, 40, 60].map(minutes => <Pressable key={minutes} style={[styles.durationChoice, draft.durationMinutes === minutes && styles.durationChoiceSelected]} onPress={() => setDraft(current => ({...current, durationMinutes: minutes}))}><Text style={[styles.durationChoiceText, draft.durationMinutes === minutes && styles.durationChoiceTextSelected]}>{minutes} min</Text></Pressable>)}</View>
              <Pressable style={styles.reminderToggle} onPress={() => setDraft(current => ({...current, reminderEnabled: !current.reminderEnabled}))} accessibilityRole="switch" accessibilityState={{checked: draft.reminderEnabled}}><Ionicons name={draft.reminderEnabled ? 'checkbox' : 'square-outline'} size={21} color={draft.reminderEnabled ? colors.teal : colors.muted} /><View style={{flex: 1}}><Text style={styles.formLabel}>Avisarme antes</Text><Text style={styles.cardCaption}>Notificación local del dispositivo</Text></View></Pressable>
              {draft.reminderEnabled ? <View style={styles.reminderChoices}>{[0, 5, 10, 15, 30].map(minutes => <Pressable key={minutes} style={[styles.durationChoice, draft.reminderMinutesBefore === minutes && styles.durationChoiceSelected]} onPress={() => { setFormError(null); setDraft(current => ({...current, reminderMinutesBefore: minutes})); }}><Text style={[styles.durationChoiceText, draft.reminderMinutesBefore === minutes && styles.durationChoiceTextSelected]}>{minutes === 0 ? 'Al empezar' : `${minutes} min`}</Text></Pressable>)}</View> : null}
              {formError ? <Text style={styles.formError}>{formError}</Text> : null}
              <PrimaryButton title={busy ? 'Guardando…' : editor ? 'Guardar cambios' : 'Crear recordatorio'} icon="checkmark" onPress={() => { void saveSession(); }} disabled={!isValidTitle || busy} loading={busy} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
        {materials.map(material => {
          const completed = sessions.filter(session => session.materialId === material.id && session.status === 'completed').length;
          const percent = material.topics ? Math.min(Math.round(completed / material.topics * 100), 100) : 0;
          return <ProgressTopic key={material.id ?? material.name} title={material.name} detail={`${completed} de ${material.topics} sesiones completadas`} percent={percent} />;
        })}
        {!materials.length ? <Text style={styles.cardCaption}>Los PDFs locales aparecen aquí cuando hayas creado un plan de estudio.</Text> : null}
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

function getWeekDays(offset = 0) {
  const today = new Date();
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return Array.from({length: 7}, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index + offset * 7);
    return {date, label: date.toLocaleDateString('es', {weekday: 'short'}).replace('.', ''), isToday: date.toDateString() === today.toDateString()};
  });
}

function getWeekOffsetForDate(dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00`);
  const today = new Date();
  const currentMonday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  currentMonday.setDate(currentMonday.getDate() - ((currentMonday.getDay() + 6) % 7));
  const selectedMonday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  selectedMonday.setDate(selectedMonday.getDate() - ((selectedMonday.getDay() + 6) % 7));
  return Math.round((selectedMonday.getTime() - currentMonday.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

function formatTime(startMinute: number) {
  const normalized = (startMinute + 24 * 60) % (24 * 60);
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

export function LessonScreen({ownerId, preferences, materialId, topicIndex = 0, learningFormat, onBack}: {ownerId: string; preferences: UserProfile['preferences']; materialId?: string; topicIndex?: number; learningFormat?: LearningFormat; onBack: () => void}) {
  const preferredFormat = learningFormat ?? preferences.formats[0] ?? 'practice';
  const [modeOverride, setModeOverride] = useState<{format: LearningFormat; mode: 'read' | 'listen' | 'visual' | 'practice'} | null>(null);
  const mode = modeOverride?.format === preferredFormat ? modeOverride.mode : lessonModesByFormat[preferredFormat];
  const setMode = (nextMode: 'read' | 'listen' | 'visual' | 'practice') => setModeOverride({format: preferredFormat, mode: nextMode});
  const [material, setMaterial] = useState<LocalMaterialContent | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const suggested = formatLabels[preferredFormat];
  useEffect(() => {
    let active = true;
    if (!materialId) return;
    loadLocalPdfs(ownerId)
      .then(files => {
        const file = files.find(item => item.id === materialId);
        if (active && file?.analysis) {
          setMaterial({id: file.id, originalName: file.name, summary: file.analysis.summary, keyPoints: file.analysis.keyPoints, topics: file.analysis.topics, plannerVersion: file.analysis.plannerVersion, targetLanguage: file.analysis.targetLanguage});
        }
      })
      .catch(error => Alert.alert('No se pudo abrir el tema', error instanceof Error ? error.message : 'Inténtalo de nuevo.'));
    return () => { active = false; };
  }, [materialId, ownerId]);
  const topic = material?.topics[topicIndex];
  const keyPoints = topic ? getConciseKeyIdeas(topic) : material?.keyPoints.slice(0, 3) ?? [];
  const speechText = topic?.listenScript ?? topic?.explanation ?? material?.summary ?? '';
  const speechLanguage = material?.targetLanguage ?? getLocales()[0]?.languageTag ?? 'es-CO';
  const hasCurrentAnalysis = material?.plannerVersion === 2 && !!material.targetLanguage;
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
    Speech.speak(compactLessonText(speechText, 420), {language: speechLanguage, onDone: () => setSpeaking(false), onStopped: () => setSpeaking(false), onError: () => setSpeaking(false)});
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
        {material && hasCurrentAnalysis ? <View style={styles.languageBanner}><Ionicons name="language-outline" size={16} color={colors.teal} /><Text style={styles.languageBannerText}>Contenido adaptado en {getLearningLanguageLabel(material.targetLanguage!)} · las citas conservan el idioma original.</Text></View> : null}
        {material && !hasCurrentAnalysis ? <View style={styles.infoBox}><Ionicons name="sparkles-outline" size={18} color={colors.primary} /><Text style={styles.infoBoxText}>Este material tiene un plan anterior. Vuelve a Materiales y pulsa “Mejorar plan” para actualizar sus ideas, idioma y ejercicios.</Text></View> : null}
        <View style={styles.suggestedBanner}><Ionicons name="sparkles-outline" size={16} color={colors.primary} /><Text style={styles.suggestedText}>Sugerido para ti: {suggested}</Text></View>
        <View style={styles.lessonModes}>
          <LessonMode title="Leer" icon="book-outline" active={mode === 'read'} onPress={() => setMode('read')} />
          <LessonMode title="Escuchar" icon="headset-outline" active={mode === 'listen'} onPress={() => setMode('listen')} />
          <LessonMode title="Esquema" icon="git-network-outline" active={mode === 'visual'} onPress={() => setMode('visual')} />
          <LessonMode title="Practicar" icon="create-outline" active={mode === 'practice'} onPress={() => setMode('practice')} />
        </View>
        {mode === 'read' ? <LessonSection title={topic?.title ?? 'Resumen del material'} body={compactLessonText(topic?.explanation ?? material?.summary ?? 'Abre una sesión desde tu plan para estudiar los temas que organizamos desde tu PDF.')} /> : null}
        {mode === 'read' && topic ? <VisualSummary points={keyPoints} title={topic.kind === 'assignment' ? 'Entregables clave' : 'Ideas clave'} /> : null}
        {mode === 'listen' ? <SurfaceCard style={styles.audioCard}><Pressable style={styles.audioCircle} onPress={toggleSpeech} accessibilityLabel={speaking ? 'Detener lectura en voz alta' : 'Escuchar resumen'}><Ionicons name={speaking ? 'stop' : 'play'} size={20} color={colors.surface} /></Pressable><View style={{flex: 1}}><Text style={styles.sectionTitle}>{speaking ? 'Reproduciendo resumen' : 'Escucha el resumen'}</Text><Text style={styles.cardCaption} numberOfLines={4}>{compactLessonText(speechText || 'Carga un tema desde tu plan para escucharlo.', 250)}</Text></View><Ionicons name="volume-high-outline" size={20} color={colors.teal} /></SurfaceCard> : null}
        {mode === 'visual' ? <VisualSummary points={keyPoints} title={topic?.kind === 'assignment' ? 'Entregables clave' : 'Ideas clave'} /> : null}
        {mode === 'practice' ? topic?.activities?.length ? <AdaptivePractice key={`${ownerId}:${material?.id ?? materialId ?? 'lesson'}:${topicIndex}`} ownerId={ownerId} lessonKey={`${material?.id ?? materialId ?? 'lesson'}:${topicIndex}`} activities={topic.activities} goal={preferences.goal} /> : <View style={styles.infoBox}><Ionicons name="document-text-outline" size={18} color={colors.primary} /><Text style={styles.infoBoxText}>{hasCurrentAnalysis ? 'Este tema no tiene actividades verificadas. Actualiza el material desde Materiales para volver a generarlas.' : 'El plan anterior no tiene ejercicios validados. Actualiza el material desde Materiales para practicar con actividades basadas en el PDF.'}</Text></View> : null}
        {topic?.sourceEvidence ? <LessonSection title="Cita del PDF" body={topic.sourceEvidence} /> : null}
        <SurfaceCard style={styles.sourceCard}><Ionicons name="document-text-outline" size={18} color={colors.muted} /><Text style={styles.sourceText}>{material ? `Organizado desde ${material.originalName}` : 'Contenido de tu sesión'}</Text></SurfaceCard>
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

function VisualSummary({points, title = 'Ideas clave'}: {points: string[]; title?: string}) {
  return (
    <SurfaceCard style={styles.visualCard}>
      <Text style={styles.lessonSectionTitle}>{title}</Text>
      {points.length ? points.slice(0, 6).map((point, index) => <View key={`${index}-${point}`} style={styles.visualPoint}><View style={[styles.visualStepIcon, {backgroundColor: index % 2 ? colors.tealSoft : colors.amberSoft}]}><Text style={styles.visualPointIndex}>{index + 1}</Text></View><Text style={styles.visualPointText}>{point}</Text></View>) : <Text style={styles.lessonBody}>No hay un esquema para este tema todavía.</Text>}
    </SurfaceCard>
  );
}

function compactLessonText(value: string, maxLength = 460) {
  const sentences = value.replace(/\s+/g, ' ').trim().match(/[^.!?。！？]+[.!?。！？]?/gu) ?? [];
  const compact = sentences.slice(0, 2).join(' ').trim();
  if (compact.length <= maxLength) return compact;
  const clipped = compact.slice(0, maxLength);
  const lastSpace = clipped.lastIndexOf(' ');
  return `${clipped.slice(0, lastSpace > maxLength * 0.65 ? lastSpace : maxLength).trimEnd()}…`;
}

function SessionRow({time, title, detail, status, onPress, onEdit, onDelete, onComplete}: {time: string; title: string; detail: string; status: 'done' | 'next' | 'planned'; onPress?: () => void; onEdit?: () => void; onDelete?: () => void; onComplete?: () => void}) {
  const accent = status === 'done' ? colors.teal : status === 'next' ? colors.amber : colors.primary;
  return (
    <View style={[styles.sessionRow, status === 'next' && styles.sessionRowNext]}>
      <Text style={styles.sessionTime}>{time}</Text>
      <View style={[styles.sessionAccent, {backgroundColor: accent}]} />
      <Pressable onPress={onPress} disabled={!onPress} style={styles.sessionCopy} accessibilityRole={onPress ? 'button' : undefined}><Text style={styles.materialName}>{title}</Text><Text style={styles.materialMeta}>{detail}</Text></Pressable>
      {onComplete ? <Pressable onPress={onComplete} hitSlop={12} style={styles.rescheduleButton} accessibilityLabel="Completar sesión"><Ionicons name="checkmark-outline" size={19} color={colors.teal} /></Pressable> : null}
      {onEdit ? <Pressable onPress={onEdit} hitSlop={10} style={styles.rescheduleButton} accessibilityLabel="Editar evento"><Ionicons name="create-outline" size={18} color={colors.primary} /></Pressable> : null}
      {onDelete ? <Pressable onPress={onDelete} hitSlop={10} style={styles.sessionDeleteButton} accessibilityLabel="Eliminar evento"><Ionicons name="trash-outline" size={16} color={colors.muted} /></Pressable> : null}
      {!onEdit && !onDelete ? <Ionicons name={status === 'done' ? 'checkmark-circle' : onPress ? 'chevron-forward' : 'ellipse-outline'} size={19} color={status === 'done' ? colors.teal : colors.muted} /> : null}
    </View>
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
  aiModelCard: {marginTop: 16},
  aiModelHeading: {flexDirection: 'row', alignItems: 'center', gap: 10},
  aiModelIcon: {width: 38, height: 38, borderRadius: 12, backgroundColor: '#EEEFFE', alignItems: 'center', justifyContent: 'center'},
  aiModelCopy: {flex: 1},
  aiModelDescription: {fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 11},
  aiModelActionRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10},
  aiModelMeta: {flex: 1, fontSize: 11, lineHeight: 16, color: colors.muted},
  aiModelActionText: {fontSize: 12, color: colors.primary, fontWeight: '700'},
  aiModelDownloadButton: {minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 11, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background},
  aiModelDownloadText: {fontSize: 12, color: colors.primary, fontWeight: '700'},
  disabledControl: {opacity: 0.5},
  voiceNotesCard: {marginTop: 15},
  voiceNotesHeading: {flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 13},
  voiceNoteRow: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border},
  voiceNoteIcon: {width: 34, height: 34, borderRadius: 11, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center'},
  planActionRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 14},
  planAction: {flexGrow: 1, flexBasis: '31%', minHeight: 42, paddingHorizontal: 6, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5},
  planActionText: {fontSize: 10, color: colors.primary, fontWeight: '700'},
  materialCard: {gap: 9, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 13, borderRadius: radius.md},
  materialCardMain: {flexDirection: 'row', alignItems: 'center', gap: 11},
  materialOpen: {flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 11},
  deleteMaterialButton: {width: 34, height: 34, alignItems: 'center', justifyContent: 'center'},
  analysisPreview: {borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10},
  analysisProviderLabel: {fontSize: 10, color: colors.teal, fontWeight: '700', marginBottom: 5},
  analysisSummary: {fontSize: 12, color: colors.muted, lineHeight: 18},
  languageNote: {fontSize: 10, lineHeight: 15, color: colors.teal, marginTop: 6, marginBottom: 4},
  analysisTopicsTitle: {fontSize: 11, fontWeight: '700', color: colors.text, marginTop: 9, marginBottom: 3},
  analysisWarning: {fontSize: 11, color: colors.danger, lineHeight: 16, marginTop: 5},
  analysisTopic: {minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderTopWidth: 1, borderTopColor: colors.border},
  analysisTopicText: {flex: 1, fontSize: 12, color: colors.primary, fontWeight: '600'},
  materialInfo: {flex: 1},
  progressTrackSmall: {height: 5, backgroundColor: '#E7EAF0', borderRadius: 3, overflow: 'hidden', marginTop: 7},
  progressFillSmall: {height: 5, borderRadius: 3, backgroundColor: colors.teal},
  infoBox: {flexDirection: 'row', alignItems: 'flex-start', gap: 9, backgroundColor: '#F0F1FF', padding: 13, borderRadius: radius.sm, marginTop: 17},
  infoBoxText: {flex: 1, fontSize: 12, lineHeight: 18, color: colors.muted},
  createPlanButton: {alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 9, paddingVertical: 6, paddingHorizontal: 9, borderRadius: radius.pill, backgroundColor: '#EEEFFE'},
  createPlanButtonText: {fontSize: 11, color: colors.primary, fontWeight: '700'},
  calendarCard: {paddingHorizontal: 8, paddingVertical: 13, marginBottom: 18},
  weekNavigation: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, marginBottom: 12},
  weekRange: {fontSize: 13, color: colors.text, fontWeight: '700'},
  weekDays: {flexDirection: 'row', justifyContent: 'space-around'},
  dayCell: {alignItems: 'center', gap: 6, minWidth: 34, paddingVertical: 2},
  dayName: {fontSize: 11, color: colors.muted},
  dayNumber: {width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center'},
  daySelected: {backgroundColor: colors.primary},
  dayToday: {borderWidth: 1, borderColor: colors.primary},
  dayNumberText: {fontSize: 12, color: colors.text, fontWeight: '600'},
  dayNumberTextSelected: {color: colors.surface},
  dayEventDot: {width: 5, height: 5, borderRadius: 3, backgroundColor: 'transparent'},
  dayEventDotActive: {backgroundColor: colors.teal},
  selectedDayHeader: {flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12},
  selectedDayTitle: {fontSize: 16, color: colors.text, fontWeight: '700', textTransform: 'capitalize'},
  addDayButton: {width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center'},
  statusBanner: {flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: colors.tealSoft, padding: 11, borderRadius: radius.sm, marginBottom: 9},
  statusText: {flex: 1, fontSize: 12, color: colors.teal, lineHeight: 17, fontWeight: '600'},
  localCalendarNote: {flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 4, marginBottom: 10},
  localCalendarText: {flex: 1, fontSize: 11, color: colors.muted, lineHeight: 16},
  sessionRow: {minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 11, marginBottom: 10},
  sessionRowNext: {backgroundColor: '#FFFCF5', borderColor: '#F5D38D'},
  sessionTime: {width: 43, fontSize: 11, color: colors.muted, fontWeight: '600'},
  sessionAccent: {width: 4, height: 42, borderRadius: 2},
  sessionCopy: {flex: 1},
  rescheduleButton: {width: 34, height: 34, borderRadius: 11, backgroundColor: '#F0F1FF', alignItems: 'center', justifyContent: 'center'},
  sessionDeleteButton: {width: 28, height: 34, alignItems: 'center', justifyContent: 'center'},
  modalBackdrop: {flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 23, 42, 0.42)'},
  modalSheet: {width: '100%', maxWidth: 520, maxHeight: '92%', alignSelf: 'center', backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 19, paddingHorizontal: 20, paddingBottom: 26},
  modalHeading: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 13, borderBottomWidth: 1, borderBottomColor: colors.border},
  modalTitle: {fontSize: 21, color: colors.text, fontWeight: '800'},
  modalSubtitle: {fontSize: 13, color: colors.muted, marginTop: 3, textTransform: 'capitalize'},
  modalContent: {paddingTop: 16, paddingBottom: 12},
  formLabel: {fontSize: 13, color: colors.text, fontWeight: '700', marginBottom: 8},
  eventTitleInput: {minHeight: 50, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.sm, paddingHorizontal: 13, fontSize: 16, color: colors.text, marginBottom: 18},
  formLabelRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  eventTimeValue: {fontSize: 22, color: colors.primary, fontWeight: '800'},
  timeControls: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16},
  timeAdjustButton: {width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#EEEFFE'},
  timeHint: {fontSize: 11, color: colors.muted},
  durationChoices: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16},
  durationChoice: {minHeight: 36, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center'},
  durationChoiceSelected: {borderColor: colors.teal, backgroundColor: colors.tealSoft},
  durationChoiceText: {fontSize: 12, color: colors.muted, fontWeight: '600'},
  durationChoiceTextSelected: {color: colors.teal},
  reminderToggle: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.border},
  reminderChoices: {flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingBottom: 16},
  formError: {fontSize: 12, lineHeight: 17, color: colors.danger, fontWeight: '600', marginBottom: 12},
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
  lessonModes: {flexDirection: 'row', gap: 5, marginBottom: 14},
  lessonMode: {flex: 1, minWidth: 0, height: 42, paddingHorizontal: 3, borderRadius: radius.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4},
  lessonModeActive: {borderColor: colors.primary, backgroundColor: '#F0F1FF'},
  lessonModeText: {fontSize: 10, color: colors.muted, fontWeight: '600'},
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
  languageBanner: {flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: radius.sm, backgroundColor: colors.tealSoft, marginBottom: 12},
  languageBannerText: {flex: 1, fontSize: 11, lineHeight: 16, color: colors.teal, fontWeight: '600'},
  visualStepText: {fontSize: 10, color: colors.muted, fontWeight: '600'},
  sourceCard: {flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 11, marginBottom: 14},
  sourceText: {fontSize: 12, color: colors.muted},
});
