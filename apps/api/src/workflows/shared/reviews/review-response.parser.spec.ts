import { parseReviewResponse } from './review-response.parser';

describe('parseReviewResponse', () => {
  it.each([
    [{ type: 'approve' }, { type: 'approve' }],
    [{ type: 'approve', feedback: 'Good' }, { type: 'approve', feedback: 'Good' }],
    [{ type: 'reject', feedback: 'Too long' }, { type: 'reject', feedback: 'Too long' }],
    [
      { type: 'modify', items: [{ itemId: 'c1', decision: 'accept' }, { itemId: 'c2', decision: 'modify', replacement: 'New text' }] },
      { type: 'modify', items: [{ itemId: 'c1', decision: 'accept' }, { itemId: 'c2', decision: 'modify', replacement: 'New text' }] },
    ],
  ])('accepts %j', (decision, expected) => {
    expect(
      parseReviewResponse({ action: 'review.submit', reviewId: 'r1', decision: decision as never }),
    ).toEqual({ response: { kind: 'decision', decision: expected } });
  });

  it.each([
    { type: 'reject' },
    { type: 'reject', feedback: '  ' },
    { type: 'modify', items: [] },
    { type: 'modify', items: [{ itemId: 'c1', decision: 'maybe' }] },
    { type: 'approve', feedback: 3 },
    { type: 'deepen' },
  ])('rejects %j', (decision) => {
    expect(
      parseReviewResponse({ action: 'review.submit', reviewId: 'r1', decision: decision as never }),
    ).toHaveProperty('error');
  });

  it('checks answers and passes finish through', () => {
    expect(
      parseReviewResponse({ action: 'answer.submit', reviewId: 'r1', answer: { text: 'Yes', turn: 2 } }),
    ).toEqual({ response: { kind: 'answer', answer: { text: 'Yes', turn: 2 } } });
    expect(
      parseReviewResponse({ action: 'answer.submit', reviewId: 'r1', answer: { text: '', turn: 2 } }),
    ).toHaveProperty('error');
    expect(parseReviewResponse({ action: 'finish', reviewId: 'r1' })).toEqual({
      response: { kind: 'finish' },
    });
  });
});
