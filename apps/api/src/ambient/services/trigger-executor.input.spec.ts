import type { Trigger } from '../ambient-database/database.service';
import type { AmbientEvent } from '../event-bus/ambient-event.types';
import { TriggerEvaluatorService } from './trigger-evaluator.service';
import { workflowInput } from './trigger-executor.service';

const trigger = (action_config: Trigger['action_config']) => ({ name: 'New hire', action_config }) as Trigger;
const event = { payload: { table: 'new_hires', eventType: 'INSERT', new: { id: 'hire-1', full_name: 'Ana' } } } as unknown as AmbientEvent;

describe('workflow input from a trigger', () => {
  it('uses the fixed input, adds fields from the event, and fails on a missing path', () => {
    expect(workflowInput(trigger({ workflowSlug: 'w', input: { compareWith: 'last-run' } }), event)).toEqual({ compareWith: 'last-run' });
    expect(workflowInput(trigger({ workflowSlug: 'w', inputFromEvent: { hireId: 'new.id' } }), event)).toEqual({ hireId: 'hire-1' });
    expect(workflowInput(trigger({ workflowSlug: 'w', input: { mode: 'x' }, inputFromEvent: { hireId: 'new.id' } }), event)).toEqual({ mode: 'x', hireId: 'hire-1' });
    expect(() => workflowInput(trigger({ workflowSlug: 'w', inputFromEvent: { hireId: 'new.employee_id' } }), event)).toThrow('has no new.employee_id');
  });
});

describe('trigger conditions', () => {
  const evaluator = new TriggerEvaluatorService({} as never, {} as never, {} as never);
  const withCondition = (condition: Record<string, unknown>) => ({ name: 'New hire', condition }) as Trigger;

  it('matches top-level fields and dotted paths into the record', () => {
    expect(evaluator.checkCondition(withCondition({ eventType: 'INSERT' }), event)).toBe(true);
    expect(evaluator.checkCondition(withCondition({ 'new.full_name': 'Ana' }), event)).toBe(true);
    expect(evaluator.checkCondition(withCondition({ 'new.full_name': 'Bo' }), event)).toBe(false);
  });

  it('skips a hire an onboarding run recorded itself', () => {
    const own = { payload: { new: { id: 'h', onboarding_run_id: 'run-1' } } } as unknown as AmbientEvent;
    const fresh = { payload: { new: { id: 'h', onboarding_run_id: null } } } as unknown as AmbientEvent;
    expect(evaluator.checkCondition(withCondition({ 'new.onboarding_run_id': null }), own)).toBe(false);
    expect(evaluator.checkCondition(withCondition({ 'new.onboarding_run_id': null }), fresh)).toBe(true);
  });
});
