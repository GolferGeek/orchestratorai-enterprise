import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const routeState = {
  name: 'agents' as string,
  path: '/app/agents',
};

vi.mock('vue-router', () => ({
  useRoute: () => routeState,
}));

import HelpGuideButton from './HelpGuideButton.vue';

const ionicStubs = {
  IonModal: true,
  IonHeader: true,
  IonToolbar: true,
  IonTitle: true,
  IonButtons: true,
  IonButton: true,
  IonContent: true,
  IonIcon: true,
};

describe('HelpGuideButton chat stacking', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    routeState.name = 'agents';
    routeState.path = '/app/agents';
  });

  it('hides the floating help control on the shared conversation route', () => {
    routeState.name = 'AgentConversation';
    routeState.path = '/app/agents/contract-assistant/conversation';

    const wrapper = mount(HelpGuideButton, {
      props: { placement: 'floating' },
      global: { stubs: ionicStubs },
    });

    expect(wrapper.find('.help-guide').exists()).toBe(false);
  });

  it('keeps toolbar help visible on the conversation route', () => {
    routeState.name = 'AgentConversation';
    routeState.path = '/app/agents/contract-assistant/conversation';

    const wrapper = mount(HelpGuideButton, {
      props: { placement: 'toolbar' },
      global: { stubs: ionicStubs },
    });

    expect(wrapper.find('.help-guide--toolbar').exists()).toBe(true);
  });

  it('hides floating help while an agent request is in flight', async () => {
    const { useConversationStore } = await import('@/modules/agents/stores/conversation.store');
    const store = useConversationStore();
    store.setActiveConversation('c1');
    store.setStatus('c1', 'sending');

    const wrapper = mount(HelpGuideButton, {
      props: { placement: 'floating' },
      global: { stubs: ionicStubs },
    });

    expect(wrapper.find('.help-guide').exists()).toBe(false);
  });
});
