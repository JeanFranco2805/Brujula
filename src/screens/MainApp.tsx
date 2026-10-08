import React, {useMemo, useState} from 'react';
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
import {AppPage, Brand, Pill, PrimaryButton, SectionHeading, SurfaceCard} from '../components/ui';
import {colors, radius} from '../theme';
import type {LearningFormat, UserProfile} from '../types';

export type TabKey = 'home' | 'materials' | 'plan' | 'progress';
type Material = {name: string; topics: number; progress: number; isLocal?: boolean};

const initialMaterials: Material[] = [
  {name: 'Biología celular.pdf', topics: 12, progress: 4},
  {name: 'Genética molecular.pdf', topics: 8, progress: 2},
];

const formatLabels: Record<LearningFormat, string> = {
  read: 'Leer',
  listen: 'Escuchar',
  visual: 'Ver esquemas',
  practice: 'Practicar',
};

export function MainApp({
  account,
  activeTab,
  onEditPreferences,
  onSignOut,
  onOpenLesson,
}: {
  account: UserProfile;
  activeTab: TabKey;
  onEditPreferences: () => void;
  onSignOut: () => void;
  onOpenLesson: () => void;
}) {
  const [materials, setMaterials] = useState(initialMaterials);
  const firstName = account.name.trim().split(/\s+/)[0] || 'Estudiante';

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
        {activeTab === 'home' ? <HomeTab firstName={firstName} account={account} onContinue={onOpenLesson} onEditPreferences={onEditPreferences} /> : null}
        {activeTab === 'materials' ? <MaterialsTab materials={materials} setMaterials={setMaterials} onOpenLesson={onOpenLesson} /> : null}
        {activeTab === 'plan' ? <PlanTab onOpenLesson={onOpenLesson} /> : null}
        {activeTab === 'progress' ? <ProgressTab account={account} onEditPreferences={onEditPreferences} /> : null}
        <Pressable style={styles.signOut} onPress={() => Alert.alert('Cerrar sesión', '¿Quieres volver a la pantalla de acceso?', [{text: 'Cancelar', style: 'cancel'}, {text: 'Cerrar sesión', style: 'destructive', onPress: onSignOut}])}>
          <Ionicons name="log-out-outline" size={16} color={colors.muted} /><Text style={styles.signOutText}>Cerrar sesión</Text>
        </Pressable>
      </ScrollView>

    </AppPage>
  );
}

function HomeTab({firstName, account, onContinue, onEditPreferences}: {firstName: string; account: UserProfile; onContinue: () => void; onEditPreferences: () => void}) {
  return (
    <>
      <Text style={styles.greeting}>Hola, {firstName}</Text>
      <Text style={styles.subGreeting}>Un paso claro para tu estudio de hoy.</Text>

      <View style={styles.todayCard}>
        <View style={styles.todayHeader}>
          <Text style={styles.todayEyebrow}>TU PLAN DE HOY</Text>
          <View style={styles.todayDate}><Ionicons name="calendar-outline" size={14} color={colors.muted} /><Text style={styles.todayDateText}>15 min</Text></View>
        </View>
        <View style={styles.todayBody}>
          <View style={styles.subjectIcon}><Ionicons name="leaf-outline" size={27} color={colors.teal} /></View>
          <View style={styles.todayCopy}><Text style={styles.todayTitle}>Biología celular</Text><Text style={styles.todayDetail}>Repaso: Fotosíntesis</Text></View>
        </View>
        <PrimaryButton title="Continuar estudiando" icon="play" onPress={onContinue} />
      </View>

      <SurfaceCard style={styles.weekCard}>
        <View style={styles.weekTitleRow}><Text style={styles.sectionTitle}>Tu progreso esta semana</Text><Text style={styles.weekCount}>3 de 5</Text></View>
        <View style={styles.progressTrack}><View style={styles.progressFill} /></View>
        <Text style={styles.cardCaption}>Vas avanzando a tu ritmo.</Text>
      </SurfaceCard>

      <SectionHeading title="Material reciente" action="Ver todo" onAction={onContinue} />
      <Pressable style={styles.materialMini} onPress={onContinue}>
        <View style={styles.pdfIcon}><Ionicons name="document-text" size={20} color={colors.primary} /></View>
        <View style={styles.materialMiniCopy}><Text style={styles.materialName}>Biología celular.pdf</Text><Text style={styles.materialMeta}>4 de 12 temas estudiados</Text></View>
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

function MaterialsTab({materials, setMaterials, onOpenLesson}: {materials: Material[]; setMaterials: React.Dispatch<React.SetStateAction<Material[]>>; onOpenLesson: () => void}) {
  const importPdf = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({type: 'application/pdf', copyToCacheDirectory: true});
      if (result.canceled || !result.assets[0]) return;
      const picked = result.assets[0];
      setMaterials(previous => [{name: picked.name, topics: 0, progress: 0, isLocal: true}, ...previous]);
      Alert.alert('PDF agregado', 'El archivo ya aparece en tus materiales. La lectura inteligente y los resúmenes estarán disponibles en una próxima etapa.');
    } catch {
      Alert.alert('No se pudo abrir el archivo', 'Inténtalo de nuevo o selecciona otro PDF.');
    }
  };

  return (
    <>
      <Text style={styles.pageTitle}>Materiales</Text>
      <Text style={styles.subGreeting}>Tus apuntes y recursos en un solo lugar.</Text>
      <PrimaryButton title="Importar PDF" icon="add" onPress={importPdf} />
      <View style={styles.materialList}>
        {materials.map((material, index) => (
          <Pressable key={`${material.name}-${index}`} style={styles.materialCard} onPress={onOpenLesson}>
            <View style={[styles.pdfIcon, index % 2 === 1 && styles.pdfIconAlt]}><Ionicons name="document-text" size={21} color={index % 2 === 1 ? colors.teal : colors.primary} /></View>
            <View style={styles.materialInfo}><Text style={styles.materialName}>{material.name}</Text><Text style={styles.materialMeta}>{material.isLocal ? 'PDF importado · listo para procesar' : `${material.topics} temas`}</Text>
              {!material.isLocal ? <><Text style={styles.progressLabel}>{material.progress} de {material.topics} temas</Text><View style={styles.progressTrackSmall}><View style={[styles.progressFillSmall, {width: `${material.topics ? (material.progress / material.topics) * 100 : 0}%`}]} /></View></> : null}
            </View>
            <Ionicons name="chevron-forward" size={19} color={colors.muted} />
          </Pressable>
        ))}
      </View>
      <View style={styles.infoBox}><Ionicons name="sparkles-outline" size={18} color={colors.primary} /><Text style={styles.infoBoxText}>En una próxima etapa, Brújula organizará cada PDF en temas y resúmenes con referencias a sus páginas.</Text></View>
    </>
  );
}

function PlanTab({onOpenLesson}: {onOpenLesson: () => void}) {
  const reschedule = () => Alert.alert('Reprogramar sesión', 'Elige cuándo te viene mejor:', [
    {text: 'Hoy · 7:00 p. m.', onPress: () => Alert.alert('Sesión actualizada', 'Tu plan de estudio se ajustó localmente.')},
    {text: 'Mañana · 6:30 p. m.', onPress: () => Alert.alert('Sesión actualizada', 'Tu plan de estudio se ajustó localmente.')},
    {text: 'Cancelar', style: 'cancel'},
  ]);
  return (
    <>
      <Text style={styles.pageTitle}>Tu semana</Text>
      <Text style={styles.subGreeting}>Organiza tu tiempo de estudio con calma.</Text>
      <SurfaceCard style={styles.calendarCard}>
        <View style={styles.weekDays}>
          {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((day, i) => <View key={day} style={styles.dayCell}><Text style={styles.dayName}>{day}</Text><View style={[styles.dayNumber, i === 1 && styles.daySelected]}><Text style={[styles.dayNumberText, i === 1 && styles.dayNumberTextSelected]}>{13 + i}</Text></View></View>)}
        </View>
      </SurfaceCard>
      <SectionHeading title="Sesiones" />
      <SessionRow time="09:00" title="Biología celular" detail="15 min · completada" status="done" onPress={onOpenLesson} />
      <SessionRow time="11:00" title="Repaso: Fotosíntesis" detail="15 min · siguiente" status="next" onPress={onOpenLesson} onReschedule={reschedule} />
      <SessionRow time="15:00" title="Genética molecular" detail="25 min · lectura y práctica" status="planned" onPress={onOpenLesson} />
      <View style={styles.infoBox}><Ionicons name="calendar-outline" size={18} color={colors.primary} /><Text style={styles.infoBoxText}>La sincronización con el calendario del teléfono y los recordatorios se activará al conectar las funciones nativas.</Text></View>
    </>
  );
}

function ProgressTab({account, onEditPreferences}: {account: UserProfile; onEditPreferences: () => void}) {
  return (
    <>
      <Text style={styles.pageTitle}>Tu progreso</Text>
      <Text style={styles.subGreeting}>Cada sesión cuenta. Mira lo que ya avanzaste.</Text>
      <View style={styles.statGrid}>
        <StatCard value="3" label="sesiones esta semana" icon="checkmark-circle-outline" tint={colors.tealSoft} />
        <StatCard value="45 min" label="tiempo de estudio" icon="time-outline" tint={colors.amberSoft} />
      </View>
      <SurfaceCard style={styles.progressSummary}>
        <Text style={styles.sectionTitle}>Temas en curso</Text>
        <ProgressTopic title="Biología celular" detail="4 de 12 temas" percent={34} />
        <ProgressTopic title="Genética molecular" detail="2 de 8 temas" percent={25} />
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

export function LessonScreen({preferences, onBack}: {preferences: UserProfile['preferences']; onBack: () => void}) {
  const [mode, setMode] = useState<'read' | 'listen' | 'visual'>('read');
  const suggested = useMemo(() => formatLabels[preferences.formats[0]] ?? 'Practicar', [preferences.formats]);
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
          <View style={{flex: 1}}><Text style={styles.lessonTitle}>Fotosíntesis</Text><Text style={styles.materialMeta}>Biología celular.pdf · pág. 7</Text></View>
        </View>
        <View style={styles.suggestedBanner}><Ionicons name="sparkles-outline" size={16} color={colors.primary} /><Text style={styles.suggestedText}>Sugerido para ti: {suggested}</Text></View>
        <View style={styles.lessonModes}>
          <LessonMode title="Leer" icon="book-outline" active={mode === 'read'} onPress={() => setMode('read')} />
          <LessonMode title="Escuchar" icon="headset-outline" active={mode === 'listen'} onPress={() => setMode('listen')} />
          <LessonMode title="Esquema" icon="git-network-outline" active={mode === 'visual'} onPress={() => setMode('visual')} />
        </View>
        {mode === 'read' ? <LessonSection title="Qué es" body="La fotosíntesis es el proceso mediante el cual las plantas convierten la energía de la luz en energía química." /> : null}
        {mode === 'read' ? <LessonSection title="Dónde ocurre" body="Ocurre principalmente en los cloroplastos, estructuras de las células vegetales que contienen clorofila." /> : null}
        {mode === 'listen' ? <SurfaceCard style={styles.audioCard}><View style={styles.audioCircle}><Ionicons name="play" size={20} color={colors.surface} /></View><View style={{flex: 1}}><Text style={styles.sectionTitle}>Audio de repaso</Text><Text style={styles.cardCaption}>Resumen breve · 2 min</Text></View><Ionicons name="volume-high-outline" size={20} color={colors.teal} /></SurfaceCard> : null}
        {mode === 'visual' ? <VisualSummary /> : null}
        <SurfaceCard style={styles.sourceCard}><Ionicons name="document-text-outline" size={18} color={colors.muted} /><Text style={styles.sourceText}>Contenido basado en tu PDF · página 7</Text></SurfaceCard>
        <PrimaryButton title="Practicar 5 preguntas" icon="help-circle-outline" onPress={() => Alert.alert('Práctica', 'Las preguntas se generarán a partir de este tema cuando se conecte el servicio de IA.')} />
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

function VisualSummary() {
  return (
    <SurfaceCard style={styles.visualCard}>
      <Text style={styles.lessonSectionTitle}>El proceso, en breve</Text>
      <View style={styles.visualSteps}>
        <View style={styles.visualStep}><View style={styles.visualStepIcon}><Ionicons name="sunny-outline" size={19} color={colors.amber} /></View><Text style={styles.visualStepText}>Luz solar</Text></View>
        <Ionicons name="arrow-forward" size={17} color={colors.muted} />
        <View style={styles.visualStep}><View style={[styles.visualStepIcon, {backgroundColor: colors.tealSoft}]}><Ionicons name="leaf-outline" size={19} color={colors.teal} /></View><Text style={styles.visualStepText}>Cloroplasto</Text></View>
        <Ionicons name="arrow-forward" size={17} color={colors.muted} />
        <View style={styles.visualStep}><View style={[styles.visualStepIcon, {backgroundColor: colors.amberSoft}]}><Ionicons name="sparkles-outline" size={19} color={colors.primary} /></View><Text style={styles.visualStepText}>Energía</Text></View>
      </View>
    </SurfaceCard>
  );
}

function SessionRow({time, title, detail, status, onPress, onReschedule}: {time: string; title: string; detail: string; status: 'done' | 'next' | 'planned'; onPress: () => void; onReschedule?: () => void}) {
  const accent = status === 'done' ? colors.teal : status === 'next' ? colors.amber : colors.primary;
  return (
    <Pressable onPress={onPress} style={[styles.sessionRow, status === 'next' && styles.sessionRowNext]}>
      <Text style={styles.sessionTime}>{time}</Text>
      <View style={[styles.sessionAccent, {backgroundColor: accent}]} />
      <View style={styles.sessionCopy}><Text style={styles.materialName}>{title}</Text><Text style={styles.materialMeta}>{detail}</Text></View>
      {onReschedule ? <Pressable onPress={onReschedule} hitSlop={12} style={styles.rescheduleButton}><Ionicons name="refresh-outline" size={19} color={colors.primary} /></Pressable> : <Ionicons name={status === 'done' ? 'checkmark-circle' : 'chevron-forward'} size={19} color={status === 'done' ? colors.teal : colors.muted} />}
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
  materialCard: {flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 13, borderRadius: radius.md},
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
  visualStepText: {fontSize: 10, color: colors.muted, fontWeight: '600'},
  sourceCard: {flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 11, marginBottom: 14},
  sourceText: {fontSize: 12, color: colors.muted},
});
