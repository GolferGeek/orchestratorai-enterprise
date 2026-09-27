import { Inject, Injectable } from '@nestjs/common';
import { readdir, readFile } from 'node:fs/promises';
import * as path from 'node:path';
import {
  WORKFLOW_DOC_NAMES,
  type JsonValue,
  type WorkflowBrief,
  type WorkflowDocName,
  type WorkflowShowcaseCase,
} from '@orchestrator-ai/transport-types';

/** Where workflow folders live; each keeps its docs in `<slug>/docs/`. */
export const WORKFLOW_DOCS_ROOT = Symbol('WORKFLOW_DOCS_ROOT');

/** The API runs from apps/api (dev and container alike), and the image ships src/. */
export const DEFAULT_WORKFLOW_DOCS_ROOT = path.resolve(process.cwd(), 'src', 'workflows');

/** The workflow has no such document (a 404, not a server fault). */
export class WorkflowDocMissingError extends Error {}

const CASE_SLUG = /^[a-z0-9][a-z0-9-]*$/;

/**
 * A workflow's brief, docs and showcase, read from markdown and JSON files
 * next to its code. Read-only: they change through git with the workflow.
 * Callers pass only registered slugs and known doc names, so no path is
 * built from free input.
 */
@Injectable()
export class WorkflowDocsService {
  constructor(@Inject(WORKFLOW_DOCS_ROOT) private readonly root: string) {}

  async brief(slug: string, validateInput?: (input: JsonValue) => unknown): Promise<WorkflowBrief> {
    const text = await this.read(slug, 'brief.md');
    const match = /^#\s+(.+)\n/.exec(text);
    if (!match) throw new Error(`docs/brief.md of ${slug} must start with an H1 title`);
    const docs: WorkflowDocName[] = [];
    for (const name of WORKFLOW_DOC_NAMES) {
      if (await this.exists(slug, `${name}.md`)) docs.push(name);
    }
    return {
      slug,
      title: match[1]!.trim(),
      markdown: text.slice(match[0].length).trim(),
      docs,
      showcase: await this.showcase(slug, validateInput),
    };
  }

  async doc(slug: string, name: WorkflowDocName): Promise<string> {
    return this.read(slug, `${name}.md`);
  }

  private async showcase(slug: string, validateInput?: (input: JsonValue) => unknown): Promise<WorkflowShowcaseCase[]> {
    const dir = path.join(this.root, slug, 'docs', 'showcase');
    let entries: string[];
    try {
      entries = (await readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort();
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
    const cases: WorkflowShowcaseCase[] = [];
    for (const caseSlug of entries) {
      if (!CASE_SLUG.test(caseSlug)) throw new Error(`Showcase case "${caseSlug}" of ${slug} is not a slug`);
      const file = path.join(dir, caseSlug, 'case.json');
      const raw = JSON.parse(await readFile(file, 'utf-8')) as Record<string, unknown>;
      if (typeof raw.title !== 'string' || typeof raw.summary !== 'string' || typeof raw.input !== 'object' || raw.input === null) {
        throw new Error(`${slug} showcase ${caseSlug}/case.json needs a title, a summary and an input object`);
      }
      // A worked example that the workflow would refuse is a broken example.
      validateInput?.(raw.input as JsonValue);
      cases.push({ caseSlug, title: raw.title, summary: raw.summary, input: raw.input as JsonValue });
    }
    return cases;
  }

  private async read(slug: string, file: string): Promise<string> {
    try {
      return await readFile(path.join(this.root, slug, 'docs', file), 'utf-8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new WorkflowDocMissingError(`Workflow ${slug} has no ${file}`);
      }
      throw err;
    }
  }

  private async exists(slug: string, file: string): Promise<boolean> {
    try {
      await readFile(path.join(this.root, slug, 'docs', file));
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw err;
    }
  }
}
