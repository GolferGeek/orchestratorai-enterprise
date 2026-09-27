import type { JsonValue } from '@orchestrator-ai/transport-types';
import { WorkflowInputError } from '../catalog/workflow.registry';

export const POSTMORTEM_SLUG = 'incident-postmortem';
const MAX_INCIDENT = 30000;

/** `start` input: { title, incident } - the incident's timeline, notes and log excerpts as text. */
export function parsePostmortemInput(input: JsonValue): { title: string; incident: string } {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new WorkflowInputError('input must be an object with title and incident');
  const extra = Object.keys(input).filter((k) => k !== 'title' && k !== 'incident');
  if (extra.length) throw new WorkflowInputError(`input has unknown fields: ${extra.join(', ')}`);
  const { title, incident } = input;
  if (typeof title !== 'string' || !title.trim() || title.length > 200) throw new WorkflowInputError('input.title is required (at most 200 characters)');
  if (typeof incident !== 'string' || incident.trim().length < 40) throw new WorkflowInputError('input.incident must describe the incident (the timeline and notes)');
  if (incident.length > MAX_INCIDENT) throw new WorkflowInputError(`input.incident must be at most ${MAX_INCIDENT} characters`);
  return { title: title.trim(), incident: incident.trim() };
}

export const postmortemRunTitle = (input: JsonValue) => `Postmortem: ${parsePostmortemInput(input).title}`;
