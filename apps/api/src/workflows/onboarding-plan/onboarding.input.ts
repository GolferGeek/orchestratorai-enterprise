import type { JsonValue } from '@orchestrator-ai/transport-types';
import { WorkflowInputError } from '../catalog/workflow.registry';
import type { NewHireFields } from './hires-store.service';

export const ONBOARDING_SLUG = 'onboarding-plan';

const TYPES = ['full-time', 'part-time', 'contractor'] as const;
const FIELDS = ['fullName', 'roleTitle', 'team', 'managerName', 'location', 'employmentType', 'startDate', 'notes'];

/** `hireName` only titles the run (the hire is read from HR by id). */
export type OnboardingInput = { hireId: string; hireName?: string } | { hire: NewHireFields };

function object(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new WorkflowInputError(`${what} must be an object`);
  return value as Record<string, unknown>;
}

/** A new hire as HR records one (the HR form and the `hire` input). */
export function parseNewHire(value: unknown): NewHireFields {
  const hire = object(value, 'the new hire');
  const extra = Object.keys(hire).filter((k) => !FIELDS.includes(k));
  if (extra.length) throw new WorkflowInputError(`the new hire has unknown fields: ${extra.join(', ')}`);
  const text = (key: string): string => {
    const v = hire[key];
    if (typeof v !== 'string' || !v.trim() || v.length > 200) throw new WorkflowInputError(`${key} is required (at most 200 characters)`);
    return v.trim();
  };
  const employmentType = hire.employmentType;
  if (!(TYPES as readonly unknown[]).includes(employmentType)) throw new WorkflowInputError(`employmentType must be one of ${TYPES.join(', ')}`);
  const startDate = text('startDate');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || Number.isNaN(Date.parse(startDate))) throw new WorkflowInputError('startDate must be a date (YYYY-MM-DD)');
  if (hire.notes !== undefined && hire.notes !== null && (typeof hire.notes !== 'string' || hire.notes.length > 2000)) throw new WorkflowInputError('notes must be text (at most 2000 characters)');
  const notes = typeof hire.notes === 'string' && hire.notes.trim() ? hire.notes.trim() : null;
  return {
    fullName: text('fullName'),
    roleTitle: text('roleTitle'),
    team: text('team'),
    managerName: text('managerName'),
    location: text('location'),
    employmentType: employmentType as NewHireFields['employmentType'],
    startDate,
    notes,
  };
}

/**
 * `start` input: { hireId, hireName? } for a hire already recorded in HR (the
 * ambient trigger starts these on insert), or { hire } to record the hire as
 * part of the run (linked to it, so the trigger does not start a second plan).
 */
export function parseOnboardingInput(input: JsonValue): OnboardingInput {
  const body = object(input, 'input');
  const keys = Object.keys(body).sort().join(',');
  if (keys === 'hire') return { hire: parseNewHire(body.hire) };
  if (keys !== 'hireId' && keys !== 'hireId,hireName') throw new WorkflowInputError('input must be { hireId, hireName? } or { hire }');
  if (typeof body.hireId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.hireId)) throw new WorkflowInputError('input.hireId must be a new hire id');
  if (body.hireName === undefined) return { hireId: body.hireId };
  if (typeof body.hireName !== 'string' || !body.hireName.trim() || body.hireName.length > 200) throw new WorkflowInputError('input.hireName must be the hire\'s name (at most 200 characters)');
  return { hireId: body.hireId, hireName: body.hireName.trim() };
}

export function onboardingRunTitle(input: JsonValue): string {
  const parsed = parseOnboardingInput(input);
  if ('hire' in parsed) return `Onboarding plan for ${parsed.hire.fullName}`;
  return parsed.hireName ? `Onboarding plan for ${parsed.hireName}` : `Onboarding plan for hire ${parsed.hireId.slice(0, 8)}`;
}
