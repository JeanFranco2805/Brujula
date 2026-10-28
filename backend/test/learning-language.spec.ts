import {getLearningLanguageLabel, getLearningLanguageName} from '../../src/services/learning-language';

describe('native learning language', () => {
  it('turns common device language tags into explicit local-model targets', () => {
    expect(getLearningLanguageName('es-CO')).toBe('español (es-CO)');
    expect(getLearningLanguageName('en-US')).toBe('inglés (en-US)');
    expect(getLearningLanguageName('pt_BR')).toBe('portugués (pt-BR)');
  });

  it('keeps a valid BCP-47 tag for languages outside the display-name list', () => {
    expect(getLearningLanguageName('ca-ES')).toBe('ca (ca-ES)');
  });

  it('provides a short interface label without the locale suffix', () => {
    expect(getLearningLanguageLabel('es-CO')).toBe('español');
    expect(getLearningLanguageLabel('pt_BR')).toBe('portugués');
    expect(getLearningLanguageLabel('ca-ES')).toBe('ca');
  });
});
