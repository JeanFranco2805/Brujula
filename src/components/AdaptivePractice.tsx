import React, {useEffect, useState} from 'react';
import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {createAdaptiveRounds, isSameAnswer, queueRetryRound} from '../services/adaptive-practice';
import {emptyLearningProgress, loadLocalLearningProgress, recordLocalLessonCompletion, type LessonAward, type LocalLearningProgress} from '../services/local-learning-progress';
import type {LearningActivity} from '../services/local-study-planner';
import type {StudyGoal} from '../types';
import {colors, radius} from '../theme';

type Props = {ownerId: string; lessonKey: string; activities: LearningActivity[]; goal: StudyGoal};

export function AdaptivePractice({ownerId, lessonKey, activities, goal}: Props) {
  const [rounds, setRounds] = useState(() => createAdaptiveRounds(activities, goal));
  const [roundIndex, setRoundIndex] = useState(0);
  const [progress, setProgress] = useState<LocalLearningProgress>(emptyLearningProgress);
  const [award, setAward] = useState<LessonAward | null>(null);
  const [firstTryCorrect, setFirstTryCorrect] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [recallAnswer, setRecallAnswer] = useState('');
  const [answerRevealed, setAnswerRevealed] = useState(false);
  const [mastered, setMastered] = useState(false);
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    let active = true;
    void loadLocalLearningProgress(ownerId)
      .then(value => { if (active) setProgress(value); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [ownerId]);

  if (!activities.length) return null;
  const round = rounds[roundIndex];
  const activity = round?.activity;

  const resetForNextRound = () => {
    setSelectedAnswer(null);
    setChecked(false);
    setRecallAnswer('');
    setAnswerRevealed(false);
    setMastered(false);
  };

  const finishSession = async (correctCount: number, totalRounds: number) => {
    setFinished(true);
    setSaving(true);
    try {
      const result = await recordLocalLessonCompletion(ownerId, lessonKey, correctCount, totalRounds);
      setAward(result);
      setProgress(result.progress);
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  const advance = async (wasMastered: boolean, correctCount = firstTryCorrect) => {
    const nextRounds = queueRetryRound(rounds, roundIndex, wasMastered);
    setRounds(nextRounds);
    if (roundIndex + 1 < nextRounds.length) {
      setRoundIndex(index => index + 1);
      resetForNextRound();
      return;
    }
    await finishSession(correctCount, activities.length);
  };

  const checkChoice = (option: string) => {
    if (!activity || checked) return;
    setSelectedAnswer(option);
    const isCorrect = isSameAnswer(option, activity.answer);
    setMastered(isCorrect);
    setChecked(true);
    if (isCorrect && round.retryNumber === 0) setFirstTryCorrect(count => count + 1);
  };

  const rateRecall = (remembered: boolean) => {
    const nextCorrectCount = firstTryCorrect + (remembered && round?.retryNumber === 0 ? 1 : 0);
    if (remembered && round?.retryNumber === 0) setFirstTryCorrect(nextCorrectCount);
    void advance(remembered, nextCorrectCount);
  };

  if (finished) {
    return <View style={styles.card}>
      <View style={styles.finishIcon}><Ionicons name="trophy-outline" size={24} color={colors.teal} /></View>
      <Text style={styles.title}>Sesión completada</Text>
      <Text style={styles.muted}>{firstTryCorrect} de {activities.length} respuestas recordadas al primer intento.</Text>
      <View style={styles.finishStats}>
        <View style={styles.stat}><Text style={styles.statValue}>+{award?.xpEarned ?? 0} XP</Text><Text style={styles.statLabel}>{award?.alreadyCompleted ? 'Sesión ya completada' : 'Puntos de esta sesión'}</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{progress.currentStreak} días</Text><Text style={styles.statLabel}>Racha de estudio</Text></View>
      </View>
      {saving ? <Text style={styles.muted}>Guardando progreso local…</Text> : saveError ? <Text style={styles.errorText}>La sesión terminó, pero no pudimos guardar el progreso en este dispositivo.</Text> : <View style={styles.localNote}><Ionicons name="phone-portrait-outline" size={14} color={colors.teal} /><Text style={styles.localNoteText}>Tu progreso se guarda solo en este dispositivo.</Text></View>}
    </View>;
  }

  if (!activity || !round) return null;
  const progressPercent = Math.round(((roundIndex + 1) / rounds.length) * 100);
  const isRecall = activity.kind === 'recall';

  return <View style={styles.card}>
    <View style={styles.topRow}>
      <View style={styles.roundLabel}><Ionicons name="flash-outline" size={14} color={colors.primary} /><Text style={styles.roundText}>SESIÓN ADAPTATIVA</Text></View>
      <View style={styles.xpPill}><Ionicons name="star" size={13} color="#A36B08" /><Text style={styles.xpText}>{progress.experiencePoints} XP · racha {progress.currentStreak}</Text></View>
    </View>
    <View style={styles.progressTrack} accessibilityRole="progressbar" accessibilityValue={{min: 0, max: 100, now: progressPercent}}><View style={[styles.progressFill, {width: `${progressPercent}%`}]} /></View>
    <View style={styles.roundMeta}><Text style={styles.roundText}>RONDA {roundIndex + 1} DE {rounds.length}{round.retryNumber ? ' · REPASO' : ''}</Text><Text style={styles.kindText}>{activity.kind === 'choice' ? 'Elige' : activity.kind === 'cloze' ? 'Completa' : 'Recuerda'}</Text></View>
    <Text style={styles.prompt}>{activity.prompt}</Text>

    {isRecall ? <>
      {!answerRevealed ? <>
        <TextInput value={recallAnswer} onChangeText={setRecallAnswer} placeholder="Escribe lo que recuerdas" placeholderTextColor={colors.muted} multiline textAlignVertical="top" style={styles.answerInput} accessibilityLabel="Escribe tu respuesta de memoria" />
        <Pressable accessibilityRole="button" disabled={!recallAnswer.trim()} onPress={() => setAnswerRevealed(true)} style={[styles.primaryAction, !recallAnswer.trim() && styles.disabledAction]}><Text style={styles.primaryActionText}>Comparar con el material</Text><Ionicons name="eye-outline" size={18} color={colors.surface} /></Pressable>
      </> : <>
        <View style={styles.userAnswerCard}><Text style={styles.userAnswerLabel}>LO QUE ESCRIBISTE</Text><Text style={styles.userAnswerText}>{recallAnswer.trim()}</Text></View>
        <View style={styles.answerCard}><Text style={styles.answerLabel}>RESPUESTA DE REFERENCIA</Text><Text style={styles.answerText}>{activity.answer}</Text><Text style={styles.feedbackText}>{activity.feedback}</Text></View>
        <EvidenceQuote quote={activity.evidence} />
        <Text style={styles.selfCheckPrompt}>¿Pudiste explicarlo sin mirar?</Text>
        <View style={styles.selfCheckRow}>
          <Pressable accessibilityRole="button" onPress={() => rateRecall(true)} style={styles.selfCheckGood}><Ionicons name="checkmark-circle-outline" size={17} color={colors.teal} /><Text style={styles.selfCheckGoodText}>Sí, lo recordé</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => rateRecall(false)} style={styles.selfCheckNeedsReview}><Ionicons name="refresh-outline" size={17} color={colors.primary} /><Text style={styles.selfCheckNeedsText}>Repasarlo</Text></Pressable>
        </View>
      </>}
    </> : <>
      <View style={styles.options}>
        {activity.options.map((option, index) => {
          const isSelected = selectedAnswer === option;
          const isCorrectOption = isSameAnswer(option, activity.answer);
          const resultStyle = checked && isCorrectOption ? styles.optionCorrect : checked && isSelected ? styles.optionWrong : null;
          return <Pressable key={`${index}-${option}`} disabled={checked} accessibilityRole="button" accessibilityState={{selected: isSelected, disabled: checked}} onPress={() => checkChoice(option)} style={[styles.option, isSelected && styles.optionSelected, resultStyle]}>
            <View style={[styles.optionIndex, isSelected && styles.optionIndexSelected, checked && isCorrectOption && styles.optionIndexCorrect]}><Text style={[styles.optionIndexText, isSelected && styles.optionIndexTextSelected, checked && isCorrectOption && styles.optionIndexTextCorrect]}>{String.fromCharCode(65 + index)}</Text></View>
            <Text style={styles.optionText}>{option}</Text>
            {checked && isCorrectOption ? <Ionicons name="checkmark-circle" size={19} color={colors.teal} /> : checked && isSelected ? <Ionicons name="close-circle" size={19} color={colors.danger} /> : null}
          </Pressable>;
        })}
      </View>
      {checked ? <>
        <View style={[styles.feedbackCard, mastered ? styles.feedbackCorrect : styles.feedbackIncorrect]}>
          <Ionicons name={mastered ? 'checkmark-circle' : 'refresh-circle'} size={20} color={mastered ? colors.teal : colors.primary} />
          <View style={styles.feedbackCopy}><Text style={[styles.feedbackTitle, mastered ? styles.goodColor : styles.primaryColor]}>{mastered ? '¡Bien recordado!' : `Respuesta: ${activity.answer}`}</Text><Text style={styles.feedbackText}>{activity.feedback}</Text></View>
        </View>
        <EvidenceQuote quote={activity.evidence} />
        <Pressable accessibilityRole="button" onPress={() => void advance(mastered)} style={styles.primaryAction}><Text style={styles.primaryActionText}>{roundIndex + 1 < rounds.length || !mastered ? 'Continuar' : 'Terminar sesión'}</Text><Ionicons name="arrow-forward" size={18} color={colors.surface} /></Pressable>
      </> : <Text style={styles.hint}>Elige una respuesta para continuar. Si fallas, la volverás a practicar al final.</Text>}
    </>}
  </View>;
}

function EvidenceQuote({quote}: {quote: string}) {
  return <View style={styles.evidence}>
    <Ionicons name="document-text-outline" size={16} color={colors.muted} />
    <Text style={styles.evidenceText}>“{quote}”</Text>
  </View>;
}

const styles = StyleSheet.create({
  card: {backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 16, marginBottom: 14},
  topRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8},
  roundLabel: {flexDirection: 'row', alignItems: 'center', gap: 5},
  roundText: {fontSize: 10, letterSpacing: 0.6, color: colors.primary, fontWeight: '800'},
  xpPill: {flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.amberSoft},
  xpText: {fontSize: 10, color: '#805A0B', fontWeight: '700'},
  progressTrack: {height: 6, overflow: 'hidden', borderRadius: 4, backgroundColor: '#E7EAF0', marginTop: 13},
  progressFill: {height: 6, borderRadius: 4, backgroundColor: colors.primary},
  roundMeta: {flexDirection: 'row', justifyContent: 'space-between', marginTop: 13},
  kindText: {fontSize: 11, color: colors.teal, fontWeight: '700'},
  prompt: {fontSize: 18, lineHeight: 25, color: colors.text, fontWeight: '800', marginTop: 11, marginBottom: 14},
  options: {gap: 8},
  option: {minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface},
  optionSelected: {borderColor: colors.primary, backgroundColor: '#F4F3FF'},
  optionCorrect: {borderColor: colors.teal, backgroundColor: colors.tealSoft},
  optionWrong: {borderColor: colors.danger, backgroundColor: '#FEF3F2'},
  optionIndex: {width: 30, height: 30, borderRadius: 10, backgroundColor: colors.subtle, alignItems: 'center', justifyContent: 'center'},
  optionIndexSelected: {backgroundColor: colors.primary},
  optionIndexCorrect: {backgroundColor: '#C7E8E1'},
  optionIndexText: {fontSize: 12, color: colors.muted, fontWeight: '800'},
  optionIndexTextSelected: {color: colors.surface},
  optionIndexTextCorrect: {color: colors.teal},
  optionText: {flex: 1, fontSize: 14, lineHeight: 20, color: colors.text, fontWeight: '600'},
  hint: {fontSize: 12, lineHeight: 17, color: colors.muted, marginTop: 12},
  feedbackCard: {flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 11, borderRadius: radius.sm, marginTop: 12},
  feedbackCorrect: {backgroundColor: colors.tealSoft},
  feedbackIncorrect: {backgroundColor: '#F0F1FF'},
  feedbackCopy: {flex: 1},
  feedbackTitle: {fontSize: 13, fontWeight: '800', marginBottom: 3},
  feedbackText: {fontSize: 12, lineHeight: 17, color: colors.muted},
  goodColor: {color: colors.teal},
  primaryColor: {color: colors.primary},
  evidence: {flexDirection: 'row', alignItems: 'flex-start', gap: 7, paddingVertical: 11},
  evidenceText: {flex: 1, fontSize: 11, lineHeight: 16, color: colors.muted, fontStyle: 'italic'},
  primaryAction: {minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: radius.sm, backgroundColor: colors.primary, marginTop: 7, paddingHorizontal: 14},
  primaryActionText: {fontSize: 14, color: colors.surface, fontWeight: '800'},
  answerInput: {minHeight: 86, maxHeight: 150, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.background, color: colors.text, fontSize: 14, lineHeight: 20},
  disabledAction: {opacity: 0.45},
  answerCard: {padding: 12, backgroundColor: colors.tealSoft, borderRadius: radius.sm},
  userAnswerCard: {padding: 12, backgroundColor: colors.background, borderRadius: radius.sm, marginBottom: 8},
  userAnswerLabel: {fontSize: 10, letterSpacing: 0.5, color: colors.muted, fontWeight: '800', marginBottom: 6},
  userAnswerText: {fontSize: 13, lineHeight: 19, color: colors.text},
  answerLabel: {fontSize: 10, letterSpacing: 0.5, color: colors.teal, fontWeight: '800', marginBottom: 6},
  answerText: {fontSize: 14, lineHeight: 20, color: colors.text, fontWeight: '700'},
  selfCheckPrompt: {fontSize: 13, color: colors.text, fontWeight: '700', marginTop: 7},
  selfCheckRow: {flexDirection: 'row', gap: 8, marginTop: 9},
  selfCheckGood: {minHeight: 44, flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, borderRadius: radius.sm, backgroundColor: colors.tealSoft},
  selfCheckNeedsReview: {minHeight: 44, flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, borderRadius: radius.sm, backgroundColor: '#F0F1FF'},
  selfCheckGoodText: {fontSize: 11, color: colors.teal, fontWeight: '800'},
  selfCheckNeedsText: {fontSize: 11, color: colors.primary, fontWeight: '800'},
  finishIcon: {width: 44, height: 44, borderRadius: 15, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 11},
  title: {fontSize: 20, color: colors.text, fontWeight: '800'},
  muted: {fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 5},
  finishStats: {flexDirection: 'row', gap: 9, marginTop: 14, marginBottom: 11},
  stat: {flex: 1, padding: 11, borderRadius: radius.sm, backgroundColor: colors.background},
  statValue: {fontSize: 16, color: colors.primary, fontWeight: '800'},
  statLabel: {fontSize: 10, lineHeight: 15, color: colors.muted, marginTop: 3},
  localNote: {flexDirection: 'row', alignItems: 'center', gap: 5},
  localNoteText: {fontSize: 11, color: colors.teal},
  errorText: {fontSize: 11, lineHeight: 16, color: colors.danger},
});
