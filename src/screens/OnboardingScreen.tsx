import React, {useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {AppPage, Brand, PrimaryButton, SurfaceCard} from '../components/ui';
import {colors, radius} from '../theme';
import type {LearningFormat, StudyGoal, StudyPreferences, StudyRhythm} from '../types';

type IconName = keyof typeof Ionicons.glyphMap;

const formats: {key: LearningFormat; title: string; detail: string; icon: IconName}[] = [
  {key: 'read', title: 'Leer', detail: 'Explicaciones y resúmenes', icon: 'book-outline'},
  {key: 'listen', title: 'Escuchar', detail: 'Audio para repasar', icon: 'headset-outline'},
  {key: 'visual', title: 'Ver esquemas', detail: 'Mapas y diagramas', icon: 'git-network-outline'},
  {key: 'practice', title: 'Practicar', detail: 'Preguntas y ejercicios', icon: 'create-outline'},
];

const goals: {key: StudyGoal; title: string; detail: string; icon: IconName}[] = [
  {key: 'exam', title: 'Preparar un examen', detail: 'Organiza los temas antes de una fecha importante', icon: 'ribbon-outline'},
  {key: 'understand', title: 'Entender mis apuntes', detail: 'Convierte materiales complejos en pasos claros', icon: 'bulb-outline'},
  {key: 'habit', title: 'Crear un hábito', detail: 'Avanza con sesiones pequeñas y constantes', icon: 'calendar-clear-outline'},
];

const formatNames: Record<LearningFormat, string> = {
  read: 'Leer',
  listen: 'Escuchar',
  visual: 'Esquemas',
  practice: 'Practicar',
};

const goalNames: Record<StudyGoal, string> = {
  exam: 'Preparar un examen',
  understand: 'Entender mis apuntes',
  habit: 'Crear un hábito',
};

export function OnboardingScreen({
  initialPreferences,
  editing = false,
  loading = false,
  error,
  onClearError,
  onFinish,
  onCancel,
}: {
  initialPreferences: StudyPreferences;
  editing?: boolean;
  loading?: boolean;
  error?: string | null;
  onClearError?: () => void;
  onFinish: (preferences: StudyPreferences) => void;
  onCancel?: () => void;
}) {
  const [step, setStep] = useState(0);
  const [preferences, setPreferences] = useState<StudyPreferences>(initialPreferences);

  const clearError = () => onClearError?.();

  const toggleFormat = (format: LearningFormat) => {
    clearError();
    const selected = preferences.formats.includes(format);
    setPreferences({...preferences, formats: selected ? preferences.formats.filter(item => item !== format) : [...preferences.formats, format]});
  };
  const setRhythm = (rhythm: StudyRhythm) => {clearError(); setPreferences({...preferences, rhythm});};
  const setMinutes = (minutesPerDay: number) => {clearError(); setPreferences({...preferences, minutesPerDay});};
  const setGoal = (goal: StudyGoal) => {clearError(); setPreferences({...preferences, goal});};

  const next = () => {
    clearError();
    if (step === 0 && preferences.formats.length === 0) return;
    if (step < 2) setStep(step + 1);
    else onFinish(preferences);
  };

  return (
    <AppPage>
      <View style={styles.topBar}>
        <Brand compact />
        {editing && onCancel ? (
          <Pressable onPress={onCancel} style={styles.closeButton} accessibilityLabel="Cerrar preferencias">
            <Ionicons name="close" size={21} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.stepMeta}>
          <Text style={styles.stepLabel}>PASO {step + 1} DE 3</Text>
          <Text style={styles.stepCount}>{Math.round(((step + 1) / 3) * 100)}%</Text>
        </View>
        <View style={styles.progressTrack}><View style={[styles.progressFill, {width: `${((step + 1) / 3) * 100}%`}]} /></View>
        {error ? <View accessibilityRole="alert" style={styles.errorBanner}><Ionicons name="alert-circle-outline" size={18} color={colors.danger} /><Text style={styles.errorText}>{error}</Text></View> : null}

        {step === 0 ? (
          <>
            <Text style={styles.title}>¿Qué formatos prefieres?</Text>
            <Text style={styles.subtitle}>Puedes elegir varios. No te vamos a encasillar: usaremos tus preferencias como punto de partida.</Text>
            <View style={styles.formatGrid}>
              {formats.map(option => {
                const selected = preferences.formats.includes(option.key);
                return (
                  <Pressable key={option.key} onPress={() => toggleFormat(option.key)} style={[styles.formatCard, selected && styles.optionSelected]} accessibilityRole="checkbox" accessibilityState={{checked: selected}}>
                    <View style={[styles.formatIcon, selected && styles.formatIconSelected]}><Ionicons name={option.icon} size={21} color={selected ? colors.teal : colors.primary} /></View>
                    <Text style={styles.optionTitle}>{option.title}</Text>
                    <Text style={styles.optionDetail}>{option.detail}</Text>
                    <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={selected ? colors.teal : '#C5CBD5'} style={styles.check} />
                  </Pressable>
                );
              })}
            </View>
            {preferences.formats.length === 0 ? <Text style={styles.selectionHint}>Selecciona al menos un formato para continuar.</Text> : null}
            <View style={styles.reassurance}><Ionicons name="options-outline" size={18} color={colors.teal} /><Text style={styles.reassuranceText}>Son preferencias iniciales. Podrás cambiarlas cuando quieras.</Text></View>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Text style={styles.title}>¿Qué ritmo te funciona?</Text>
            <Text style={styles.subtitle}>Diseñamos un plan realista que puedas sostener semana a semana.</Text>
            <Text style={styles.groupLabel}>DISTRIBUCIÓN</Text>
            <View style={styles.choiceList}>
              <ChoiceCard title="Repasos espaciados" detail="Sesiones breves repartidas en varios días" icon="time-outline" selected={preferences.rhythm === 'spaced'} onPress={() => setRhythm('spaced')} />
              <ChoiceCard title="Bloques más largos" detail="Menos sesiones, con más tiempo cada vez" icon="hourglass-outline" selected={preferences.rhythm === 'longBlocks'} onPress={() => setRhythm('longBlocks')} />
            </View>
            <Text style={[styles.groupLabel, {marginTop: 24}]}>TIEMPO DISPONIBLE AL DÍA</Text>
            <View style={styles.minutesRow}>
              {[15, 25, 40].map(minutes => (
                <Pressable key={minutes} onPress={() => setMinutes(minutes)} style={[styles.minuteChoice, preferences.minutesPerDay === minutes && styles.minuteChoiceSelected]}>
                  <Text style={[styles.minuteValue, preferences.minutesPerDay === minutes && styles.minuteValueSelected]}>{minutes}</Text>
                  <Text style={[styles.minuteUnit, preferences.minutesPerDay === minutes && styles.minuteValueSelected]}>min</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Text style={styles.title}>¿Qué quieres lograr?</Text>
            <Text style={styles.subtitle}>Esto nos ayuda a ordenar tus materiales y sugerir un plan inicial.</Text>
            <View style={styles.choiceList}>
              {goals.map(goal => <ChoiceCard key={goal.key} title={goal.title} detail={goal.detail} icon={goal.icon} selected={preferences.goal === goal.key} onPress={() => setGoal(goal.key)} />)}
            </View>
            <SurfaceCard style={styles.summaryCard}>
              <View style={styles.summaryIcon}><Ionicons name="sparkles-outline" size={19} color={colors.primary} /></View>
              <View style={styles.summaryCopy}>
                <Text style={styles.summaryTitle}>Tu punto de partida</Text>
              <Text style={styles.summaryText}>{preferences.formats.map(format => formatNames[format]).join(', ')} · {preferences.minutesPerDay} min al día · {preferences.rhythm === 'spaced' ? 'repasos espaciados' : 'bloques largos'} · {goalNames[preferences.goal]}</Text>
              </View>
            </SurfaceCard>
          </>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {step > 0 ? <Pressable style={styles.backButton} disabled={loading} onPress={() => {clearError(); setStep(step - 1);}}><Ionicons name="arrow-back" size={18} color={colors.muted} /><Text style={styles.backText}>Atrás</Text></Pressable> : <View style={styles.backPlaceholder} />}
        <View style={styles.nextButton}>
          <PrimaryButton title={step === 2 ? (editing ? 'Guardar preferencias' : 'Crear mi plan') : 'Continuar'} onPress={next} disabled={step === 0 && preferences.formats.length === 0} loading={step === 2 && loading} />
        </View>
      </View>
    </AppPage>
  );
}

function ChoiceCard({title, detail, icon, selected, onPress}: {title: string; detail: string; icon: IconName; selected: boolean; onPress: () => void}) {
  return (
    <Pressable onPress={onPress} style={[styles.choiceCard, selected && styles.optionSelected]} accessibilityRole="radio" accessibilityState={{selected}}>
      <View style={[styles.choiceIcon, selected && styles.formatIconSelected]}><Ionicons name={icon} size={20} color={selected ? colors.teal : colors.primary} /></View>
      <View style={styles.choiceCopy}><Text style={styles.optionTitle}>{title}</Text><Text style={styles.optionDetail}>{detail}</Text></View>
      <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? colors.teal : '#B6BFCC'} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topBar: {paddingHorizontal: 22, paddingTop: 10, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  closeButton: {width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border},
  scrollContent: {paddingHorizontal: 22, paddingTop: 18, paddingBottom: 22},
  stepMeta: {flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8},
  stepLabel: {fontSize: 11, letterSpacing: 1, fontWeight: '800', color: colors.primary},
  stepCount: {fontSize: 12, fontWeight: '700', color: colors.muted},
  progressTrack: {height: 6, borderRadius: 3, backgroundColor: '#E5E7F0', overflow: 'hidden', marginBottom: 29},
  progressFill: {height: 6, borderRadius: 3, backgroundColor: colors.primary},
  errorBanner: {flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#FEF3F2', borderWidth: 1, borderColor: '#FECDCA', borderRadius: radius.sm, padding: 11, marginTop: -15, marginBottom: 18},
  errorText: {flex: 1, fontSize: 13, lineHeight: 18, color: colors.danger, fontWeight: '600'},
  title: {fontSize: 27, lineHeight: 33, fontWeight: '800', letterSpacing: -0.5, color: colors.text},
  subtitle: {fontSize: 15, lineHeight: 22, color: colors.muted, marginTop: 9, marginBottom: 24},
  formatGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 12},
  selectionHint: {fontSize: 12, color: colors.muted, marginTop: 10, textAlign: 'center'},
  formatCard: {width: '48%', minHeight: 145, padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface},
  optionSelected: {borderColor: colors.teal, backgroundColor: '#F4FBF9'},
  formatIcon: {width: 39, height: 39, borderRadius: 13, backgroundColor: '#EEEFFE', alignItems: 'center', justifyContent: 'center', marginBottom: 10},
  formatIconSelected: {backgroundColor: colors.tealSoft},
  optionTitle: {fontSize: 15, fontWeight: '700', color: colors.text},
  optionDetail: {fontSize: 12, lineHeight: 17, color: colors.muted, marginTop: 4},
  check: {position: 'absolute', right: 12, top: 12},
  reassurance: {flexDirection: 'row', alignItems: 'center', gap: 9, padding: 13, marginTop: 18, borderRadius: radius.sm, backgroundColor: colors.tealSoft},
  reassuranceText: {flex: 1, color: colors.teal, fontSize: 12, lineHeight: 17, fontWeight: '600'},
  groupLabel: {fontSize: 11, letterSpacing: 0.8, color: colors.muted, fontWeight: '800', marginBottom: 10},
  choiceList: {gap: 10},
  choiceCard: {minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface},
  choiceIcon: {width: 40, height: 40, borderRadius: 13, backgroundColor: '#EEEFFE', alignItems: 'center', justifyContent: 'center'},
  choiceCopy: {flex: 1},
  minutesRow: {flexDirection: 'row', gap: 10},
  minuteChoice: {flex: 1, height: 72, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center'},
  minuteChoiceSelected: {borderColor: colors.primary, backgroundColor: '#F0F0FF'},
  minuteValue: {fontSize: 22, lineHeight: 26, color: colors.text, fontWeight: '800'},
  minuteUnit: {fontSize: 12, color: colors.muted},
  minuteValueSelected: {color: colors.primary},
  summaryCard: {marginTop: 22, flexDirection: 'row', gap: 12, alignItems: 'center'},
  summaryIcon: {width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEEFFE'},
  summaryCopy: {flex: 1},
  summaryTitle: {fontSize: 14, fontWeight: '700', color: colors.text},
  summaryText: {fontSize: 12, lineHeight: 17, color: colors.muted, marginTop: 3},
  footer: {paddingHorizontal: 22, paddingTop: 11, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background},
  backButton: {height: 52, minWidth: 76, flexDirection: 'row', alignItems: 'center', gap: 5},
  backText: {fontSize: 14, color: colors.muted, fontWeight: '600'},
  backPlaceholder: {width: 76},
  nextButton: {flex: 1},
});
