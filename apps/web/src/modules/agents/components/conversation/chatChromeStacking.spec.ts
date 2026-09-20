import { describe, expect, it } from 'vitest';
import {
  CHAT_CALLOUT_Z,
  CHAT_FOOTER_Z,
  CHAT_WAITING_Z,
  HELP_BEHIND_CHAT_Z,
  HELP_FLOATING_Z,
  isAgentConversationRoute,
  shouldHideFloatingHelp,
} from './chatChromeStacking';

describe('agent chat chrome stacking', () => {
  it('keeps the request callout above the waiting hourglass', () => {
    expect(CHAT_CALLOUT_Z).toBeGreaterThan(CHAT_WAITING_Z);
  });

  it('keeps the footer hourglass above help-behind-chat', () => {
    expect(CHAT_FOOTER_Z).toBeGreaterThan(HELP_BEHIND_CHAT_Z);
    expect(CHAT_WAITING_Z).toBeGreaterThan(HELP_BEHIND_CHAT_Z);
  });

  it('documents that floating help outranks in-page chrome unless hidden', () => {
    expect(HELP_FLOATING_Z).toBeGreaterThan(CHAT_FOOTER_Z);
  });

  it('recognizes the shared conversation route used by every agent', () => {
    expect(isAgentConversationRoute('AgentConversation')).toBe(true);
    expect(isAgentConversationRoute('agents')).toBe(false);
    expect(isAgentConversationRoute(undefined)).toBe(false);
  });

  it('hides floating help on the conversation route so it cannot cover the hourglass', () => {
    expect(
      shouldHideFloatingHelp({
        placement: 'floating',
        routeName: 'AgentConversation',
        isSending: false,
      }),
    ).toBe(true);
  });

  it('hides floating help while any agent is waiting', () => {
    expect(
      shouldHideFloatingHelp({
        placement: 'floating',
        routeName: 'agents',
        isSending: true,
      }),
    ).toBe(true);
  });

  it('keeps toolbar help visible so the guide remains reachable', () => {
    expect(
      shouldHideFloatingHelp({
        placement: 'toolbar',
        routeName: 'AgentConversation',
        isSending: true,
      }),
    ).toBe(false);
  });

  it('leaves floating help on non-chat pages when idle', () => {
    expect(
      shouldHideFloatingHelp({
        placement: 'floating',
        routeName: 'agents',
        isSending: false,
      }),
    ).toBe(false);
  });
});
