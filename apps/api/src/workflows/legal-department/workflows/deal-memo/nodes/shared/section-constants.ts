/**
 * Shared constants used by the deal-memo synthesis + spec files.
 *
 * The canonical order of sections in the final memo, plus a resolver from
 * SectionId to the attorney-facing title. Kept in its own module so that
 * nodes and the graph can import without pulling the full prompt builder.
 */
import type { SectionId } from '../../deal-memo.types';

export const SECTION_ORDER: readonly SectionId[] = [
  'reps-warranties',
  'indemnification',
  'disclosure-schedules',
  'conditions-precedent',
  'covenants',
] as const;

const SECTION_TITLES: Record<SectionId, string> = {
  'reps-warranties': 'Representations & Warranties',
  indemnification: 'Indemnification',
  'disclosure-schedules': 'Disclosure Schedules',
  'conditions-precedent': 'Conditions Precedent to Closing',
  covenants: 'Covenants',
};

export function sectionTitle(id: SectionId): string {
  return SECTION_TITLES[id];
}
