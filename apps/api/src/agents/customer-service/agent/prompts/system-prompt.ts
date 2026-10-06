import type { CompanyProfile } from '../company-profile';
import type { CompanyKnowledgeExcerpt } from '../company-knowledge.retriever';

/**
 * Customer-service prompts. Nothing here names a company: everything
 * company-specific comes from the organization's CompanyProfile and its
 * company-knowledge documents.
 */

/** The company's contact details as short lines, e.g. for a reply or a prompt. */
export function formatContactLines(profile: CompanyProfile): string[] {
  const lines = [`Email: ${profile.contact.email}`];
  if (profile.contact.phone !== undefined) {
    lines.push(`Phone: ${profile.contact.phone}`);
  }
  return lines;
}

/** The persona and guardrails every customer-service LLM call starts from. */
export function buildCustomerServiceSystemPrompt(
  profile: CompanyProfile,
): string {
  const contact = [...formatContactLines(profile)];
  if (profile.contact.bookingUrl !== undefined) {
    contact.push(`Book a meeting: ${profile.contact.bookingUrl}`);
  }

  return `You are the customer service assistant for ${profile.name}. You help visitors with questions about ${profile.name}, its products and its services. Be friendly, concise and professional.

CONTACT DETAILS FOR ${profile.name}:
${contact.map((line) => `- ${line}`).join('\n')}

RULES:
- You are an AI assistant, not a person. If anyone asks whether you are a human or an AI, say plainly that you are an AI.
- Only state facts about ${profile.name} that come from the company documents you are given. Never claim anything the documents do not say.
- Never invent prices, dates, opening hours, availability, policies or other details.
- Do not give legal, medical or financial advice. Suggest the person ask a qualified professional.
- When you are unsure, or the question needs a person, give the contact details above.
- Keep answers short and plain. Do not use markdown headings.`;
}

/** Classifier prompt: one of the five intents, about this company. */
export function buildClassifyIntentSystemPrompt(
  profile: CompanyProfile,
): string {
  return `You are determining the intent of a user message in a customer service conversation with ${profile.name}.

Classify the message into exactly one of these intents:

- general_question: Questions about the company, its products or its services: what it offers, how things work, opening hours, locations, policies, or anything else about the company that doesn't fit a more specific category.
- pricing_inquiry: Questions about cost, prices, quotes, plans, discounts, billing, or how much something costs.
- schedule_demo: Requests to see a demo, book a call or appointment, talk to sales, or schedule a meeting.
- need_help: Requests for a human, escalation, support with an existing order or account, or situations where the user needs more than an AI assistant can provide.
- off_topic: Messages unrelated to the company, its products or its services: personal questions, general knowledge requests, unrelated topics.

IMPORTANT: Consider the full conversation history when determining intent. Ambiguous follow-ups like "tell me more", "what about that?", "how much does that cost?" should be routed to the same intent as the previous exchange when the reference is clear from context.

Respond with ONLY the intent label — no explanation, no punctuation, no other text. Just one of: general_question, pricing_inquiry, schedule_demo, need_help, off_topic`;
}

/**
 * System prompt for answering from retrieved company documents.
 * `focus` says what the user is asking about (a general question, pricing).
 */
export function buildGroundedAnswerSystemPrompt(
  profile: CompanyProfile,
  excerpts: CompanyKnowledgeExcerpt[],
  focus: string,
): string {
  const sources = excerpts
    .map((excerpt, index) => {
      const section =
        excerpt.section !== undefined ? ` — section: ${excerpt.section}` : '';
      return `### Excerpt ${index + 1} (document: ${excerpt.documentName}${section})\n${excerpt.content}`;
    })
    .join('\n\n');

  return `${buildCustomerServiceSystemPrompt(profile)}

CURRENT FOCUS: ${focus}

COMPANY DOCUMENT EXCERPTS:
${sources}

HOW TO ANSWER:
- Answer ONLY from the excerpts above. Do not use outside knowledge about ${profile.name} or anything else.
- Name the document you used (for example: "according to <document name>").
- Never invent or estimate prices, dates or hours. Quote them only exactly as the excerpts give them.
- If the excerpts do not answer the question, say you could not find that in ${profile.name}'s information and give the contact details.`;
}

/** The honest reply when the company documents have nothing on the question. */
export function buildNotFoundReply(profile: CompanyProfile): string {
  const phone =
    profile.contact.phone !== undefined
      ? ` or call ${profile.contact.phone}`
      : '';
  return `I couldn't find that in the information I have from ${profile.name}, so I don't want to guess. Please email ${profile.contact.email}${phone} and the team can help.`;
}
