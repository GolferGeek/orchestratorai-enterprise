import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import GuardVerdicts from './GuardVerdicts.vue';

describe('GuardVerdicts', () => {
  it('shows each verdict beside the answer', () => {
    const wrapper = mount(GuardVerdicts, {
      props: {
        metadata: {
          guards: [
            { rubric: 'claims-substantiated', decision: 'block', reason: 'unsubstantiated claim', answers: {} },
            { rubric: 'jd-inclusive-language', decision: 'pass', reason: 'inclusive', answers: {} },
          ],
        },
      },
    });
    const rows = wrapper.findAll('.guard');
    expect(rows.map((r) => r.classes())).toEqual([expect.arrayContaining(['guard--block']), expect.arrayContaining(['guard--pass'])]);
    expect(rows[0]!.text()).toContain('Flagged');
    expect(rows[0]!.text()).toContain('unsubstantiated claim');
  });

  it('renders nothing for an unguarded answer', () => {
    expect(mount(GuardVerdicts, { props: { metadata: { provider: 'openrouter' } } }).find('.guards').exists()).toBe(false);
  });
});
