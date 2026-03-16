/**
 * Unit Tests for Plan Store
 * Tests pure state management for plans and versions
 *
 * Key Testing Areas:
 * - Store initialization
 * - Plan mutations (add, update, delete)
 * - Plan version management
 * - Conversation-plan associations
 * - Getters and computed properties
 * - Loading and error states
 * - Clear operations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { usePlanStore } from '../planStore';
import type { PlanData, PlanVersionData } from '@orchestrator-ai/transport-types';

describe('PlanStore', () => {
  beforeEach(() => {
    // Create a fresh pinia instance for each test
    setActivePinia(createPinia());
  });

  describe('Store Initialization', () => {
    it('should initialize with empty state', () => {
      const store = usePlanStore();

      expect(store.allPlans).toEqual([]);
      expect(store.isLoading).toBe(false);
      expect(store.error).toBeNull();
    });
  });

  describe('Plan Mutations', () => {
    it('should add plan', () => {
      const store = usePlanStore();

      const plan: PlanData = {
        id: 'plan-1',
        title: 'Test Plan',
        conversationId: 'conv-1',
        userId: 'user-1',
        agentName: 'test-agent',
        organization: 'test-org',
        currentVersionId: 'version-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.addPlan(plan);

      expect(store.planById('plan-1')).toEqual(plan);
      expect(store.allPlans).toHaveLength(1);
      expect(store.allPlans[0]).toEqual(plan);
    });

    it('should add plan with version', () => {
      const store = usePlanStore();

      const plan: PlanData = {
        id: 'plan-1',
        title: 'Test Plan',
        conversationId: 'conv-1',
        userId: 'user-1',
        agentName: 'test-agent',
        organization: 'test-org',
        currentVersionId: 'version-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const version: PlanVersionData = {
        id: 'version-1',
        planId: 'plan-1',
        versionNumber: 1,
        content: JSON.stringify({ tasks: [] }),
        format: 'json',
        createdByType: 'agent',
        createdById: 'agent-1',
        isCurrentVersion: true,
        createdAt: new Date().toISOString(),
      };

      store.addPlan(plan, version);

      expect(store.planById('plan-1')).toEqual(plan);
      expect(store.versionsByPlanId('plan-1')).toHaveLength(1);
      expect(store.versionsByPlanId('plan-1')[0]).toEqual(version);
    });

    it('should update existing plan', () => {
      const store = usePlanStore();

      const plan: PlanData = {
        id: 'plan-1',
        title: 'Original Title',
        conversationId: 'conv-1',
        userId: 'user-1',
        agentName: 'test-agent',
        organization: 'test-org',
        currentVersionId: 'version-1',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      store.addPlan(plan);

      const originalUpdatedAt = plan.updatedAt;

      store.updatePlan('plan-1', {
        title: 'Updated Title',
        agentName: 'updated-agent',
      });

      const updated = store.planById('plan-1');
      expect(updated?.title).toBe('Updated Title');
      expect(updated?.agentName).toBe('updated-agent');
      expect(updated?.organization).toBe('test-org');
      expect(updated?.updatedAt).not.toBe(originalUpdatedAt);
    });

    it('should not update non-existent plan', () => {
      const store = usePlanStore();

      store.updatePlan('non-existent', { title: 'Updated' });

      expect(store.planById('non-existent')).toBeUndefined();
    });

    it('should delete plan and its versions', () => {
      const store = usePlanStore();

      const plan: PlanData = {
        id: 'plan-1',
        title: 'Test Plan',
        conversationId: 'conv-1',
        userId: 'user-1',
        agentName: 'test-agent',
        organization: 'test-org',
        currentVersionId: 'version-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const version: PlanVersionData = {
        id: 'version-1',
        planId: 'plan-1',
        versionNumber: 1,
        content: JSON.stringify({ tasks: [] }),
        format: 'json',
        createdByType: 'agent',
        createdById: 'agent-1',
        isCurrentVersion: true,
        createdAt: new Date().toISOString(),
      };

      store.addPlan(plan, version);

      expect(store.planById('plan-1')).toBeTruthy();
      expect(store.versionsByPlanId('plan-1')).toHaveLength(1);

      store.deletePlan('plan-1');

      expect(store.planById('plan-1')).toBeUndefined();
      expect(store.versionsByPlanId('plan-1')).toHaveLength(0);
    });
  });

  describe('Plan Version Management', () => {
    it('should add version to plan', () => {
      const store = usePlanStore();

      const plan: PlanData = {
        id: 'plan-1',
        title: 'Test Plan',
        conversationId: 'conv-1',
        userId: 'user-1',
        agentName: 'test-agent',
        organization: 'test-org',
        currentVersionId: 'version-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.addPlan(plan);

      const version1: PlanVersionData = {
        id: 'version-1',
        planId: 'plan-1',
        versionNumber: 1,
        content: JSON.stringify({ tasks: [] }),
        format: 'json',
        createdByType: 'agent',
        createdById: 'agent-1',
        isCurrentVersion: false,
        createdAt: new Date().toISOString(),
      };

      const version2: PlanVersionData = {
        id: 'version-2',
        planId: 'plan-1',
        versionNumber: 2,
        content: JSON.stringify({ tasks: [{ id: '1', title: 'Task 1' }] }),
        format: 'json',
        createdByType: 'agent',
        createdById: 'agent-1',
        isCurrentVersion: true,
        createdAt: new Date().toISOString(),
      };

      store.addVersion('plan-1', version1);
      store.addVersion('plan-1', version2);

      const versions = store.versionsByPlanId('plan-1');
      expect(versions).toHaveLength(2);
      expect(versions[0].id).toBe('version-1');
      expect(versions[1].id).toBe('version-2');
    });

    it('should update existing version when adding duplicate', () => {
      const store = usePlanStore();

      const plan: PlanData = {
        id: 'plan-1',
        title: 'Test Plan',
        conversationId: 'conv-1',
        userId: 'user-1',
        agentName: 'test-agent',
        organization: 'test-org',
        currentVersionId: 'version-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.addPlan(plan);

      const version1: PlanVersionData = {
        id: 'version-1',
        planId: 'plan-1',
        versionNumber: 1,
        content: JSON.stringify({ tasks: [] }),
        format: 'json',
        createdByType: 'agent',
        createdById: 'agent-1',
        isCurrentVersion: true,
        createdAt: new Date().toISOString(),
      };

      store.addVersion('plan-1', version1);

      const updatedVersion1: PlanVersionData = {
        ...version1,
        content: JSON.stringify({ tasks: [{ id: '1', title: 'Updated Task' }] }),
      };

      store.addVersion('plan-1', updatedVersion1);

      const versions = store.versionsByPlanId('plan-1');
      expect(versions).toHaveLength(1);
      expect(versions[0].content).toEqual(JSON.stringify({ tasks: [{ id: '1', title: 'Updated Task' }] }));
    });

    it('should set current version', () => {
      const store = usePlanStore();

      const plan: PlanData = {
        id: 'plan-1',
        title: 'Test Plan',
        conversationId: 'conv-1',
        userId: 'user-1',
        agentName: 'test-agent',
        organization: 'test-org',
        currentVersionId: 'version-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const version: PlanVersionData = {
        id: 'version-1',
        planId: 'plan-1',
        versionNumber: 1,
        content: JSON.stringify({ tasks: [] }),
        format: 'json',
        createdByType: 'agent',
        createdById: 'agent-1',
        isCurrentVersion: true,
        createdAt: new Date().toISOString(),
      };

      store.addPlan(plan, version);

      store.setCurrentVersion('plan-1', 'version-1');

      expect(store.currentVersion('plan-1')).toEqual(version);

      const updatedPlan = store.planById('plan-1');
      expect(updatedPlan?.currentVersionId).toBe('version-1');
    });

    it('should return undefined for current version if not set', () => {
      const store = usePlanStore();

      expect(store.currentVersion('plan-1')).toBeUndefined();
    });

    it('should delete version', () => {
      const store = usePlanStore();

      const plan: PlanData = {
        id: 'plan-1',
        title: 'Test Plan',
        conversationId: 'conv-1',
        userId: 'user-1',
        agentName: 'test-agent',
        organization: 'test-org',
        currentVersionId: 'version-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const version1: PlanVersionData = {
        id: 'version-1',
        planId: 'plan-1',
        versionNumber: 1,
        content: JSON.stringify({ tasks: [] }),
        format: 'json',
        createdByType: 'agent',
        createdById: 'agent-1',
        isCurrentVersion: false,
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      const version2: PlanVersionData = {
        id: 'version-2',
        planId: 'plan-1',
        versionNumber: 2,
        content: JSON.stringify({ tasks: [] }),
        format: 'json',
        createdByType: 'agent',
        createdById: 'agent-1',
        isCurrentVersion: true,
        createdAt: '2024-01-02T00:00:00.000Z',
      };

      store.addPlan(plan);
      store.addVersion('plan-1', version1);
      store.addVersion('plan-1', version2);

      expect(store.versionsByPlanId('plan-1')).toHaveLength(2);

      store.deleteVersion('plan-1', 'version-1');

      const versions = store.versionsByPlanId('plan-1');
      expect(versions).toHaveLength(1);
      expect(versions[0].id).toBe('version-2');
    });

    it('should set latest version as current when deleting current version', () => {
      const store = usePlanStore();

      const plan: PlanData = {
        id: 'plan-1',
        title: 'Test Plan',
        conversationId: 'conv-1',
        userId: 'user-1',
        agentName: 'test-agent',
        organization: 'test-org',
        currentVersionId: 'version-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const version1: PlanVersionData = {
        id: 'version-1',
        planId: 'plan-1',
        versionNumber: 1,
        content: JSON.stringify({ tasks: [] }),
        format: 'json',
        createdByType: 'agent',
        createdById: 'agent-1',
        isCurrentVersion: true,
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      const version2: PlanVersionData = {
        id: 'version-2',
        planId: 'plan-1',
        versionNumber: 2,
        content: JSON.stringify({ tasks: [] }),
        format: 'json',
        createdByType: 'agent',
        createdById: 'agent-1',
        isCurrentVersion: false,
        createdAt: '2024-01-02T00:00:00.000Z',
      };

      store.addPlan(plan);
      store.addVersion('plan-1', version1);
      store.addVersion('plan-1', version2);

      store.setCurrentVersion('plan-1', 'version-1');

      store.deleteVersion('plan-1', 'version-1');

      // Should automatically set version-2 as current (latest)
      expect(store.currentVersion('plan-1')?.id).toBe('version-2');
    });
  });

  describe('Conversation-Plan Associations', () => {
    it('should associate plan with conversation', () => {
      const store = usePlanStore();

      const plan: PlanData = {
        id: 'plan-1',
        title: 'Test Plan',
        conversationId: 'conv-1',
        userId: 'user-1',
        agentName: 'test-agent',
        organization: 'test-org',
        currentVersionId: 'version-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.addPlan(plan);
      store.associatePlanWithConversation('plan-1', 'conv-1');

      const plans = store.plansByConversationId('conv-1');
      expect(plans).toHaveLength(1);
      expect(plans[0].id).toBe('plan-1');
    });

    it('should not duplicate plan association', () => {
      const store = usePlanStore();

      const plan: PlanData = {
        id: 'plan-1',
        title: 'Test Plan',
        conversationId: 'conv-1',
        userId: 'user-1',
        agentName: 'test-agent',
        organization: 'test-org',
        currentVersionId: 'version-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.addPlan(plan);
      store.associatePlanWithConversation('plan-1', 'conv-1');
      store.associatePlanWithConversation('plan-1', 'conv-1');

      const plans = store.plansByConversationId('conv-1');
      expect(plans).toHaveLength(1);
    });

    it('should get plans by conversation ID sorted by updatedAt', () => {
      const store = usePlanStore();

      const plan1: PlanData = {
        id: 'plan-1',
        title: 'Plan 1',
        conversationId: 'conv-1',
        userId: 'user-1',
        agentName: 'test-agent',
        organization: 'test-org',
        currentVersionId: 'version-1',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      const plan2: PlanData = {
        id: 'plan-2',
        title: 'Plan 2',
        conversationId: 'conv-1',
        userId: 'user-1',
        agentName: 'test-agent',
        organization: 'test-org',
        currentVersionId: 'version-2',
        createdAt: '2024-01-02T00:00:00.000Z',
        updatedAt: '2024-01-03T00:00:00.000Z',
      };

      store.addPlan(plan1);
      store.addPlan(plan2);
      store.associatePlanWithConversation('plan-1', 'conv-1');
      store.associatePlanWithConversation('plan-2', 'conv-1');

      const plans = store.plansByConversationId('conv-1');
      expect(plans).toHaveLength(2);
      // Should be sorted by updatedAt descending
      expect(plans[0].id).toBe('plan-2');
      expect(plans[1].id).toBe('plan-1');
    });

    it('should clear all plans for conversation', () => {
      const store = usePlanStore();

      const plan1: PlanData = {
        id: 'plan-1',
        title: 'Plan 1',
        conversationId: 'conv-1',
        userId: 'user-1',
        agentName: 'test-agent',
        organization: 'test-org',
        currentVersionId: 'version-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const plan2: PlanData = {
        id: 'plan-2',
        title: 'Plan 2',
        conversationId: 'conv-1',
        userId: 'user-1',
        agentName: 'test-agent',
        organization: 'test-org',
        currentVersionId: 'version-2',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.addPlan(plan1);
      store.addPlan(plan2);
      store.associatePlanWithConversation('plan-1', 'conv-1');
      store.associatePlanWithConversation('plan-2', 'conv-1');

      expect(store.plansByConversationId('conv-1')).toHaveLength(2);

      store.clearPlansByConversation('conv-1');

      expect(store.plansByConversationId('conv-1')).toHaveLength(0);
      expect(store.planById('plan-1')).toBeUndefined();
      expect(store.planById('plan-2')).toBeUndefined();
    });

    it('should remove conversation association when deleting plan', () => {
      const store = usePlanStore();

      const plan1: PlanData = {
        id: 'plan-1',
        title: 'Plan 1',
        conversationId: 'conv-1',
        userId: 'user-1',
        agentName: 'test-agent',
        organization: 'test-org',
        currentVersionId: 'version-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const plan2: PlanData = {
        id: 'plan-2',
        title: 'Plan 2',
        conversationId: 'conv-1',
        userId: 'user-1',
        agentName: 'test-agent',
        organization: 'test-org',
        currentVersionId: 'version-2',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.addPlan(plan1);
      store.addPlan(plan2);
      store.associatePlanWithConversation('plan-1', 'conv-1');
      store.associatePlanWithConversation('plan-2', 'conv-1');

      store.deletePlan('plan-1');

      const plans = store.plansByConversationId('conv-1');
      expect(plans).toHaveLength(1);
      expect(plans[0].id).toBe('plan-2');
    });
  });

  describe('Getters', () => {
    it('should get plan by ID', () => {
      const store = usePlanStore();

      const plan: PlanData = {
        id: 'plan-1',
        title: 'Test Plan',
        conversationId: 'conv-1',
        userId: 'user-1',
        agentName: 'test-agent',
        organization: 'test-org',
        currentVersionId: 'version-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.addPlan(plan);

      expect(store.planById('plan-1')).toEqual(plan);
      expect(store.planById('non-existent')).toBeUndefined();
    });

    it('should get all plans sorted by updatedAt', () => {
      const store = usePlanStore();

      const plan1: PlanData = {
        id: 'plan-1',
        title: 'Plan 1',
        conversationId: 'conv-1',
        userId: 'user-1',
        agentName: 'test-agent',
        organization: 'test-org',
        currentVersionId: 'version-1',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      const plan2: PlanData = {
        id: 'plan-2',
        title: 'Plan 2',
        conversationId: 'conv-2',
        userId: 'user-1',
        agentName: 'test-agent',
        organization: 'test-org',
        currentVersionId: 'version-2',
        createdAt: '2024-01-02T00:00:00.000Z',
        updatedAt: '2024-01-03T00:00:00.000Z',
      };

      store.addPlan(plan1);
      store.addPlan(plan2);

      const allPlans = store.allPlans;
      expect(allPlans).toHaveLength(2);
      // Sorted by updatedAt descending
      expect(allPlans[0].id).toBe('plan-2');
      expect(allPlans[1].id).toBe('plan-1');
    });

    it('should get versions by plan ID', () => {
      const store = usePlanStore();

      expect(store.versionsByPlanId('non-existent')).toEqual([]);

      const plan: PlanData = {
        id: 'plan-1',
        title: 'Test Plan',
        conversationId: 'conv-1',
        userId: 'user-1',
        agentName: 'test-agent',
        organization: 'test-org',
        currentVersionId: 'version-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const version: PlanVersionData = {
        id: 'version-1',
        planId: 'plan-1',
        versionNumber: 1,
        content: JSON.stringify({ tasks: [] }),
        format: 'json',
        createdByType: 'agent',
        createdById: 'agent-1',
        isCurrentVersion: true,
        createdAt: new Date().toISOString(),
      };

      store.addPlan(plan, version);

      expect(store.versionsByPlanId('plan-1')).toHaveLength(1);
    });
  });

  describe('Loading and Error States', () => {
    it('should manage loading state', () => {
      const store = usePlanStore();

      expect(store.isLoading).toBe(false);

      store.setLoading(true);
      expect(store.isLoading).toBe(true);

      store.setLoading(false);
      expect(store.isLoading).toBe(false);
    });

    it('should manage error state', () => {
      const store = usePlanStore();

      expect(store.error).toBeNull();

      store.setError('Test error message');
      expect(store.error).toBe('Test error message');

      store.clearError();
      expect(store.error).toBeNull();
    });
  });

  describe('Clear Operations', () => {
    it('should clear all plans', () => {
      const store = usePlanStore();

      const plan1: PlanData = {
        id: 'plan-1',
        title: 'Plan 1',
        conversationId: 'conv-1',
        userId: 'user-1',
        agentName: 'test-agent',
        organization: 'test-org',
        currentVersionId: 'version-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const plan2: PlanData = {
        id: 'plan-2',
        title: 'Plan 2',
        conversationId: 'conv-2',
        userId: 'user-1',
        agentName: 'test-agent',
        organization: 'test-org',
        currentVersionId: 'version-2',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const version: PlanVersionData = {
        id: 'version-1',
        planId: 'plan-1',
        versionNumber: 1,
        content: JSON.stringify({ tasks: [] }),
        format: 'json',
        createdByType: 'agent',
        createdById: 'agent-1',
        isCurrentVersion: true,
        createdAt: new Date().toISOString(),
      };

      store.addPlan(plan1, version);
      store.addPlan(plan2);
      store.associatePlanWithConversation('plan-1', 'conv-1');
      store.associatePlanWithConversation('plan-2', 'conv-2');

      expect(store.allPlans).toHaveLength(2);

      store.clearAll();

      expect(store.allPlans).toHaveLength(0);
      expect(store.planById('plan-1')).toBeUndefined();
      expect(store.planById('plan-2')).toBeUndefined();
      expect(store.versionsByPlanId('plan-1')).toHaveLength(0);
      expect(store.plansByConversationId('conv-1')).toHaveLength(0);
      expect(store.plansByConversationId('conv-2')).toHaveLength(0);
    });
  });

  describe('A2A Protocol Compliance', () => {
    it('should store PlanData from A2A responses', () => {
      const store = usePlanStore();

      // Simulate A2A response with strict PlanData type
      const planFromA2A: PlanData = {
        id: 'plan-123',
        title: 'Marketing Campaign Plan',
        conversationId: 'conv-456',
        userId: 'user-123',
        agentName: 'marketing-agent',
        organization: 'acme-corp',
        currentVersionId: 'version-1',
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
      };

      store.addPlan(planFromA2A);

      const storedPlan = store.planById('plan-123');
      expect(storedPlan).toEqual(planFromA2A);
      expect(storedPlan?.agentName).toBe('marketing-agent');
      expect(storedPlan?.currentVersionId).toBe('version-1');
    });

    it('should store PlanVersionData from A2A responses', () => {
      const store = usePlanStore();

      const plan: PlanData = {
        id: 'plan-123',
        title: 'Test Plan',
        conversationId: 'conv-456',
        userId: 'user-123',
        agentName: 'test-agent',
        organization: 'acme-corp',
        currentVersionId: 'version-123',
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
      };

      // Simulate A2A response with strict PlanVersionData type
      const versionFromA2A: PlanVersionData = {
        id: 'version-123',
        planId: 'plan-123',
        versionNumber: 1,
        content: JSON.stringify({
          tasks: [
            { id: 'task-1', title: 'Research', status: 'pending' },
            { id: 'task-2', title: 'Design', status: 'pending' },
          ],
        }),
        format: 'json',
        createdByType: 'agent',
        createdById: 'agent-123',
        isCurrentVersion: true,
        createdAt: '2024-01-15T10:00:00.000Z',
      };

      store.addPlan(plan, versionFromA2A);

      const storedVersion = store.versionsByPlanId('plan-123')[0];
      expect(storedVersion).toEqual(versionFromA2A);
      expect(storedVersion.versionNumber).toBe(1);
      const parsedContent = JSON.parse(storedVersion.content);
      expect(parsedContent.tasks).toHaveLength(2);
    });
  });

  describe('State Management Principles', () => {
    it('should only contain state, no async operations', () => {
      const store = usePlanStore();

      // Verify no async methods exist (handlers moved to plan.actions.ts)
      expect(store).not.toHaveProperty('handlePlanCreate');
      expect(store).not.toHaveProperty('handlePlanRead');
      expect(store).not.toHaveProperty('handlePlanEdit');
      expect(store).not.toHaveProperty('handlePlanList');
      expect(store).not.toHaveProperty('fetchPlans');
      expect(store).not.toHaveProperty('createPlan');
      expect(store).not.toHaveProperty('loadPlan');
    });

    it('should use Maps for O(1) lookups', () => {
      const store = usePlanStore();

      // Add many plans
      for (let i = 0; i < 100; i++) {
        const plan: PlanData = {
          id: `plan-${i}`,
          title: `Plan ${i}`,
          conversationId: `conv-${i % 10}`,
          userId: 'user-1',
          agentName: 'test-agent',
          organization: 'test-org',
          currentVersionId: `version-${i}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        store.addPlan(plan);
      }

      // O(1) lookup should be fast
      const start = performance.now();
      const plan = store.planById('plan-50');
      const end = performance.now();

      expect(plan).toBeTruthy();
      expect(plan?.id).toBe('plan-50');
      // Lookup should be very fast (< 1ms)
      expect(end - start).toBeLessThan(1);
    });
  });
});
