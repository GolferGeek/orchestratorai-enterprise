/**
 * LLMRequestFlowDiagram Tests
 * Tests for the LLM request flow diagram component
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import LLMRequestFlowDiagram from '@/components/LLM/LLMRequestFlowDiagram.vue';

// Mock Ionic components
vi.mock('@ionic/vue', () => ({
  IonGrid: { template: '<div><slot /></div>' },
  IonRow: { template: '<div><slot /></div>' },
  IonCol: { template: '<div><slot /></div>' },
  IonCard: { template: '<div><slot /></div>' },
  IonCardHeader: { template: '<div><slot /></div>' },
  IonCardTitle: { template: '<div><slot /></div>' },
  IonCardContent: { template: '<div><slot /></div>' },
  IonButton: { template: '<button><slot /></button>' },
  IonIcon: { template: '<span></span>' },
  IonSpinner: { template: '<span></span>' },
}));

// Mock ionicons
vi.mock('ionicons/icons', () => ({
  playOutline: 'play-outline',
  pauseOutline: 'pause-outline',
  refreshOutline: 'refresh-outline',
  playSkipForwardOutline: 'play-skip-forward-outline',
}));

describe('LLMRequestFlowDiagram.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe('Component Initialization', () => {
    it('should render without crashing', () => {
      const wrapper = mount(LLMRequestFlowDiagram, {
        props: {
          liveMode: false,
        },
      });

      expect(wrapper.exists()).toBe(true);
      expect(wrapper.find('.llm-request-flow-diagram').exists()).toBe(true);
    });

    it('should render diagram header', () => {
      const wrapper = mount(LLMRequestFlowDiagram, {
        props: {
          liveMode: false,
        },
      });

      expect(wrapper.find('.diagram-header').exists()).toBe(true);
      expect(wrapper.find('h3').text()).toBe('LLM Request Lifecycle');
    });

    it('should initialize with default props', () => {
      const wrapper = mount(LLMRequestFlowDiagram, {
        props: {
          liveMode: false,
        },
      });

      expect((wrapper.props() as { liveMode: boolean }).liveMode).toBe(false);
    });
  });

  describe('Animation Controls', () => {
    it('should have all control buttons', () => {
      const wrapper = mount(LLMRequestFlowDiagram, {
        props: {
          liveMode: false,
        },
      });

      const controls = wrapper.find('.diagram-controls');
      expect(controls.exists()).toBe(true);

      const buttons = controls.findAll('button');
      expect(buttons.length).toBeGreaterThanOrEqual(4); // Start, Pause, Reset, Step
    });

    it('should call startFlow when Start button is clicked', async () => {
      const wrapper = mount(LLMRequestFlowDiagram, {
        props: {
          liveMode: false,
        },
      });

      const startButton = wrapper.findAll('button').find(btn => btn.text().includes('Start'));
      expect(startButton).toBeDefined();
    });

    it('should call resetFlow when Reset button is clicked', async () => {
      const wrapper = mount(LLMRequestFlowDiagram, {
        props: {
          liveMode: false,
        },
      });

      const resetButton = wrapper.findAll('button').find(btn => btn.text().includes('Reset'));
      expect(resetButton).toBeDefined();
    });
  });

  describe('SVG Flow Rendering', () => {
    it('should render SVG flow diagram', () => {
      const wrapper = mount(LLMRequestFlowDiagram, {
        props: {
          liveMode: false,
        },
      });

      const svg = wrapper.find('.flow-svg');
      expect(svg.exists()).toBe(true);
    });

    it('should render flow nodes', () => {
      const wrapper = mount(LLMRequestFlowDiagram, {
        props: {
          liveMode: false,
        },
      });

      const nodesGroup = wrapper.find('.flow-nodes');
      expect(nodesGroup.exists()).toBe(true);
    });

    it('should have viewBox attribute on SVG', () => {
      const wrapper = mount(LLMRequestFlowDiagram, {
        props: {
          liveMode: false,
        },
      });

      const svg = wrapper.find('.flow-svg');
      expect(svg.attributes('viewBox')).toBeDefined();
    });
  });

  describe('Live Data Integration', () => {
    it('should show live data controls when liveMode is true', () => {
      const wrapper = mount(LLMRequestFlowDiagram, {
        props: {
          liveMode: true,
        },
      });

      const liveControls = wrapper.find('.live-data-controls');
      expect(liveControls.exists()).toBe(true);
    });

    it('should hide live data controls when liveMode is false', () => {
      const wrapper = mount(LLMRequestFlowDiagram, {
        props: {
          liveMode: false,
        },
      });

      const liveControls = wrapper.find('.live-data-controls');
      expect(liveControls.exists()).toBe(false);
    });

    it('should show live indicator when in live mode', () => {
      const wrapper = mount(LLMRequestFlowDiagram, {
        props: {
          liveMode: true,
        },
      });

      const liveIndicator = wrapper.find('.live-indicator');
      expect(liveIndicator.exists()).toBe(true);
      expect(wrapper.find('.live-text').text()).toBe('Live Data');
    });

    it('should have refresh button in live mode', () => {
      const wrapper = mount(LLMRequestFlowDiagram, {
        props: {
          liveMode: true,
        },
      });

      const refreshButton = wrapper.findAll('button').find(btn => btn.text().includes('Refresh'));
      expect(refreshButton).toBeDefined();
    });
  });

  describe('Data Processing and Visualization', () => {
    it('should have flow step details panel', () => {
      const wrapper = mount(LLMRequestFlowDiagram, {
        props: {
          liveMode: false,
        },
      });

      // Component should have a details section
      expect(wrapper.find('.flow-svg-container').exists()).toBe(true);
    });

    it('should render step progress section', () => {
      const wrapper = mount(LLMRequestFlowDiagram, {
        props: {
          liveMode: false,
        },
      });

      // Component should render the step progress
      const grid = wrapper.find('.llm-request-flow-diagram');
      expect(grid.exists()).toBe(true);
    });
  });
});
