import type { JsonValue } from '@orchestrator-ai/transport-types';
import { WorkflowInputError } from '../catalog/workflow.registry';

export const SWARM_SLUG = 'marketing-swarm';

export interface SwarmBrief {
  topic: string;
  audience: string;
  goal: string;
  keyPoints: string[];
  brandVoice: string;
  keywords: string[];
  constraints: string | null;
}

export interface SwarmInput {
  contentType: string;
  brief: SwarmBrief;
  /** Substantiation on file for the copy's claims, or null for none. */
  evidence: string | null;
  writers: string[];
  editors: string[];
  evaluators: string[];
  /** Rewrites allowed after the first draft (0-3). */
  maxEditCycles: number;
}

const SLUG = /^[a-z][a-z0-9-]*$/;

function object(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new WorkflowInputError(`${what} must be an object`);
  return value as Record<string, unknown>;
}

function onlyKeys(body: Record<string, unknown>, allowed: string[], what: string): void {
  const extra = Object.keys(body).filter((k) => !allowed.includes(k));
  if (extra.length) throw new WorkflowInputError(`${what} has unknown fields: ${extra.join(', ')}`);
}

function text(body: Record<string, unknown>, key: string, max: number, what = key): string {
  const v = body[key];
  if (typeof v !== 'string' || !v.trim() || v.length > max) throw new WorkflowInputError(`${what} is required (at most ${max} characters)`);
  return v.trim();
}

function optionalText(body: Record<string, unknown>, key: string, max: number): string | null {
  const v = body[key];
  if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) return null;
  if (typeof v !== 'string' || v.length > max) throw new WorkflowInputError(`${key} must be text (at most ${max} characters)`);
  return v.trim();
}

function list(body: Record<string, unknown>, key: string, opts: { min: number; max: number; itemMax: number }): string[] {
  const v = body[key];
  if (v === undefined && opts.min === 0) return [];
  if (!Array.isArray(v)) throw new WorkflowInputError(`${key} must be a list`);
  const items = v.map((x) => {
    if (typeof x !== 'string' || !x.trim() || x.length > opts.itemMax) throw new WorkflowInputError(`${key} must hold non-empty text (at most ${opts.itemMax} characters each)`);
    return x.trim();
  });
  if (items.length < opts.min || items.length > opts.max) throw new WorkflowInputError(`${key} needs ${opts.min} to ${opts.max} entries`);
  return items;
}

function slugs(body: Record<string, unknown>, key: string, min: number, max: number): string[] {
  const items = list(body, key, { min, max, itemMax: 100 });
  for (const s of items) if (!SLUG.test(s)) throw new WorkflowInputError(`${key}: "${s}" is not a slug`);
  if (new Set(items).size !== items.length) throw new WorkflowInputError(`${key} lists one twice`);
  return items;
}

/** `start` input. Which writers, editors and evaluators exist is checked when the run loads them. */
export function parseSwarmInput(input: JsonValue): SwarmInput {
  const body = object(input, 'input');
  onlyKeys(body, ['contentType', 'brief', 'evidence', 'writers', 'editors', 'evaluators', 'maxEditCycles'], 'input');
  const brief = object(body.brief, 'brief');
  onlyKeys(brief, ['topic', 'audience', 'goal', 'keyPoints', 'brandVoice', 'keywords', 'constraints'], 'brief');
  const contentType = text(body, 'contentType', 100);
  if (!SLUG.test(contentType)) throw new WorkflowInputError('contentType must be a content type slug');
  const cycles = body.maxEditCycles;
  if (typeof cycles !== 'number' || !Number.isInteger(cycles) || cycles < 0 || cycles > 3) throw new WorkflowInputError('maxEditCycles must be 0, 1, 2 or 3');
  return {
    contentType,
    brief: {
      topic: text(brief, 'topic', 300),
      audience: text(brief, 'audience', 300),
      goal: text(brief, 'goal', 300),
      keyPoints: list(brief, 'keyPoints', { min: 0, max: 10, itemMax: 300 }),
      brandVoice: text(brief, 'brandVoice', 300),
      keywords: list(brief, 'keywords', { min: 0, max: 10, itemMax: 60 }),
      constraints: optionalText(brief, 'constraints', 1000),
    },
    evidence: optionalText(body, 'evidence', 4000),
    writers: slugs(body, 'writers', 1, 8),
    editors: slugs(body, 'editors', 1, 6),
    evaluators: slugs(body, 'evaluators', 1, 6),
    maxEditCycles: cycles,
  };
}

export const swarmRunTitle = (input: JsonValue) => parseSwarmInput(input).brief.topic;

/** The brief as the writers, the coach and Jev read it. */
export function briefText(brief: SwarmBrief, contentType: { name: string; minWords: number; maxWords: number; maxChars: number | null }): string {
  const lines = [
    `Content type: ${contentType.name} (${contentType.minWords}-${contentType.maxWords} words${contentType.maxChars !== null ? `, at most ${contentType.maxChars} characters` : ''}).`,
    `Audience: ${brief.audience}.`,
    `Brand voice: ${brief.brandVoice}.`,
    brief.keywords.length ? `Keywords: ${brief.keywords.join(', ')}.` : 'Keywords: none given.',
    `Topic: ${brief.topic}.`,
    brief.keyPoints.length ? `Must cover: ${brief.keyPoints.join('; ')}.` : null,
    `Goal: ${brief.goal}.`,
    brief.constraints ? `Constraints: ${brief.constraints}` : null,
  ];
  return lines.filter((l): l is string => l !== null).join('\n');
}
