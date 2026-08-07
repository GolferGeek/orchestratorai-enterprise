import { validateSavePipelineInput } from './pipeline-validation';

describe('validateSavePipelineInput', () => {
  it('accepts a bounded pipeline and normalizes its name', () => {
    expect(
      validateSavePipelineInput({
        name: '  Research pipeline  ',
        runners: [
          { runnerId: 'context' },
          { runnerId: 'rag', config: { collection: 'briefs' } },
        ],
      }),
    ).toEqual({
      valid: true,
      input: {
        name: 'Research pipeline',
        runners: [
          { runnerId: 'context' },
          { runnerId: 'rag', config: { collection: 'briefs' } },
        ],
      },
    });
  });

  it.each([
    ['unknown runner', { name: 'Pipeline', runners: [{ runnerId: 'shell' }] }],
    [
      'duplicate runner',
      {
        name: 'Pipeline',
        runners: [{ runnerId: 'context' }, { runnerId: 'context' }],
      },
    ],
    [
      'extra field',
      {
        name: 'Pipeline',
        runners: [{ runnerId: 'context', command: 'whoami' }],
      },
    ],
    [
      'oversized config',
      {
        name: 'Pipeline',
        runners: [
          { runnerId: 'api', config: { value: 'x'.repeat(33 * 1024) } },
        ],
      },
    ],
  ])('rejects %s input', (_case, input) => {
    expect(validateSavePipelineInput(input)).toMatchObject({ valid: false });
  });
});
