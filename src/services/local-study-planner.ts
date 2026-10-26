import type {LearningFormat, StudyPreferences} from '../types';

const titleVerbs = new Set([
  'es', 'son', 'fue', 'fueron', 'está', 'están', 'estaba', 'estaban', 'será', 'serán',
  'tiene', 'tienen', 'tenía', 'contiene', 'contienen', 'incluye', 'incluyen', 'consiste',
  'permite', 'permiten', 'produce', 'producen', 'transforma', 'transforman', 'convierte',
  'convierten', 'ocurre', 'ocurren', 'define', 'definen', 'llama', 'llaman', 'representa',
  'representan', 'significa', 'significan', 'utiliza', 'utilizan', 'realiza', 'realizan',
  'forma', 'forman', 'genera', 'generan', 'puede', 'pueden', 'debe', 'deben', 'sirve',
  'sirven', 'provoca', 'provocan', 'desarrolla', 'desarrollan', 'estudia', 'analiza',
]);

export type StudyTopic = {title: string; explanation: string; questions: string[]};
export type LocalPdfAnalysis = {
  summary: string;
  keyPoints: string[];
  topics: StudyTopic[];
  extractedCharacters?: number;
  extractedWords?: number;
  pageCount?: number;
  warnings?: string[];
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
  /** 'reminder' entries are personal agenda items and do not open a PDF lesson. */
  source?: 'material' | 'reminder';
  reminderEnabled?: boolean;
  reminderMinutesBefore?: number;
};

export class LocalPdfAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalPdfAnalysisError';
  }
}

/** Organizes text extracted on the phone. This deliberately makes no network calls. */
export function analyzeLocalStudyText(sourceText: string, now = new Date(), pageCount?: number): LocalPdfAnalysis {
  const cleanText = normalizePdfText(sourceText);
  const sentences = splitSentences(cleanText);
  const meaningfulWords = cleanText.match(/[\p{L}\p{N}]{2,}/gu) ?? [];
  if (!sentences.length || cleanText.length < 80 || meaningfulWords.length < 5) {
    throw new LocalPdfAnalysisError('No encontramos suficiente texto seleccionable. Si es un PDF escaneado, necesita OCR local.');
  }

  const sectionTopics = topicsFromHeadings(cleanText);
  const topics = sectionTopics.length >= 2 ? sectionTopics : topicsFromSentences(sentences);
  if (!topics.length) {
    throw new LocalPdfAnalysisError('No pudimos separar temas de este PDF. Comprueba que tenga texto seleccionable.');
  }

  const keyPoints = topics.map(topic => splitSentences(topic.explanation)[0] ?? topic.explanation)
    .filter(Boolean)
    .slice(0, 12)
    .map(point => point.slice(0, 320));
  const summary = topics.slice(0, 3).map(topic => topic.explanation).join(' ').slice(0, 900);
  const warnings = pageCount && cleanText.length / pageCount < 160
    ? ['Se encontró poco texto seleccionable por página. Algunas páginas podrían ser escaneos o imágenes y no se pudieron leer.']
    : [];

  return {
    summary,
    keyPoints,
    topics,
    extractedCharacters: cleanText.length,
    extractedWords: meaningfulWords.length,
    ...(pageCount ? {pageCount} : {}),
    warnings,
    analysisProvider: 'on-device',
    analyzedAt: now.toISOString(),
  };
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
  let reviewCount = 0;
  let reviewIntervalDays = 0;
  if (preferences.rhythm === 'spaced') {
    reviewCount = preferences.goal === 'exam' ? Math.min(5, topics.length) : Math.min(2, topics.length);
    reviewIntervalDays = preferences.goal === 'exam' ? 2 : 4;
  }

  const reviewTopics = new Set<number>();
  for (let index = 0; index < reviewCount; index += 1) {
    const topicIndex = reviewCount === topics.length
      ? index
      : Math.round(index * (topics.length - 1) / Math.max(1, reviewCount - 1));
    reviewTopics.add(topicIndex);
  }

  const tasks: {topicIndex: number; review: boolean; date: Date}[] = [];
  const pendingReviews: {topicIndex: number; date: Date}[] = [];
  let topicIndex = 0;
  let studyDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  studyDate = nextStudyDate(studyDate, preferences.goal, 1);
  while (topicIndex < topics.length || pendingReviews.length) {
    const dueReviewIndex = pendingReviews.findIndex(review => review.date <= studyDate);
    if (dueReviewIndex >= 0) {
      const [review] = pendingReviews.splice(dueReviewIndex, 1);
      tasks.push({topicIndex: review.topicIndex, review: true, date: studyDate});
    } else if (topicIndex < topics.length) {
      const currentTopicIndex = topicIndex;
      tasks.push({topicIndex: currentTopicIndex, review: false, date: studyDate});
      topicIndex += 1;
      if (reviewTopics.has(currentTopicIndex)) {
        pendingReviews.push({topicIndex: currentTopicIndex, date: nextStudyDate(studyDate, preferences.goal, reviewIntervalDays)});
        pendingReviews.sort((left, right) => left.date.getTime() - right.date.getTime());
      }
    } else if (pendingReviews.length) {
      studyDate = pendingReviews[0].date;
      continue;
    }
    studyDate = nextStudyDate(studyDate, preferences.goal, 1);
  }

  const sessions = tasks.map((task, taskIndex): LocalStudySession => {
    const topic = topics[task.topicIndex];
    const format = task.review && preferences.goal === 'exam' && formats.includes('practice')
      ? 'practice'
      : formats[taskIndex % formats.length];
    const date = formatLocalDate(task.date);
    return {
      id: `${materialId}:${date}:${task.topicIndex}:${task.review ? 'review' : 'learn'}`,
      materialId,
      topicIndex: task.topicIndex,
      title: task.review ? `Repaso: ${topic.title}` : topic.title,
      date,
      startMinute,
      durationMinutes: preferences.minutesPerDay,
      learningFormat: format,
      status: 'planned',
      source: 'material',
      reminderEnabled: true,
      reminderMinutesBefore: 10,
    };
  });
  return sessions.sort((left, right) => left.date.localeCompare(right.date) || left.startMinute - right.startMinute || left.id.localeCompare(right.id));
}

export function formatLocalDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function normalizePdfText(sourceText: string) {
  return sourceText
    .normalize('NFKC')
    .replace(/[\u00ad\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/[\uFB00-\uFB06]/g, ligature => ({'ﬀ': 'ff', 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬃ': 'ffi', 'ﬄ': 'ffl', 'ﬅ': 'st', 'ﬆ': 'st'}[ligature] ?? ligature))
    .replace(/\u0000/g, ' ')
    .replace(/([\p{L}\p{N}])-\s*\n\s*([\p{L}\p{N}])/gu, '$1$2')
    .replace(/\f/g, '\n\n')
    .replace(/^\s*(?:(?:p[aá]gina|page)\s+)?\d+(?:\s+(?:de|of)\s+\d+)?\s*$/gimu, '')
    .replace(/[\t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitSentences(text: string) {
  return (text.match(/[^.!?]+[.!?]+["»')\]]*|[^.!?]+$/gu) ?? [])
    .map(sentence => sentence.replace(/\s+/g, ' ').trim())
    .filter(sentence => sentence.replace(/[^\p{L}\p{N}]/gu, '').length >= 12);
}

function topicsFromHeadings(text: string): StudyTopic[] {
  const lines = text.split('\n').map(line => line.trim());
  const headings: {index: number; title: string}[] = [];
  lines.forEach((line, index) => {
    if (!line) return;
    const previous = previousNonEmptyLine(lines, index);
    const next = nextNonEmptyLine(lines, index);
    if (isHeading(line, previous, next)) headings.push({index, title: line.replace(/^[\d.\-\s]+/, '').replace(/:$/, '').slice(0, 120)});
  });
  if (headings.length < 2) return [];

  return headings.flatMap((heading, headingIndex) => {
    const end = headings[headingIndex + 1]?.index ?? lines.length;
    const body = lines.slice(heading.index + 1, end).join(' ').replace(/\s+/g, ' ').trim();
    if ((body.match(/[\p{L}\p{N}]/gu) ?? []).length < 12) return [];
    return splitTextIntoTopics(body, heading.title);
  });
}

function isHeading(line: string, previous: string, next: string) {
  const words = line.split(/\s+/u);
  if (line.length < 4 || line.length > 100 || words.length > 14 || /[.!?]$/.test(line)) return false;
  if (/^(?:(?:unidad|cap[ií]tulo|tema|lecci[oó]n|secci[oó]n|m[oó]dulo|chapter|unit|section)\s+)/iu.test(line)) return true;
  const numbered = line.match(/^(\d+(?:\.\d+)*[.)]?)\s+(.+)$/u);
  if (numbered) {
    const label = numbered[2].trim();
    return label.length <= 72 && label.split(/\s+/u).length <= 9 && !/[,;!?]/u.test(label);
  }
  if (/[\p{L}]/u.test(line) && line === line.toLocaleUpperCase()) return true;

  // Plain headings lose font size and bold metadata during text extraction.
  // Accept title case only when surrounding lines indicate a section boundary.
  const hasSentencePunctuation = /[.!?;,:]/u.test(line);
  const previousEndsBlock = !previous || /[.!?]$/.test(previous);
  const nextLooksLikeBody = next.length >= Math.max(45, line.length * 1.25) && /^\p{Lu}/u.test(next);
  return !hasSentencePunctuation && words.length <= 8 && line.length <= 68
    && /^\p{Lu}/u.test(line) && previousEndsBlock && nextLooksLikeBody;
}

function topicsFromSentences(sentences: string[]): StudyTopic[] {
  const topics: StudyTopic[] = [];
  let group: string[] = [];
  let groupLength = 0;
  const appendGroup = () => {
    if (!group.length) return;
    const explanation = group.join(' ');
    const title = titleFromSentence(group[0]);
    topics.push(makeTopic(title || `Tema ${topics.length + 1}`, explanation));
    group = [];
    groupLength = 0;
  };

  for (const sentence of sentences.flatMap(splitOversizedText)) {
    if (group.length && groupLength + sentence.length > 1100) appendGroup();
    group.push(sentence);
    groupLength += sentence.length;
  }
  appendGroup();
  return topics;
}

function titleFromSentence(sentence: string) {
  const words = sentence.match(/[\p{L}\p{N}]+/gu) ?? [];
  const firstVerb = words.findIndex((word, index) => index > 0 && titleVerbs.has(word.toLocaleLowerCase()));
  const length = firstVerb > 0 ? firstVerb : Math.min(6, words.length);
  return words.slice(0, Math.min(6, Math.max(2, length))).join(' ').replace(/[,:;]$/, '');
}

function splitOversizedText(text: string) {
  const maxLength = 1500;
  if (text.length <= maxLength) return [text];
  const chunks: string[] = [];
  let chunk = '';
  for (const word of text.match(/\S+\s*/gu) ?? [text]) {
    if (chunk && chunk.length + word.length > maxLength) {
      chunks.push(chunk.trim());
      chunk = '';
    }
    chunk += word;
  }
  if (chunk.trim()) chunks.push(chunk.trim());
  return chunks;
}

function splitTextIntoTopics(text: string, heading: string): StudyTopic[] {
  const sentences = splitSentences(text);
  const parts = topicsFromSentences(sentences.length ? sentences : [text]);
  if (parts.length <= 1) return [makeTopic(heading, text)];
  return parts.map((part, index) => ({
    ...part,
    title: heading + ' · parte ' + (index + 1),
    questions: makeTopic(heading, part.explanation).questions,
  }));
}

function previousNonEmptyLine(lines: string[], index: number) {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) if (lines[cursor]) return lines[cursor];
  return '';
}

function nextNonEmptyLine(lines: string[], index: number) {
  for (let cursor = index + 1; cursor < lines.length; cursor += 1) if (lines[cursor]) return lines[cursor];
  return '';
}

function makeTopic(title: string, explanation: string): StudyTopic {
  const cleanTitle = title.trim() || 'Tema de estudio';
  const displayTitle = cleanTitle.replace(/^(?:(?:unidad|cap[ií]tulo|tema|lecci[oó]n|secci[oó]n|m[oó]dulo|chapter|unit|section)\s+\d+(?:\.\d+)*\s*[:.)-]?\s*)/iu, '').trim() || cleanTitle;
  const firstSentence = splitSentences(explanation)[0] ?? explanation;
  const secondSentence = splitSentences(explanation)[1] ?? firstSentence;
  const titleExercise = blankTerm(firstSentence, displayTitle);
  const detailExercise = blankInformativeTerm(secondSentence, displayTitle);
  return {
    title: cleanTitle,
    explanation,
    questions: [
      titleExercise ? `Completa sin mirar el PDF: ${titleExercise}` : `Explica con tus propias palabras la idea principal de “${displayTitle}”.`,
      detailExercise ? `Recuerda este detalle del material: ${detailExercise}` : `¿Qué ejemplo puedes relacionar con “${displayTitle}”?`,
    ],
  };
}

function blankTerm(sentence: string, term: string) {
  const index = sentence.toLocaleLowerCase().indexOf(term.toLocaleLowerCase());
  if (index < 0 || term.length < 4) return null;
  return `${sentence.slice(0, index)}_____ ${sentence.slice(index + term.length)}`.replace(/\s{2,}/g, ' ').trim();
}

function blankInformativeTerm(sentence: string, excludedPhrase: string) {
  const excluded = excludedPhrase.toLocaleLowerCase();
  const words = (sentence.match(/[\p{L}]{6,}/gu) ?? [])
    .filter(word => !excluded.includes(word.toLocaleLowerCase()))
    .sort((left, right) => right.length - left.length);
  for (const word of words) {
    const index = sentence.toLocaleLowerCase().indexOf(word.toLocaleLowerCase());
    if (index >= 0) return `${sentence.slice(0, index)}_____ ${sentence.slice(index + word.length)}`.replace(/\s{2,}/g, ' ').trim();
  }
  return null;
}

function isStudyDay(date: Date, goal: StudyPreferences['goal']) {
  const day = date.getDay();
  if (day === 0 || day === 6) return false;
  return goal !== 'habit' || day === 1 || day === 3 || day === 5;
}

function nextStudyDate(after: Date, goal: StudyPreferences['goal'], minimumDays: number) {
  const date = new Date(after.getFullYear(), after.getMonth(), after.getDate());
  date.setDate(date.getDate() + minimumDays);
  while (!isStudyDay(date, goal)) date.setDate(date.getDate() + 1);
  return date;
}
