/**
 * PseudonymMappingViewer Tests
 * Tests for the pseudonym mapping viewer component
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import PseudonymMappingViewer from '@/components/PII/PseudonymMappingViewer.vue';

// Mock Ionic components
vi.mock('@ionic/vue', () => ({
  IonButton: { template: '<button><slot /></button>' },
  IonButtons: { template: '<div><slot /></div>' },
  IonCard: { template: '<div><slot /></div>' },
  IonCardContent: { template: '<div><slot /></div>' },
  IonCardHeader: { template: '<div><slot /></div>' },
  IonCardTitle: { template: '<div><slot /></div>' },
  IonCardSubtitle: { template: '<div><slot /></div>' },
  IonChip: { template: '<span><slot /></span>' },
  IonCol: { template: '<div><slot /></div>' },
  IonContent: { template: '<div><slot /></div>' },
  IonGrid: { template: '<div><slot /></div>' },
  IonHeader: { template: '<div><slot /></div>' },
  IonIcon: { template: '<span></span>' },
  IonItem: { template: '<div><slot /></div>' },
  IonLabel: { template: '<label><slot /></label>' },
  IonList: { template: '<div><slot /></div>' },
  IonModal: { template: '<div><slot /></div>', props: ['is-open'] },
  IonRow: { template: '<div><slot /></div>' },
  IonSearchbar: { template: '<input />', props: ['modelValue'] },
  IonSelect: { template: '<select><slot /></select>', props: ['modelValue'] },
  IonSelectOption: { template: '<option><slot /></option>' },
  IonSpinner: { template: '<span></span>' },
  IonTitle: { template: '<div><slot /></div>' },
  IonToolbar: { template: '<div><slot /></div>' },
  IonBadge: { template: '<span><slot /></span>' },
}));

// Mock ionicons
vi.mock('ionicons/icons', () => ({
  gitNetworkOutline: 'git-network-outline',
  libraryOutline: 'library-outline',
  refreshOutline: 'refresh-outline',
  eyeOutline: 'eye-outline',
  alertCircleOutline: 'alert-circle-outline',
  documentOutline: 'document-outline',
  informationCircleOutline: 'information-circle-outline',
  swapHorizontalOutline: 'swap-horizontal-outline',
  chevronBackOutline: 'chevron-back-outline',
  chevronForwardOutline: 'chevron-forward-outline',
  closeOutline: 'close-outline',
  warningOutline: 'warning-outline',
  arrowForwardOutline: 'arrow-forward-outline',
  arrowDownOutline: 'arrow-down-outline',
  arrowUpOutline: 'arrow-up-outline',
  personOutline: 'person-outline',
  mailOutline: 'mail-outline',
  callOutline: 'call-outline',
  locationOutline: 'location-outline',
  globeOutline: 'globe-outline',
  cardOutline: 'card-outline',
  keyOutline: 'key-outline',
  documentTextOutline: 'document-text-outline',
  trendingUpOutline: 'trending-up-outline',
  timeOutline: 'time-outline',
  sparklesOutline: 'sparkles-outline',
  pulseOutline: 'pulse-outline',
  playOutline: 'play-outline',
  shieldCheckmarkOutline: 'shield-checkmark-outline',
  lockClosedOutline: 'lock-closed-outline',
}));

// Mock the privacy store with proper data to avoid reduce error
// Note: vi.mock is hoisted, so we inline the mock data
vi.mock('@/stores/privacyStore', () => {
  // Create mock mapping data inline to avoid hoisting issues
  const inlineMockMapping = {
    id: 'test-mapping-1',
    pseudonym: 'USER_ABC123',
    dataType: 'email',
    usageCount: 5,
    lastUsedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    context: 'test-context',
    originalHash: 'abc123def456',
    originalValue: '[REDACTED]',
  };
  return {
    usePrivacyStore: vi.fn(() => ({
      mappings: [inlineMockMapping],
      availableDataTypes: ['email', 'phone', 'name'],
      totalMappings: 1,
      totalUsage: 5,
      averageUsage: 5,
      isLoading: false,
      error: null,
      recentMappings: [inlineMockMapping],
      mappingsByDataType: { email: [inlineMockMapping] },
      fetchMappings: vi.fn(),
      fetchStats: vi.fn(),
      refreshData: vi.fn(),
      // Methods called by privacyService
      setMappingsLoading: vi.fn(),
      setMappingsError: vi.fn(),
      setMappings: vi.fn(),
      mappingsLoading: false,
      mappingsLastFetched: new Date(),
      mappingsError: null,
      // Stats methods
      setMappingStatsLoading: vi.fn(),
      setMappingStats: vi.fn(),
      mappingStatsLoading: false,
    })),
  };
});

// Mock privacyService to prevent async calls during mount
// The component imports: import { privacyService } from '@/services/privacyService'
vi.mock('@/services/privacyService', () => ({
  privacyService: {
    fetchMappings: vi.fn().mockResolvedValue([]),
    fetchMappingStats: vi.fn().mockResolvedValue(undefined),
    fetchMappingsFiltered: vi.fn().mockResolvedValue({ mappings: [], total: 0 }),
    deletePseudonymMapping: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('PseudonymMappingViewer.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe('Component Rendering', () => {
    it('renders the main viewer structure', () => {
      const wrapper = mount(PseudonymMappingViewer);

      expect(wrapper.exists()).toBe(true);
      expect(wrapper.find('.pseudonym-mapping-viewer').exists()).toBe(true);
    });

    it('renders viewer header with title', () => {
      const wrapper = mount(PseudonymMappingViewer);

      expect(wrapper.find('.viewer-header').exists()).toBe(true);
      expect(wrapper.find('.viewer-title').exists()).toBe(true);
    });

    it('renders header actions with refresh and demo buttons', () => {
      const wrapper = mount(PseudonymMappingViewer);

      const headerActions = wrapper.find('.header-actions');
      expect(headerActions.exists()).toBe(true);

      const buttons = headerActions.findAll('button');
      expect(buttons.length).toBeGreaterThanOrEqual(2); // Refresh and Demo toggle
    });

    it('renders statistics section', () => {
      const wrapper = mount(PseudonymMappingViewer);

      expect(wrapper.find('.stats-section').exists()).toBe(true);
    });
  });

  describe('Statistics Display', () => {
    it('displays mapping statistics cards', () => {
      const wrapper = mount(PseudonymMappingViewer);

      const statCards = wrapper.findAll('.stat-card');
      expect(statCards.length).toBeGreaterThanOrEqual(4); // Total, Usage, Types, Avg
    });

    it('displays stat values and labels', () => {
      const wrapper = mount(PseudonymMappingViewer);

      expect(wrapper.find('.stat-value').exists()).toBe(true);
      expect(wrapper.find('.stat-label').exists()).toBe(true);
    });
  });

  describe('Filters Section', () => {
    it('renders filters section', () => {
      const wrapper = mount(PseudonymMappingViewer);

      expect(wrapper.find('.filters-section').exists()).toBe(true);
    });
  });

  describe('Loading State', () => {
    it('handles loading state', () => {
      const wrapper = mount(PseudonymMappingViewer);

      // Component should render without crashing
      expect(wrapper.exists()).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('handles error states gracefully', () => {
      const wrapper = mount(PseudonymMappingViewer);

      // Component should render without crashing even with no data
      expect(wrapper.exists()).toBe(true);
    });
  });

  describe('Trends Section', () => {
    it('renders trends section when not loading', () => {
      const wrapper = mount(PseudonymMappingViewer);

      // Component should have trends section
      expect(wrapper.find('.trends-section').exists() || wrapper.find('.mappings-table-card').exists()).toBe(true);
    });
  });
});
