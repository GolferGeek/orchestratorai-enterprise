import fs from 'fs';
import path from 'path';

// Banned strings indicating direct provider usage
const BANNED_PATTERNS: RegExp[] = [
  /\bfrom\s+['"]openai['"];?/,
  /\bimport\s+.*from\s+['"]openai['"];?/,
  /['"]@langchain\/openai['"]/,
  /['"]@langchain\/anthropic['"]/,
  /['"]@anthropic-ai\/sdk['"]/,
  /https?:\/\/api\.openai\.com/,
  /https?:\/\/api\.anthropic\.com/,
];

// Allowed locations where provider-specific code is centralized
const ALLOW_LIST = [
  path.normalize('apps/api/src/llms/'),
  path.normalize('apps/api/src/langchain/'),
  path.normalize('apps/api/src/supabase/utils/langchain-client.ts'),
];

function isAllowed(filePath: string): boolean {
  const normalized = filePath.split(path.sep).join(path.sep);
  return (
    ALLOW_LIST.some((allowed) => normalized.includes(allowed)) ||
    /\.spec\.[tj]s$/.test(normalized) ||
    normalized.includes(path.normalize('apps/api/test/'))
  );
}

function* walk(dir: string): Generator<string> {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      yield full;
    }
  }
}

describe('No direct provider usage in agents/base services', () => {
  it('should not import provider SDKs or call provider endpoints outside centralized modules', () => {
    const srcRoot = path.resolve(process.cwd(), 'apps/api/src');
    const offenders: Array<{ file: string; pattern: string }> = [];

    for (const file of walk(srcRoot)) {
      if (isAllowed(file)) continue;
      const content = fs.readFileSync(file, 'utf8');
      for (const pattern of BANNED_PATTERNS) {
        if (pattern.test(content)) {
          offenders.push({ file, pattern: pattern.source });
        }
      }
    }

    if (offenders.length) {
      const details = offenders
        .map((o) => `- ${path.relative(process.cwd(), o.file)} matched /${o.pattern}/`)
        .join('\n');
      fail(
        `Direct provider usage detected outside centralized modules. Please route via the LLM service.\n${details}`,
      );
    }
  });
});


