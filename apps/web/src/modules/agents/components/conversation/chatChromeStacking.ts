/**
 * Shared agent-chat stacking contract.
 *
 * After send, layers must paint in this order:
 *   1. User request callout — on top of the thread
 *   2. Waiting hourglass — under the callout
 *   3. Floating Help — behind the hourglass, never covering it
 *
 * Help is a position:fixed control mounted on App.vue (z-index 1200).
 * ion-page creates its own stacking context, so raising the footer
 * z-index cannot beat Help. Floating Help must hide or move on the
 * conversation route; the toolbar instance stays available.
 */

export const CHAT_CALLOUT_Z = 3;
export const CHAT_WAITING_Z = 2;
export const CHAT_FOOTER_Z = 4;
export const HELP_BEHIND_CHAT_Z = 1;
export const HELP_FLOATING_Z = 1200;

export type HelpGuidePlacement = 'floating' | 'toolbar';

export function isAgentConversationRoute(
  routeName: string | symbol | null | undefined,
): boolean {
  return routeName === 'AgentConversation';
}

export function shouldHideFloatingHelp(options: {
  placement: HelpGuidePlacement;
  routeName: string | symbol | null | undefined;
  isSending: boolean;
}): boolean {
  if (options.placement === 'toolbar') {
    return false;
  }

  return isAgentConversationRoute(options.routeName) || options.isSending;
}
