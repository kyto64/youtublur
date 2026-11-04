// Page logic of docs/uninstall/survey.js (language resolution, form body).
const { normalizeLang, resolveLang, buildBody, sanitizeVersion, STRINGS, SUPPORTED } =
  require('./docs/uninstall/survey.js');

describe('docs/uninstall/survey.js', () => {
  test('every language defines every string', () => {
    const keys = Object.keys(STRINGS.en).sort();
    expect(SUPPORTED).toHaveLength(8);
    for (const lang of SUPPORTED) expect(Object.keys(STRINGS[lang]).sort()).toEqual(keys);
  });

  test('?lang= wins, then navigator, then en', () => {
    expect(resolveLang('?lang=ko', { languages: ['ja'], language: 'ja' })).toBe('ko');
    expect(resolveLang('?lang=xx', { languages: ['fr', 'pt-BR'], language: 'fr' })).toBe('pt_BR');
    expect(resolveLang('', { language: 'zh-Hant' })).toBe('zh_TW');
    expect(resolveLang('', { languages: ['fr'], language: 'fr' })).toBe('en');
    expect(resolveLang('', undefined)).toBe('en');
    expect(normalizeLang('zh_CN')).toBe('zh_CN');
  });

  test('buildBody maps the four Google Form fields and caps the comment', () => {
    const body = buildBody({ reason: 'slow', comment: 'x'.repeat(1500), version: '1.2.3', lang: 'ja' });
    expect(body.get('entry.333345560')).toBe('slow');
    expect(body.get('entry.2058122616')).toHaveLength(1000);
    expect(body.get('entry.1160209855')).toBe('1.2.3');
    expect(body.get('entry.61505378')).toBe('ja');
  });

  test('sanitizeVersion only accepts version-like strings', () => {
    expect(sanitizeVersion('1.12.39')).toBe('1.12.39');
    expect(sanitizeVersion('<script>')).toBe('');
    expect(sanitizeVersion(null)).toBe('');
  });
});
