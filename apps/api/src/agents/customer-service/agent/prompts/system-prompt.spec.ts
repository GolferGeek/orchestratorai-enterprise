import type { CompanyProfile } from '../company-profile';
import {
  buildClassifyIntentSystemPrompt,
  buildCustomerServiceSystemPrompt,
  buildGroundedAnswerSystemPrompt,
  buildNotFoundReply,
} from './system-prompt';

const PLATFORM_COPY = /orchestrator|\d{3}-\d{3}-\d{4}/i;

const full: CompanyProfile = {
  orgSlug: 'acme',
  name: 'Acme Labs',
  contact: {
    email: 'help@acme.test',
    phone: '+1 555 0100',
    bookingUrl: 'https://acme.test/book',
  },
};
const emailOnly: CompanyProfile = {
  orgSlug: 'acme',
  name: 'Acme Labs',
  contact: { email: 'help@acme.test' },
};

describe('customer-service prompts', () => {
  it('builds the persona from the company name and its contact details', () => {
    const prompt = buildCustomerServiceSystemPrompt(full);
    expect(prompt).toContain('customer service assistant for Acme Labs');
    expect(prompt).toContain('Email: help@acme.test');
    expect(prompt).toContain('Phone: +1 555 0100');
    expect(prompt).toContain('Book a meeting: https://acme.test/book');
    expect(prompt).toMatch(/you are an AI/i);
    expect(prompt).toMatch(/legal, medical or financial advice/);
    expect(prompt).toMatch(/Never claim anything the documents do not say/);
    expect(prompt).not.toMatch(PLATFORM_COPY);
  });

  it('omits contact lines the company has not set', () => {
    const prompt = buildCustomerServiceSystemPrompt(emailOnly);
    expect(prompt).toContain('Email: help@acme.test');
    expect(prompt).not.toContain('Phone:');
    expect(prompt).not.toContain('Book a meeting:');
  });

  it('classifies intents about the company and keeps the five labels', () => {
    const prompt = buildClassifyIntentSystemPrompt(full);
    expect(prompt).toContain('conversation with Acme Labs');
    for (const intent of [
      'general_question',
      'pricing_inquiry',
      'schedule_demo',
      'need_help',
      'off_topic',
    ]) {
      expect(prompt).toContain(intent);
    }
    expect(prompt).not.toMatch(PLATFORM_COPY);
  });

  it('grounds answers in the excerpts with document names', () => {
    const prompt = buildGroundedAnswerSystemPrompt(
      full,
      [{ documentName: 'price-list.md', section: 'Kits', content: 'Kit A: $99' }],
      'pricing',
    );
    expect(prompt).toContain('document: price-list.md — section: Kits');
    expect(prompt).toContain('Kit A: $99');
    expect(prompt).toContain('Answer ONLY from the excerpts above');
    expect(prompt).toMatch(/Never invent or estimate prices, dates or hours/);
  });

  it('says honestly when the documents have nothing, with the email', () => {
    expect(buildNotFoundReply(emailOnly)).toBe(
      "I couldn't find that in the information I have from Acme Labs, so I don't want to guess. Please email help@acme.test and the team can help.",
    );
    expect(buildNotFoundReply(full)).toContain('or call +1 555 0100');
  });
});
