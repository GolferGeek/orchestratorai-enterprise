import { describeHunk, diffSegments } from '../diff';
import { pageText, segments } from '../page-text';

describe('page text', () => {
  it('keeps the visible text and drops scripts, styles and tags', () => {
    expect(pageText('<html><style>a{}</style><script>x()</script><h1>Pricing</h1><p>Team&nbsp;plan &amp; more</p></html>')).toBe('Pricing Team plan & more');
  });

  it('splits into sentences and cuts long runs at word boundaries', () => {
    expect(segments('Free plan. Team $49 per user! Enterprise?')).toEqual(['Free plan.', 'Team $49 per user!', 'Enterprise?']);
    const long = segments('word '.repeat(120).trim());
    expect(long.length).toBeGreaterThan(1);
    expect(long.every((s) => s.length <= 240)).toBe(true);
  });
});

describe('diff', () => {
  it('finds each changed region, largest first', () => {
    const before = ['Pricing.', 'Team $49 per user.', 'Free for 3 users.', 'Contact sales.', '(c) 2025.'];
    const after = ['Pricing.', 'Team $69 per user, billed annually.', 'Free for 2 users.', 'Contact sales.', '(c) 2026.'];
    const hunks = diffSegments(before, after, 5);
    expect(hunks).toEqual([
      { removed: ['Team $49 per user.', 'Free for 3 users.'], added: ['Team $69 per user, billed annually.', 'Free for 2 users.'] },
      { removed: ['(c) 2025.'], added: ['(c) 2026.'] },
    ]);
    expect(describeHunk(hunks[1]!)).toBe('Removed: (c) 2025.\nAdded: (c) 2026.');
  });

  it('reports nothing for an unchanged page, pure additions, and refuses a page too large', () => {
    expect(diffSegments(['a.', 'b.'], ['a.', 'b.'], 5)).toEqual([]);
    expect(diffSegments(['a.'], ['a.', 'New: Agents.'], 5)).toEqual([{ removed: [], added: ['New: Agents.'] }]);
    expect(() => diffSegments(new Array(2501).fill('x'), [], 5)).toThrow('too large');
  });
});
