import { proseBlocks } from '../prose-blocks';

describe('proseBlocks', () => {
  it('turns light markdown into paragraphs, bold runs and bullets', () => {
    expect(proseBlocks('### PostHog\n\n**Revise and resubmit** for 23 74 13.\n\n*   **Section 2.1.C:** R-410A.\n*   Section 2.1.B: IEER.\n\nThanks.')).toEqual([
      { kind: 'paragraph', runs: [{ kind: 'bold', text: 'PostHog' }] },
      { kind: 'paragraph', runs: [{ kind: 'bold', text: 'Revise and resubmit' }, { kind: 'text', text: ' for 23 74 13.' }] },
      { kind: 'bullets', items: [{ runs: [{ kind: 'bold', text: 'Section 2.1.C:' }, { kind: 'text', text: ' R-410A.' }] }, { runs: [{ kind: 'text', text: 'Section 2.1.B: IEER.' }] }] },
      { kind: 'paragraph', runs: [{ kind: 'text', text: 'Thanks.' }] },
    ]);
  });

  it('joins wrapped lines of one paragraph', () => {
    expect(proseBlocks('One line\nwrapped.')).toEqual([{ kind: 'paragraph', runs: [{ kind: 'text', text: 'One line wrapped.' }] }]);
  });
});
