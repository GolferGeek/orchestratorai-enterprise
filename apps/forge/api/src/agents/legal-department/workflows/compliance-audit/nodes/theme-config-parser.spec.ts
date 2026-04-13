import {
  parseThemeFile,
  parseThemeConfigs,
  listFrameworkThemes,
} from './theme-config-parser';

describe('ThemeConfigParser', () => {
  const sampleThemeContent = `# GDPR Compliance Themes

## Theme: Data Lawfulness and Consent
Articles: 5, 6, 7
Questions:
- Does the organization document the legal basis for each data processing activity?
- Is consent obtained through clear, affirmative action?
- Can data subjects withdraw consent as easily as they gave it?

## Theme: Data Subject Rights
Articles: 12-22
Questions:
- Is there a documented process for handling access requests?
- Can the organization rectify inaccurate personal data upon request?
`;

  describe('parseThemeFile', () => {
    it('parses themes from markdown content', () => {
      const themes = parseThemeFile(sampleThemeContent);
      expect(themes).toHaveLength(2);
    });

    it('extracts theme name correctly', () => {
      const themes = parseThemeFile(sampleThemeContent);
      expect(themes[0]!.themeName).toBe('Data Lawfulness and Consent');
      expect(themes[1]!.themeName).toBe('Data Subject Rights');
    });

    it('generates slugified themeId', () => {
      const themes = parseThemeFile(sampleThemeContent);
      expect(themes[0]!.themeId).toBe('data-lawfulness-and-consent');
      expect(themes[1]!.themeId).toBe('data-subject-rights');
    });

    it('extracts articles reference', () => {
      const themes = parseThemeFile(sampleThemeContent);
      expect(themes[0]!.articles).toBe('5, 6, 7');
      expect(themes[1]!.articles).toBe('12-22');
    });

    it('extracts questions with unique IDs', () => {
      const themes = parseThemeFile(sampleThemeContent);
      expect(themes[0]!.questions).toHaveLength(3);
      expect(themes[1]!.questions).toHaveLength(2);

      // Each question has a unique ID
      const allIds = themes.flatMap((t) =>
        t.questions.map((q) => q.questionId),
      );
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(allIds.length);
    });

    it('extracts question text without bullet prefix', () => {
      const themes = parseThemeFile(sampleThemeContent);
      expect(themes[0]!.questions[0]!.questionText).toBe(
        'Does the organization document the legal basis for each data processing activity?',
      );
    });

    it('returns empty array for content with no themes', () => {
      const themes = parseThemeFile('# Just a header\nSome text');
      expect(themes).toEqual([]);
    });

    it('skips themes with no questions', () => {
      const content = `# Test
## Theme: Empty Theme
Articles: 1
No questions here
`;
      const themes = parseThemeFile(content);
      expect(themes).toEqual([]);
    });
  });

  describe('parseThemeConfigs', () => {
    it('returns entries for valid frameworks', () => {
      const entries = parseThemeConfigs(['gdpr']);
      expect(entries.length).toBeGreaterThan(0);
      expect(entries[0]!.type).toBe('theme-question');
      expect(entries[0]!.frameworkSlug).toBe('gdpr');
    });

    it('returns entries for multiple frameworks', () => {
      const entries = parseThemeConfigs(['gdpr', 'hipaa']);
      const gdprEntries = entries.filter((e) => e.frameworkSlug === 'gdpr');
      const hipaaEntries = entries.filter((e) => e.frameworkSlug === 'hipaa');
      expect(gdprEntries.length).toBeGreaterThan(0);
      expect(hipaaEntries.length).toBeGreaterThan(0);
    });

    it('returns empty for unknown framework', () => {
      const entries = parseThemeConfigs(['unknown-framework']);
      expect(entries).toEqual([]);
    });

    it('filters by selectedThemes when provided', () => {
      const allEntries = parseThemeConfigs(['gdpr']);
      const filteredEntries = parseThemeConfigs(
        ['gdpr'],
        ['data-lawfulness-and-consent'],
      );

      expect(filteredEntries.length).toBeGreaterThan(0);
      expect(filteredEntries.length).toBeLessThan(allEntries.length);
      expect(
        filteredEntries.every(
          (e) => e.themeId === 'data-lawfulness-and-consent',
        ),
      ).toBe(true);
    });

    it('returns empty when selectedThemes has no matches', () => {
      const entries = parseThemeConfigs(['gdpr'], ['nonexistent-theme']);
      expect(entries).toEqual([]);
    });

    it('includes all required fields on each entry', () => {
      const entries = parseThemeConfigs(['sox']);
      expect(entries.length).toBeGreaterThan(0);
      const entry = entries[0]!;
      expect(entry.type).toBe('theme-question');
      expect(entry.frameworkSlug).toBe('sox');
      expect(entry.themeId).toBeTruthy();
      expect(entry.themeName).toBeTruthy();
      expect(entry.questionId).toBeTruthy();
      expect(entry.questionText).toBeTruthy();
    });
  });

  describe('listFrameworkThemes', () => {
    it('returns themes for gdpr', () => {
      const themes = listFrameworkThemes('gdpr');
      expect(themes.length).toBeGreaterThanOrEqual(14);
      expect(themes[0]!.themeId).toBeTruthy();
      expect(themes[0]!.themeName).toBeTruthy();
      expect(themes[0]!.questionCount).toBeGreaterThan(0);
    });

    it('returns themes for hipaa', () => {
      const themes = listFrameworkThemes('hipaa');
      expect(themes.length).toBeGreaterThanOrEqual(14);
    });

    it('returns themes for sox', () => {
      const themes = listFrameworkThemes('sox');
      expect(themes.length).toBeGreaterThanOrEqual(14);
    });

    it('returns empty for unknown framework', () => {
      const themes = listFrameworkThemes('unknown');
      expect(themes).toEqual([]);
    });
  });
});
