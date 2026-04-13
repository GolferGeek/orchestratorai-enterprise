/**
 * Regulatory Compliance Audit — Theme Config Parser.
 *
 * Reads theme markdown files from the themes/ directory, parses them into
 * EvaluationQueueEntry[] items of type 'theme-question'. Handles framework
 * selection (only parse configs for selected frameworks) and theme filtering
 * (respect selectedThemes in auditContext).
 *
 * Theme file format:
 *   # {Framework} Compliance Themes
 *   ## Theme: {Theme Name}
 *   Articles: {refs}
 *   Questions:
 *   - {question text}
 *
 * See: docs/efforts/current/regulatory-compliance-audit/prd.md §4.5.2
 */
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { ThemeQuestionEntry } from '../compliance-audit.types';

export interface ParsedTheme {
  themeId: string;
  themeName: string;
  articles: string;
  questions: Array<{
    questionId: string;
    questionText: string;
  }>;
}

const FRAMEWORK_FILE_MAP: Record<string, string> = {
  gdpr: 'gdpr.themes.md',
  hipaa: 'hipaa.themes.md',
  sox: 'sox.themes.md',
};

/**
 * Slugify a theme name for use as themeId.
 * "Data Lawfulness and Consent" → "data-lawfulness-and-consent"
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Parse a single theme markdown file into structured themes.
 */
export function parseThemeFile(content: string): ParsedTheme[] {
  const themes: ParsedTheme[] = [];
  const themeBlocks = content.split(/^## Theme:\s*/m).filter((b) => b.trim());

  for (const block of themeBlocks) {
    const lines = block.split('\n');
    const themeName = lines[0]?.trim();
    if (!themeName) continue;

    // Skip the file header (first block starts with "# ...")
    if (themeName.startsWith('#')) continue;

    const themeId = slugify(themeName);
    let articles = '';
    const questions: ParsedTheme['questions'] = [];

    let inQuestions = false;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]!;

      if (
        line.startsWith('Articles:') ||
        line.startsWith('Sections:') ||
        line.startsWith('Rules:')
      ) {
        articles = line.split(':').slice(1).join(':').trim();
        continue;
      }

      if (line.startsWith('Questions:')) {
        inQuestions = true;
        continue;
      }

      if (inQuestions && line.startsWith('- ')) {
        const questionText = line.slice(2).trim();
        if (questionText) {
          questions.push({
            questionId: uuidv4(),
            questionText,
          });
        }
      }
    }

    if (questions.length > 0) {
      themes.push({ themeId, themeName, articles, questions });
    }
  }

  return themes;
}

/**
 * Parse theme configs for selected frameworks and return EvaluationQueueEntry[] items.
 *
 * @param frameworkSlugs - Which frameworks to parse (e.g., ['gdpr', 'hipaa'])
 * @param selectedThemes - Optional filter: only include these theme IDs. If undefined/empty, include all.
 * @returns Array of ThemeQuestionEntry items ready for the evaluation queue
 */
export function parseThemeConfigs(
  frameworkSlugs: string[],
  selectedThemes?: string[],
): ThemeQuestionEntry[] {
  const entries: ThemeQuestionEntry[] = [];
  const themesDir = path.join(
    process.cwd(),
    'src/agents/legal-department/workflows/compliance-audit/themes',
  );

  for (const frameworkSlug of frameworkSlugs) {
    const filename = FRAMEWORK_FILE_MAP[frameworkSlug];
    if (!filename) continue;

    const filePath = path.join(themesDir, filename);
    if (!fs.existsSync(filePath)) continue;

    const content = fs.readFileSync(filePath, 'utf-8');
    const themes = parseThemeFile(content);

    for (const theme of themes) {
      // Apply theme filter if specified
      if (
        selectedThemes &&
        selectedThemes.length > 0 &&
        !selectedThemes.includes(theme.themeId)
      ) {
        continue;
      }

      for (const question of theme.questions) {
        entries.push({
          type: 'theme-question',
          frameworkSlug,
          themeId: theme.themeId,
          themeName: theme.themeName,
          questionId: question.questionId,
          questionText: question.questionText,
        });
      }
    }
  }

  return entries;
}

/**
 * List all available themes for a given framework.
 * Used by the frontend to display theme selection in Full Audit mode.
 */
export function listFrameworkThemes(
  frameworkSlug: string,
): Array<{ themeId: string; themeName: string; questionCount: number }> {
  const filename = FRAMEWORK_FILE_MAP[frameworkSlug];
  if (!filename) return [];

  const themesDir = path.join(
    process.cwd(),
    'src/agents/legal-department/workflows/compliance-audit/themes',
  );
  const filePath = path.join(themesDir, filename);
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, 'utf-8');
  const themes = parseThemeFile(content);

  return themes.map((t) => ({
    themeId: t.themeId,
    themeName: t.themeName,
    questionCount: t.questions.length,
  }));
}
