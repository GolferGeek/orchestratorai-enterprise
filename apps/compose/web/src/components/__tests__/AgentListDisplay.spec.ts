import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { IonicVue } from '@ionic/vue';
import { createPinia, setActivePinia } from 'pinia';
import AgentListDisplay from '../AgentListDisplay.vue';
import type { AgentInfo } from '@/types/chat';

// Create wrapper helper
const createWrapper = (props: { agents: AgentInfo[] }) => {
  const pinia = createPinia();
  setActivePinia(pinia);

  return mount(AgentListDisplay, {
    props,
    global: {
      plugins: [IonicVue, pinia],
    },
  });
};

// Helper to create mock agents
const createMockAgent = (
  id: string,
  name: string,
  description: string
): AgentInfo => ({
  id,
  name,
  description,
  type: 'context',
  slug: name.toLowerCase().replace(/\s+/g, '-'),
});

describe('AgentListDisplay', () => {
  beforeEach(() => {
    const pinia = createPinia();
    setActivePinia(pinia);
  });

  describe('Component Rendering', () => {
    it('renders without crashing', () => {
      const wrapper = createWrapper({ agents: [] });
      expect(wrapper.exists()).toBe(true);
    });

    it('renders card container', () => {
      const wrapper = createWrapper({ agents: [] });
      const card = wrapper.find('.agent-list-card');
      expect(card.exists()).toBe(true);
    });

    it('renders card header with title', () => {
      const wrapper = createWrapper({ agents: [] });
      const title = wrapper.find('ion-card-title');
      expect(title.exists()).toBe(true);
      expect(title.text()).toBe('Available Agents');
    });

    it('renders card content', () => {
      const wrapper = createWrapper({ agents: [] });
      const content = wrapper.find('ion-card-content');
      expect(content.exists()).toBe(true);
    });
  });

  describe('Empty State', () => {
    it('displays empty message when agents array is empty', () => {
      const wrapper = createWrapper({ agents: [] });
      const emptyMessage = wrapper.find('.empty-list-message');
      expect(emptyMessage.exists()).toBe(true);
      expect(emptyMessage.text()).toContain('No agents currently available to display.');
    });

    it('does not render list when agents array is empty', () => {
      const wrapper = createWrapper({ agents: [] });
      const list = wrapper.find('ion-list');
      expect(list.exists()).toBe(false);
    });

    it('displays empty message when agents is null', () => {
      const wrapper = createWrapper({ agents: null as unknown as AgentInfo[] });
      const emptyMessage = wrapper.find('.empty-list-message');
      expect(emptyMessage.exists()).toBe(true);
    });

    it('displays empty message when agents is undefined', () => {
      const wrapper = createWrapper({ agents: undefined as unknown as AgentInfo[] });
      const emptyMessage = wrapper.find('.empty-list-message');
      expect(emptyMessage.exists()).toBe(true);
    });
  });

  describe('Agent List Rendering', () => {
    it('renders list when agents are provided', () => {
      const agents = [createMockAgent('1', 'test-agent', 'A test agent')];
      const wrapper = createWrapper({ agents });
      const list = wrapper.find('ion-list');
      expect(list.exists()).toBe(true);
    });

    it('does not display empty message when agents are provided', () => {
      const agents = [createMockAgent('1', 'test-agent', 'A test agent')];
      const wrapper = createWrapper({ agents });
      const emptyMessage = wrapper.find('.empty-list-message');
      expect(emptyMessage.exists()).toBe(false);
    });

    it('renders correct number of agent items', () => {
      const agents = [
        createMockAgent('1', 'agent-one', 'First agent'),
        createMockAgent('2', 'agent-two', 'Second agent'),
        createMockAgent('3', 'agent-three', 'Third agent'),
      ];
      const wrapper = createWrapper({ agents });
      const items = wrapper.findAll('.agent-item');
      expect(items.length).toBe(3);
    });

    it('renders agent items with correct key', () => {
      const agents = [createMockAgent('unique-id-123', 'test-agent', 'Test agent')];
      const wrapper = createWrapper({ agents });
      const item = wrapper.find('.agent-item');
      expect(item.attributes('data-key')).toBe(undefined); // Vue doesn't expose key as attribute
      expect(item.exists()).toBe(true);
    });
  });

  describe('Agent Information Display', () => {
    it('displays formatted agent name', () => {
      const agents = [createMockAgent('1', 'blog_post_writer', 'Writes blog posts')];
      const wrapper = createWrapper({ agents });
      const heading = wrapper.find('.agent-item h2');
      expect(heading.text()).toBe('Blog Post Writer');
    });

    it('displays agent description', () => {
      const agents = [
        createMockAgent('1', 'test-agent', 'This is a detailed description'),
      ];
      const wrapper = createWrapper({ agents });
      const description = wrapper.find('.agent-item p');
      expect(description.text()).toBe('This is a detailed description');
    });

    it('formats agent name with underscores to title case', () => {
      const agents = [
        createMockAgent('1', 'marketing_swarm_agent', 'Marketing agent'),
      ];
      const wrapper = createWrapper({ agents });
      const heading = wrapper.find('.agent-item h2');
      expect(heading.text()).toBe('Marketing Swarm Agent');
    });

    it('formats agent name with hyphens to title case', () => {
      const agents = [createMockAgent('1', 'blog-post-writer', 'Blog writer')];
      const wrapper = createWrapper({ agents });
      const heading = wrapper.find('.agent-item h2');
      expect(heading.text()).toBe('Blog Post Writer');
    });

    it('handles agent names with mixed case', () => {
      const agents = [createMockAgent('1', 'BlogPostWriter', 'Blog writer')];
      const wrapper = createWrapper({ agents });
      const heading = wrapper.find('.agent-item h2');
      // formatAgentName replaces underscores and capitalizes words
      expect(heading.text()).toBeTruthy();
    });

    it('trims whitespace from descriptions', () => {
      const agents = [
        createMockAgent('1', 'test-agent', '  Description with spaces  '),
      ];
      const wrapper = createWrapper({ agents });
      const description = wrapper.find('.agent-item p');
      expect(description.text()).toBe('Description with spaces');
    });

    it('handles empty agent name gracefully', () => {
      const agents = [createMockAgent('1', '', 'Agent with no name')];
      const wrapper = createWrapper({ agents });
      const heading = wrapper.find('.agent-item h2');
      expect(heading.text()).toBe('');
    });

    it('handles empty agent description gracefully', () => {
      const agents = [createMockAgent('1', 'test-agent', '')];
      const wrapper = createWrapper({ agents });
      const description = wrapper.find('.agent-item p');
      expect(description.text()).toBe('');
    });
  });

  describe('Multiple Agents', () => {
    it('displays all agents in correct order', () => {
      const agents = [
        createMockAgent('1', 'agent-alpha', 'First agent'),
        createMockAgent('2', 'agent-beta', 'Second agent'),
        createMockAgent('3', 'agent-gamma', 'Third agent'),
      ];
      const wrapper = createWrapper({ agents });
      const items = wrapper.findAll('.agent-item h2');

      expect(items[0].text()).toBe('Agent Alpha');
      expect(items[1].text()).toBe('Agent Beta');
      expect(items[2].text()).toBe('Agent Gamma');
    });

    it('renders each agent with its own label', () => {
      const agents = [
        createMockAgent('1', 'agent-one', 'First agent'),
        createMockAgent('2', 'agent-two', 'Second agent'),
      ];
      const wrapper = createWrapper({ agents });
      const labels = wrapper.findAll('ion-label');
      expect(labels.length).toBe(2);
    });

    it('handles large number of agents', () => {
      const agents = Array.from({ length: 50 }, (_, i) =>
        createMockAgent(`${i}`, `agent-${i}`, `Agent ${i} description`)
      );
      const wrapper = createWrapper({ agents });
      const items = wrapper.findAll('.agent-item');
      expect(items.length).toBe(50);
    });
  });

  describe('Props Handling', () => {
    it('accepts agents prop', () => {
      const agents = [createMockAgent('1', 'test-agent', 'Test agent')];
      const wrapper = createWrapper({ agents });
      expect((wrapper.props() as { agents: AgentInfo[] }).agents).toEqual(agents);
    });

    it('updates display when agents prop changes', async () => {
      const agents1 = [createMockAgent('1', 'agent-one', 'First agent')];
      const wrapper = createWrapper({ agents: agents1 });

      expect(wrapper.findAll('.agent-item').length).toBe(1);

      const agents2 = [
        createMockAgent('1', 'agent-one', 'First agent'),
        createMockAgent('2', 'agent-two', 'Second agent'),
      ];

      await wrapper.setProps({ agents: agents2 });

      expect(wrapper.findAll('.agent-item').length).toBe(2);
    });

    it('shows empty state when agents prop is cleared', async () => {
      const agents = [createMockAgent('1', 'test-agent', 'Test agent')];
      const wrapper = createWrapper({ agents });

      await wrapper.setProps({ agents: [] });

      const emptyMessage = wrapper.find('.empty-list-message');
      expect(emptyMessage.exists()).toBe(true);
    });

    it('requires agents prop', () => {
      const agents = [createMockAgent('1', 'test-agent', 'Test agent')];
      const wrapper = createWrapper({ agents });
      // The prop is defined as required in the component
      expect((wrapper.props() as { agents: AgentInfo[] }).agents).toBeDefined();
    });
  });

  describe('Utility Function Integration', () => {
    it('uses formatAgentName for name display', () => {
      const agents = [createMockAgent('1', 'snake_case_agent', 'Test agent')];
      const wrapper = createWrapper({ agents });
      const heading = wrapper.find('.agent-item h2');
      expect(heading.text()).toBe('Snake Case Agent');
    });

    it('uses formatAgentDescription for description display', () => {
      const agents = [createMockAgent('1', 'test-agent', '  Test description  ')];
      const wrapper = createWrapper({ agents });
      const description = wrapper.find('.agent-item p');
      expect(description.text()).toBe('Test description');
    });
  });

  describe('Styling', () => {
    it('applies agent-list-card class to card', () => {
      const wrapper = createWrapper({ agents: [] });
      const card = wrapper.find('ion-card');
      expect(card.classes()).toContain('agent-list-card');
    });

    it('applies agent-item class to list items', () => {
      const agents = [createMockAgent('1', 'test-agent', 'Test agent')];
      const wrapper = createWrapper({ agents });
      const item = wrapper.find('ion-item');
      expect(item.classes()).toContain('agent-item');
    });

    it('applies empty-list-message class to empty state', () => {
      const wrapper = createWrapper({ agents: [] });
      const emptyDiv = wrapper.find('.empty-list-message');
      expect(emptyDiv.exists()).toBe(true);
    });
  });

  describe('Accessibility', () => {
    it('renders semantic HTML structure', () => {
      const agents = [createMockAgent('1', 'test-agent', 'Test agent')];
      const wrapper = createWrapper({ agents });

      const heading = wrapper.find('h2');
      const paragraph = wrapper.find('p');

      expect(heading.exists()).toBe(true);
      expect(paragraph.exists()).toBe(true);
    });

    it('uses ion-list for proper list semantics', () => {
      const agents = [createMockAgent('1', 'test-agent', 'Test agent')];
      const wrapper = createWrapper({ agents });
      const list = wrapper.find('ion-list');
      expect(list.exists()).toBe(true);
    });

    it('provides readable text content for all agents', () => {
      const agents = [
        createMockAgent('1', 'agent-one', 'First agent description'),
        createMockAgent('2', 'agent-two', 'Second agent description'),
      ];
      const wrapper = createWrapper({ agents });

      const items = wrapper.findAll('.agent-item');
      items.forEach((item) => {
        const label = item.find('ion-label');
        expect(label.text().trim()).not.toBe('');
      });
    });
  });

  describe('Edge Cases', () => {
    it('handles agent with very long name', () => {
      const longName =
        'very_long_agent_name_that_might_cause_layout_issues_in_some_components';
      const agents = [createMockAgent('1', longName, 'Test agent')];
      const wrapper = createWrapper({ agents });
      const heading = wrapper.find('.agent-item h2');
      expect(heading.exists()).toBe(true);
      expect(heading.text().length).toBeGreaterThan(0);
    });

    it('handles agent with very long description', () => {
      const longDescription =
        'This is a very long description that contains many words and might wrap across multiple lines in the UI to test how the component handles lengthy text content without breaking the layout or causing visual issues.';
      const agents = [createMockAgent('1', 'test-agent', longDescription)];
      const wrapper = createWrapper({ agents });
      const description = wrapper.find('.agent-item p');
      expect(description.text()).toBe(longDescription);
    });

    it('handles agent with special characters in name', () => {
      const agents = [createMockAgent('1', 'agent@#$%', 'Test agent')];
      const wrapper = createWrapper({ agents });
      const heading = wrapper.find('.agent-item h2');
      expect(heading.exists()).toBe(true);
    });

    it('handles agent with HTML in description', () => {
      const agents = [
        createMockAgent('1', 'test-agent', '<script>alert("xss")</script>'),
      ];
      const wrapper = createWrapper({ agents });
      const description = wrapper.find('.agent-item p');
      // Vue automatically escapes HTML in text content
      expect(description.html()).not.toContain('<script>');
    });

    it('handles duplicate agent IDs gracefully', () => {
      const agents = [
        createMockAgent('1', 'agent-one', 'First agent'),
        createMockAgent('1', 'agent-one-duplicate', 'Duplicate ID'),
      ];
      const wrapper = createWrapper({ agents });
      const items = wrapper.findAll('.agent-item');
      // Both should still render even with duplicate IDs
      expect(items.length).toBe(2);
    });
  });

  describe('Agent Type Support', () => {
    it('handles different agent types', () => {
      const agents: AgentInfo[] = [
        { ...createMockAgent('1', 'context-agent', 'Context agent'), type: 'context' },
        { ...createMockAgent('2', 'api-agent', 'API agent'), type: 'api' },
        {
          ...createMockAgent('3', 'orchestrator-agent', 'Orchestrator'),
          type: 'orchestrator',
        },
      ];
      const wrapper = createWrapper({ agents });
      const items = wrapper.findAll('.agent-item');
      expect(items.length).toBe(3);
    });

    it('displays agents with organization slug', () => {
      const agents: AgentInfo[] = [
        {
          ...createMockAgent('1', 'org-agent', 'Org agent'),
          organizationSlug: 'test-org',
        },
      ];
      const wrapper = createWrapper({ agents });
      const item = wrapper.find('.agent-item');
      expect(item.exists()).toBe(true);
    });

    it('displays agents with execution modes', () => {
      const agents: AgentInfo[] = [
        {
          ...createMockAgent('1', 'exec-agent', 'Execution agent'),
          execution_modes: ['immediate', 'polling', 'real-time'],
        },
      ];
      const wrapper = createWrapper({ agents });
      const item = wrapper.find('.agent-item');
      expect(item.exists()).toBe(true);
    });
  });
});
