import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ConversationThread from './ConversationThread.vue';
import type { ConversationMessage } from '@/modules/agents/stores/conversation.store';

const userMessage: ConversationMessage = {
  id: 'm1',
  conversationId: 'c1',
  role: 'user',
  content: 'Review this contract',
  timestamp: '2026-08-25T15:00:00.000Z',
};

describe('ConversationThread waiting chrome', () => {
  it('keeps the user callout above the waiting hourglass', () => {
    const wrapper = mount(ConversationThread, {
      props: { messages: [userMessage], waiting: true },
      global: {
        stubs: {
          AgentResponse: true,
          IonIcon: true,
        },
      },
    });

    expect(wrapper.get('.user-message-bubble').text()).toContain('Review this contract');
    expect(wrapper.find('.waiting-hourglass').exists()).toBe(true);

    const html = wrapper.html();
    expect(html.indexOf('user-message-bubble')).toBeLessThan(html.indexOf('waiting-hourglass'));
  });

  it('does not render the hourglass when the conversation is idle', () => {
    const wrapper = mount(ConversationThread, {
      props: { messages: [userMessage], waiting: false },
      global: {
        stubs: {
          AgentResponse: true,
          IonIcon: true,
        },
      },
    });

    expect(wrapper.find('.waiting-hourglass').exists()).toBe(false);
  });
});
