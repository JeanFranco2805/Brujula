import type {LearningFormat, StudyPreferences} from '../types';

export type StudyTopic = {title: string; explanation: string; questions: string[]};
export type LocalPdfAnalysis = {
  summary: string;
  keyPoints: string[];
  topics: StudyTopic[];
  analysisProvider: 'on-device';
  analyzedAt: string;
};

export type LocalStudySession = {
  id: string;
  materialId: string;
  topicIndex: number;
  title: string;
  date: string;
  startMinute: number;
  durationMinutes: number;
  learningFormat: LearningFormat;
  status: 'planned' | 'completed' | 'skipped';
};

export class LocalPdfAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalPdfAnalysisError';
  }
}

/** Organizes text extracted on the phone. This deliberately makes no network calls. */
export function analyzeLocalStudyText(sourceText: string, now = new Date()): LocalPdfAnalysis {
  const cleanText = normalizePdfText(sourceText);
  const sentences = splitSentences(cleanText);
  const meaningfulWords = cleanText.match(/[\p{L}\p{N}]{2,}/gu) ?? [];
  if (!sentences.length || cleanText.length < 80 || meaningfulWords.length < 5) {
    throw new LocalPdfAnalysisError('No encontramos suficiente texto seleccionable. Si es un PDF escaneado, necesita OCR local.');
  }

  const sectionTopics = topicsFromHeadings(cleanText);
  const topics = (sectionTopics.length >= 2 ? sectionTopics : topicsFromSentences(sentences)).slice(0, 20);
  if (!topics.length) {
    throw new LocalPdfAnalysisError('No pudimos separar temas de este PDF. Comprueba que tenga texto seleccionable.');
  }

  const keyPoints = topics.map(topic => topic.explanation.match(/^[\s\S]*?[.!?](?=\s|$)/u)?.[0]?.trim() ?? topic.explanation)
    .filter(Boolean)
    .slice(0, 12)
    .map(point => point.slice(0, 320));
  const summary = topics.slice(0, 3).map(topic => topic.explanation).join(' ').slice(0, 900);

  return {summary, keyPoints, topics, analysisProvider: 'on-device', analyzedAt: now.toISOString()};
}

/** Creates a weekday plan from local PDF topics and the learner's saved preferences. */
export function generateLocalStudyPlan(
  materialId: string,
  topics: StudyTopic[],
  preferences: StudyPreferences,
  now = new Date(),
  startMinute = 18 * 60,
): LocalStudySession[] {
  if (!materialId || !topics.length) return [];
  const formats = preferences.formats.length ? preferences.formats : ['practice' as const];
  const tasks: {topicIndex: number; review: boolean}[] = topics.map((_, topicIndex) => ({topicIndex, review: false}));
  if (preferences.rhythm === 'spaced') {
    const reviewCount = preferences.goal === 'exam' ? Math.min(5, topics.length) : Math.min(2, topics.length);
    for (let index = 0; index < reviewCount; index += 1) {
      const topicIndex = reviewCount === topics.length
        ? index
        : Math.round(index * (topics.length - 1) / Math.max(1, reviewCount - 1));
      tasks.push({topicIndex, review: true});
    }
  }

  let studyDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let taskIndex = 0;
  const sessions: LocalStudySession[] = [];
  while (taskIndex < tasks.length) {
    studyDay.setDate(studyDay.getDate() + 1);
    if (!isStudyDay(studyDay, preferences.goal)) continue;

    const task = tasks[taskIndex];
    const topic = topics[task.topicIndex];
    const date = formatLocalDate(studyDay);
    const format = task.review && preferences.goal === 'exam' && formats.includes('practice')
      ? 'practice'
      : formats[taskIndex % formats.length];
    sessions.push({
      id: `${materialId}:${date}:${task.topicIndex}:${task.review ? 'review' : 'learn'}`,
      materialId,
      topicIndex: task.topicIndex,
      title: task.review ? `Repaso: ${topic.title}` : topic.title,
      date,
      startMinute,
      durationMinutes: preferences.minutesPerDay,
      learningFormat: format,
      status: 'planned',
    });
    taskIndex += 1;
  }
  return sessions;
}

export function formatLocalDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function normalizePdfText(sourceText: string) {
  return sourceText
    .replace(/\u0000/g, ' ')
    .replace(/([\p{L}\p{N}])-\s*\n\s*([\p{L}\p{N}])/gu, '$1$2')
    .replace(/\f/g, '\n')
    .replace(/^\s*(?:p[aá]gina\s+)?\d+(?:\s+de\s+\d+)?\s*$/gimu, '')
    .replace(/[\t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitSentences(text: string) {
  return (text.match(/[^.!?]+[.!?]+["»')\]]*|[^.!?]+$/gu) ?? [])
    .map(sentence => sentence.replace(/\s+/g, ' ').trim())
    .filter(sentence => sentence.replace(/[^\p{L}\p{N}]/gu, '').length >= 28)
    .slice(0, 180);
}

function topicsFromHeadings(text: string): StudyTopic[] {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  const headings: {index: number; title: string}[] = [];
  lines.forEach((line, index) => {
    if (isHeading(line)) headings.push({index, title: line.replace(/^[\d.\-\s]+/, '').replace(/:$/, '').slice(0, 120)});
  });
  if (headings.length < 2) return [];

  return headings.flatMap((heading, headingIndex) => {
    const end = headings[headingIndex + 1]?.index ?? lines.length;
    const body = lines.slice(heading.index + 1, end).join(' ').replace(/\s+/g, ' ').trim();
    if (body.length < 40) return [];
    return [makeTopic(heading.title, body)];
  });
}

function isHeading(line: string) {
  const words = line.split(/\s+/u);
  if (line.length < 4 || line.length > 100 || words.length > 14 || /[.!?]$/.test(line)) return false;
  return /^(?:(?:unidad|cap[ií]tulo|tema|lecci[oó]n|secci[oó]n|m[oó]dulo|chapter|unit|section)\s+|\d+(?:\.\d+)*[.)]?\s+)/iu.test(line)
    || (/[\p{L}]/u.test(line) && line === line.toUpperCase());
}

function topicsFromSentences(sentences: string[]): StudyTopic[] {
  const topics: StudyTopic[] = [];
  for (let index = 0; index < sentences.length && topics.length < 20; index += 3) {
    const group = sentences.slice(index, index + 3);
    const explanation = group.join(' ').slice(0, 1500);
    const title = group[0].replace(/^[\d.\-\s]+/, '').split(/\s+/u).slice(0, 8).join(' ').replace(/[,:;]$/, '');
    if (explanation.length >= 40) topics.push(makeTopic(title || `Tema ${topics.length + 1}`, explanation));
  }
  return topics;
}

function makeTopic(title: string, explanation: string): StudyTopic {
  const cleanTitle = title.trim() || 'Tema de estudio';
  return {
    title: cleanTitle,
    explanation: explanation.slice(0, 1500),
    questions: [
      `Explica con tus propias palabras la idea principal de “${cleanTitle}”.`,
      `¿Qué ejemplo puedes relacionar con “${cleanTitle}”?`,
    ],
  };
}

function isStudyDay(date: Date, goal: StudyPreferences['goal']) {
  const day = date.getDay();
  if (day === 0 || day === 6) return false;
  return goal !== 'habit' || day === 1 || day === 3 || day === 5;
}
