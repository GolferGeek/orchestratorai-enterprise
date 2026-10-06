import { CustomerServiceState, requireProfile } from '../customer-service.state';
import type { CompanyProfile } from '../company-profile';
import type { NodeObservability } from './node-dependencies';

/** The demo/meeting reply for a company: booking link if set, always email, phone if set. */
export function buildOfferDemoReply(profile: CompanyProfile): string {
  const phone =
    profile.contact.phone !== undefined
      ? ` or call ${profile.contact.phone}`
      : '';
  if (profile.contact.bookingUrl !== undefined) {
    return `I'd be glad to help set that up. You can book a time with ${profile.name} here: ${profile.contact.bookingUrl}. You can also email ${profile.contact.email}${phone}.`;
  }
  return `I'd be glad to help set that up. Please email ${profile.contact.email}${phone} and the ${profile.name} team will arrange a time with you.`;
}

/**
 * Offer Demo Node
 *
 * Handles schedule_demo intent with a fixed reply built from the company
 * profile. No LLM call: the facts are all in the profile.
 */
export function createOfferDemoNode(observability: NodeObservability) {
  return async function offerDemoNode(
    state: CustomerServiceState,
  ): Promise<Partial<CustomerServiceState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Providing scheduling information',
      { step: 'offer_demo', progress: 50 },
    );

    return { nodeResponse: buildOfferDemoReply(requireProfile(state)) };
  };
}
