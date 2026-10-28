const languageNames: Record<string, string> = {
  ar: 'árabe',
  de: 'alemán',
  en: 'inglés',
  es: 'español',
  fa: 'persa',
  fr: 'francés',
  hi: 'hindi',
  id: 'indonesio',
  it: 'italiano',
  ja: 'japonés',
  ko: 'coreano',
  nl: 'neerlandés',
  pl: 'polaco',
  pt: 'portugués',
  ru: 'ruso',
  th: 'tailandés',
  tr: 'turco',
  uk: 'ucraniano',
  vi: 'vietnamita',
  zh: 'chino',
};

/** Formats a native language tag for the local model without making a network request. */
export function getLearningLanguageName(languageTag: string) {
  const normalizedTag = languageTag.trim().replace(/_/g, '-');
  const languageCode = normalizedTag.split('-')[0]?.toLocaleLowerCase() || 'es';
  const name = languageNames[languageCode] ?? languageCode;
  return `${name} (${normalizedTag || 'es-CO'})`;
}

/** Short label for learner-facing interface copy. */
export function getLearningLanguageLabel(languageTag: string) {
  const languageCode = languageTag.trim().replace(/_/g, '-').split('-')[0]?.toLocaleLowerCase() || 'es';
  return languageNames[languageCode] ?? languageCode;
}
