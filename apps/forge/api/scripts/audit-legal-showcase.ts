import * as fs from 'node:fs';
import * as path from 'node:path';

type WorkflowAuditTarget = {
  capabilitySlug: string;
  workflowDir: string;
};

type WorkflowAuditResult = {
  capabilitySlug: string;
  briefExists: boolean;
  briefRegistered: boolean;
  webReferenced: boolean;
  titlePresent: boolean;
  videoPresent: boolean;
  sectionBenefits: boolean;
  sectionFeatures: boolean;
  sectionWhenToUse: boolean;
  sectionHowItWorks: boolean;
  customPresentationExists: boolean;
  customPresentationRegistered: boolean;
};

const WORKFLOWS: WorkflowAuditTarget[] = [
  { capabilitySlug: 'document-onboarding', workflowDir: 'document-onboarding' },
  { capabilitySlug: 'contract-review', workflowDir: 'contract-review' },
  { capabilitySlug: 'legal-research', workflowDir: 'legal-research' },
  { capabilitySlug: 'due-diligence', workflowDir: 'due-diligence' },
  { capabilitySlug: 'adversarial-brief', workflowDir: 'adversarial-brief' },
  { capabilitySlug: 'discovery-review', workflowDir: 'discovery-review' },
  { capabilitySlug: 'compliance-audit', workflowDir: 'compliance-audit' },
  { capabilitySlug: 'sentinel', workflowDir: 'sentinel' },
  {
    capabilitySlug: 'monte-carlo-trial-simulator',
    workflowDir: 'monte-carlo-trial-simulator',
  },
  {
    capabilitySlug: 'persistent-case-team',
    workflowDir: 'persistent-case-team',
  },
  { capabilitySlug: 'deal-memo', workflowDir: 'deal-memo' },
  { capabilitySlug: 'deposition-prep', workflowDir: 'deposition-prep' },
  {
    capabilitySlug: 'cross-exam-simulation',
    workflowDir: 'cross-exam-simulation',
  },
];

const strictVideo = process.argv.includes('--strict-video');

const apiRoot = process.cwd();
const repoRoot = path.resolve(apiRoot, '..', '..', '..');
const controllerPath = path.join(
  apiRoot,
  'src/agent-registry/agent-registry.controller.ts',
);
const workflowRoot = path.join(
  apiRoot,
  'src/agents/legal-department/workflows',
);
const legalWebRoot = path.join(
  repoRoot,
  'apps/forge/web/src/views/agents/legal-department',
);

function readText(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

function walkFiles(rootDir: string, exts: Set<string>): string[] {
  const results: string[] = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (exts.has(path.extname(entry.name))) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

function parseFrontmatter(raw: string): { title: string; video: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n*/);
  const frontmatterBlock = match?.[1];
  if (!frontmatterBlock) return { title: '', video: '' };

  let title = '';
  let video = '';
  for (const line of frontmatterBlock.split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();
    if (key === 'title') title = value;
    if (key === 'video') video = value;
  }
  return { title, video };
}

function hasHeading(raw: string, heading: string): boolean {
  return raw.includes(`## ${heading}`);
}

function boolMark(value: boolean): string {
  return value ? 'yes' : 'no';
}

function auditWorkflow(
  target: WorkflowAuditTarget,
  controllerSource: string,
  webSources: string[],
): WorkflowAuditResult {
  const workflowDir = path.join(workflowRoot, target.workflowDir);
  const briefPath = path.join(workflowDir, 'brief.md');
  const briefExists = fs.existsSync(briefPath);
  const briefRaw = briefExists ? readText(briefPath) : '';
  const frontmatter = briefExists ? parseFrontmatter(briefRaw) : { title: '', video: '' };

  const briefRegistered = controllerSource.includes(`'${target.capabilitySlug}': path.join(`)
    || controllerSource.includes(`${target.capabilitySlug}: path.join(`);
  const webReferenced = webSources.some((source) =>
    source.includes(target.capabilitySlug),
  );
  const customPresentationExists = fs.existsSync(
    path.join(workflowDir, `${target.workflowDir}.presentation.ts`),
  );
  const customPresentationRegistered = controllerSource.includes(
    `'legal-department/${target.capabilitySlug}'`,
  );

  return {
    capabilitySlug: target.capabilitySlug,
    briefExists,
    briefRegistered,
    webReferenced,
    titlePresent: frontmatter.title.length > 0,
    videoPresent: frontmatter.video.length > 0,
    sectionBenefits: hasHeading(briefRaw, 'Benefits'),
    sectionFeatures: hasHeading(briefRaw, 'Features'),
    sectionWhenToUse: hasHeading(briefRaw, 'When to use it'),
    sectionHowItWorks: hasHeading(briefRaw, 'How it works'),
    customPresentationExists,
    customPresentationRegistered,
  };
}

function hardFailures(result: WorkflowAuditResult): string[] {
  const failures: string[] = [];
  if (!result.briefExists) failures.push('missing brief.md');
  if (!result.briefRegistered) failures.push('not registered in BRIEF_PATHS');
  if (!result.webReferenced) failures.push('not referenced in legal web');
  if (!result.titlePresent) failures.push('brief title missing');
  if (!result.sectionBenefits) failures.push('missing Benefits section');
  if (!result.sectionFeatures) failures.push('missing Features section');
  if (!result.sectionWhenToUse) failures.push('missing When to use it section');
  if (!result.sectionHowItWorks) failures.push('missing How it works section');
  if (strictVideo && !result.videoPresent) failures.push('video missing');
  return failures;
}

function warnings(result: WorkflowAuditResult): string[] {
  const items: string[] = [];
  if (!result.videoPresent) items.push('video missing');
  if (!result.customPresentationExists) items.push('no workflow-specific presentation manifest');
  if (result.customPresentationExists && !result.customPresentationRegistered) {
    items.push('workflow-specific presentation exists but is not registered');
  }
  return items;
}

const controllerSource = readText(controllerPath);
const webFilePaths = walkFiles(legalWebRoot, new Set(['.vue', '.ts']));
const webSources = webFilePaths.map(readText);
const results = WORKFLOWS.map((workflow) =>
  auditWorkflow(workflow, controllerSource, webSources),
);

console.log('\nLegal workflow showcase audit\n');
console.log(
  [
    'workflow'.padEnd(30),
    'brief'.padEnd(7),
    'registry'.padEnd(9),
    'web'.padEnd(5),
    'title'.padEnd(7),
    'video'.padEnd(7),
    'benefits'.padEnd(10),
    'features'.padEnd(10),
    'when'.padEnd(7),
    'how'.padEnd(6),
    'presentation'.padEnd(13),
    'registered'.padEnd(11),
  ].join(' '),
);

for (const result of results) {
  console.log(
    [
      result.capabilitySlug.padEnd(30),
      boolMark(result.briefExists).padEnd(7),
      boolMark(result.briefRegistered).padEnd(9),
      boolMark(result.webReferenced).padEnd(5),
      boolMark(result.titlePresent).padEnd(7),
      boolMark(result.videoPresent).padEnd(7),
      boolMark(result.sectionBenefits).padEnd(10),
      boolMark(result.sectionFeatures).padEnd(10),
      boolMark(result.sectionWhenToUse).padEnd(7),
      boolMark(result.sectionHowItWorks).padEnd(6),
      boolMark(result.customPresentationExists).padEnd(13),
      boolMark(result.customPresentationRegistered).padEnd(11),
    ].join(' '),
  );
}

const failures = results.flatMap((result) =>
  hardFailures(result).map((failure) => `${result.capabilitySlug}: ${failure}`),
);
const warningItems = results.flatMap((result) =>
  warnings(result).map((warning) => `${result.capabilitySlug}: ${warning}`),
);

if (warningItems.length > 0) {
  console.log('\nWarnings:');
  for (const warning of warningItems) {
    console.log(`- ${warning}`);
  }
}

if (failures.length > 0) {
  console.error('\nFailures:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log('\nStructural showcase contract passed.');
  if (strictVideo) {
    console.log('Strict video mode passed.');
  } else {
    console.log('Run with --strict-video to require demo links in every brief.');
  }
}
