/**
 * Application Context Detection Composable
 *
 * Detects and provides the current application context for Claude Code Panel.
 * This allows Claude to understand what the user is viewing and provide contextual help.
 *
 * Context includes:
 * - Current route and view
 * - Active conversation, agent, task
 * - Organization and user info
 * - Current deliverable or plan (if any)
 */

import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useConversationsStore } from '@/stores/conversationsStore';
import { useExecutionContextStore } from '@/stores/executionContextStore';
import { useAuthStore } from '@/stores/rbacStore';
import { useAgentsStore } from '@/stores/agentsStore';

export interface ApplicationContext {
  // Route context
  currentRoute: string;
  routeName?: string;
  routeParams?: Record<string, string>;
  routeQuery?: Record<string, string>;

  // View type - helps Claude understand where user is
  activeView: 'conversation' | 'dashboard' | 'admin' | 'settings' | 'agents' | 'deliverables' | 'evaluations' | 'legal' | 'marketing' | 'unknown';

  // Conversation context (if in a conversation)
  conversationId?: string;
  conversationTitle?: string;

  // Agent context
  agentSlug?: string;
  agentName?: string;
  agentType?: string;

  // Task context
  taskId?: string;
  planId?: string;
  deliverableId?: string;

  // Organization context
  orgSlug?: string;
  userId?: string;
  userEmail?: string;
  userName?: string;

  // Additional metadata
  isAuthenticated: boolean;
  hasAdminAccess: boolean;
  timestamp: string;
}

/**
 * Detect the active view based on route path
 */
function detectActiveView(routePath: string, routeName?: string): ApplicationContext['activeView'] {
  // Check route name first (more reliable)
  if (routeName) {
    if (routeName.includes('admin')) return 'admin';
    if (routeName.includes('settings')) return 'settings';
    if (routeName.includes('deliverables')) return 'deliverables';
    if (routeName.includes('evaluations')) return 'evaluations';
    if (routeName.includes('legal')) return 'legal';
    if (routeName.includes('marketing')) return 'marketing';
    if (routeName.includes('agents')) return 'agents';
    if (routeName.includes('dashboard')) return 'dashboard';
    if (routeName.includes('conversation') || routeName.includes('home')) return 'conversation';
  }

  // Fall back to path parsing
  if (routePath.startsWith('/app/admin')) return 'admin';
  if (routePath.startsWith('/app/settings')) return 'settings';
  if (routePath.startsWith('/app/deliverables')) return 'deliverables';
  if (routePath.startsWith('/app/evaluations')) return 'evaluations';
  if (routePath.startsWith('/app/agents/legal-department')) return 'legal';
  if (routePath.startsWith('/app/agents/marketing-swarm')) return 'marketing';
  if (routePath.startsWith('/app/agents')) return 'agents';
  if (routePath.startsWith('/app/home')) return 'conversation';

  return 'unknown';
}

/**
 * Get contextual suggestions based on current view
 */
export function getContextualSuggestions(context: ApplicationContext): string[] {
  const suggestions: string[] = [];

  // Conversation-specific suggestions
  if (context.activeView === 'conversation' && context.conversationId) {
    suggestions.push('Analyze the current conversation');
    suggestions.push('What agent am I using?');
    suggestions.push('Show conversation metadata');
    if (context.agentName) {
      suggestions.push(`Tell me about the ${context.agentName} agent`);
    }
  }

  // Agent-specific suggestions
  if (context.activeView === 'agents') {
    suggestions.push('List all available agents');
    suggestions.push('Explain agent types');
    suggestions.push('Show agent architecture');
    suggestions.push('How do I create a new agent?');
  }

  // Admin-specific suggestions
  if (context.activeView === 'admin') {
    suggestions.push('Show user permissions');
    suggestions.push('Explain RBAC structure');
    suggestions.push('List all admin features');
  }

  // Deliverables suggestions
  if (context.activeView === 'deliverables' || context.deliverableId) {
    suggestions.push('Explain the deliverable workflow');
    suggestions.push('Show plan structure');
    suggestions.push('How does HITL work?');
  }

  // Dashboard suggestions
  if (context.activeView === 'dashboard') {
    suggestions.push('Explain the dashboard features');
    suggestions.push('Show available metrics');
  }

  // Marketing swarm suggestions
  if (context.activeView === 'marketing') {
    suggestions.push('How does the marketing swarm work?');
    suggestions.push('Show marketing workflow');
    suggestions.push('List available marketing agents');
  }

  // Legal department suggestions
  if (context.activeView === 'legal') {
    suggestions.push('How does the legal department work?');
    suggestions.push('Show legal specialists');
    suggestions.push('Explain legal workflow');
  }

  // Always available suggestions
  suggestions.push('How does the A2A protocol work?');
  suggestions.push('Explain ExecutionContext');
  suggestions.push('Show monorepo structure');

  return suggestions;
}

/**
 * Format context for display in UI
 */
export function formatContextForDisplay(context: ApplicationContext): string {
  const parts: string[] = [];

  // View
  parts.push(`View: ${context.activeView}`);

  // Agent
  if (context.agentName) {
    parts.push(`Agent: ${context.agentName} (${context.agentType || 'unknown type'})`);
  }

  // Conversation
  if (context.conversationId) {
    parts.push(`Conversation: ${context.conversationTitle || context.conversationId.substring(0, 8)}`);
  }

  // Organization
  if (context.orgSlug) {
    parts.push(`Org: ${context.orgSlug}`);
  }

  return parts.join(' | ');
}

/**
 * Format context for Claude's system prompt
 * This is sent to the backend with each request
 */
export function formatContextForClaude(context: ApplicationContext): string {
  const parts: string[] = [];

  parts.push(`The user is currently viewing: ${context.activeView}`);
  parts.push(`Route: ${context.currentRoute}`);

  if (context.agentName) {
    parts.push(`Active agent: ${context.agentName} (type: ${context.agentType || 'unknown'})`);
  }

  if (context.conversationId) {
    parts.push(`Conversation ID: ${context.conversationId}`);
    if (context.conversationTitle) {
      parts.push(`Conversation title: "${context.conversationTitle}"`);
    }
  }

  if (context.orgSlug) {
    parts.push(`Organization: ${context.orgSlug}`);
  }

  if (context.taskId) {
    parts.push(`Active task: ${context.taskId}`);
  }

  if (context.deliverableId) {
    parts.push(`Active deliverable: ${context.deliverableId}`);
  }

  if (context.planId) {
    parts.push(`Active plan: ${context.planId}`);
  }

  return parts.join('\n');
}

/**
 * Main composable for application context detection
 */
export function useApplicationContext() {
  const route = useRoute();
  const conversationsStore = useConversationsStore();
  const executionContextStore = useExecutionContextStore();
  const authStore = useAuthStore();
  const agentsStore = useAgentsStore();

  /**
   * Computed context - updates reactively when route or stores change
   */
  const context = computed<ApplicationContext>(() => {
    const routePath = route.path;
    const routeName = route.name?.toString();
    const routeParams = route.params as Record<string, string>;
    const routeQuery = route.query as Record<string, string>;

    // Get active conversation
    const activeConversation = conversationsStore.activeConversation;

    // Get execution context (may be null if no conversation selected)
    const execContext = executionContextStore.contextOrNull;

    // Detect active view
    const activeView = detectActiveView(routePath, routeName);

    // Get agent info
    let agentSlug = execContext?.agentSlug;
    let agentName: string | undefined;
    let agentType: string | undefined;

    // Try to get agent from conversation first
    if (activeConversation) {
      agentName = activeConversation.agentName || activeConversation.agent?.name;
      agentType = activeConversation.agentType || activeConversation.agent?.type;
      if (!agentSlug && agentName) {
        agentSlug = agentName; // Use name as slug if slug not available
      }
    }

    // Fall back to execution context
    if (!agentName && agentSlug) {
      const agent = agentsStore.availableAgents.find(a =>
        a.slug === agentSlug || a.name === agentSlug
      );
      if (agent) {
        agentName = agent.name;
        agentType = agent.type;
      }
    }

    // Build context object
    const appContext: ApplicationContext = {
      // Route info
      currentRoute: routePath,
      routeName,
      routeParams,
      routeQuery,

      // View
      activeView,

      // Conversation
      conversationId: activeConversation?.id || execContext?.conversationId,
      conversationTitle: activeConversation?.title,

      // Agent
      agentSlug,
      agentName,
      agentType,

      // Task/Plan/Deliverable
      taskId: execContext?.taskId,
      planId: execContext?.planId,
      deliverableId: execContext?.deliverableId,

      // Organization/User
      orgSlug: execContext?.orgSlug || authStore.currentOrganization || undefined,
      userId: execContext?.userId || authStore.user?.id,
      userEmail: authStore.user?.email,
      userName: authStore.user?.displayName || authStore.user?.email,

      // Auth
      isAuthenticated: authStore.isAuthenticated,
      hasAdminAccess: authStore.hasAdminAccess || false,

      // Metadata
      timestamp: new Date().toISOString(),
    };

    return appContext;
  });

  /**
   * Contextual suggestions based on current view
   */
  const suggestions = computed(() => getContextualSuggestions(context.value));

  /**
   * Formatted context for display
   */
  const displayText = computed(() => formatContextForDisplay(context.value));

  /**
   * Formatted context for Claude
   */
  const claudeText = computed(() => formatContextForClaude(context.value));

  return {
    context,
    suggestions,
    displayText,
    claudeText,
  };
}
