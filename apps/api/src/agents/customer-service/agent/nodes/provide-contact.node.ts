import { CustomerServiceState, requireProfile } from '../customer-service.state';
import type { CompanyProfile } from '../company-profile';
import type { NodeObservability } from './node-dependencies';

/** The hand-off reply: says it is an AI and gives every contact detail the profile has. */
export function buildProvideContactReply(profile: CompanyProfile): string {
  const lines = [`Email: ${profile.contact.email}`];
  if (profile.contact.phone !== undefined) {
    lines.push(`Phone: ${profile.contact.phone}`);
  }
  if (profile.contact.bookingUrl !== undefined) {
    lines.push(`Book a time: ${profile.contact.bookingUrl}`);
  }
  return `I'm sorry I can't sort that out for you myself. I'm an AI assistant, so the ${profile.name} team is the best place to get this resolved:\n${lines.join('\n')}`;
}

/**
 * Provide Contact Node
 *
 * Handles need_help intent: the user wants a person or needs more than the
 * assistant can give. Fixed reply from the company profile, so the contact
 * details are always exactly right.
 */
export function createProvideContactNode(observability: NodeObservability) {
  return async function provideContactNode(
    state: CustomerServiceState,
  ): Promise<Partial<CustomerServiceState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Providing contact information',
      { step: 'provide_contact', progress: 50 },
    );

    return { nodeResponse: buildProvideContactReply(requireProfile(state)) };
  };
}
