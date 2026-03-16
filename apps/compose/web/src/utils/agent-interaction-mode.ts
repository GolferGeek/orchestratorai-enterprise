/**
 * Agent Interaction Mode Utility
 *
 * Determines how to interact with an agent - via conversation or dashboard.
 * Dashboard agents (like prediction runners) have a different UI than
 * conversation-based agents.
 */

import type { Agent as BaseAgent } from "@/types/conversation";

/**
 * Extended Agent type with metadata properties for interaction mode detection.
 * The base Agent type doesn't include metadata, but agents from the store hierarchy do.
 */
export interface Agent extends BaseAgent {
  metadata?: {
    interaction_mode?: string;
    hasCustomUI?: boolean;
    customUIComponent?: string;
    canChat?: boolean;
    dashboardType?: string;
    runnerConfig?: {
      runner?: string;
      [key: string]: unknown;
    };
    description?: string;
    displayName?: string;
    [key: string]: unknown;
  };
  hasCustomUI?: boolean;
  customUIComponent?: string;
}

/**
 * Agent interaction modes
 */
export type AgentInteractionMode = "conversation" | "dashboard";

/**
 * Dashboard types for different agent UIs
 */
export type DashboardType =
  | "prediction"
  | "monitoring"
  | "analytics"
  | "risk"
  | "custom";

/**
 * Interaction mode configuration
 */
export interface InteractionModeConfig {
  mode: AgentInteractionMode;
  dashboardType?: DashboardType;
  component?: string;
  canStartConversation: boolean;
  canOpenDashboard: boolean;
}

/**
 * Agent types that use dashboard mode by default
 */
const DASHBOARD_AGENT_TYPES = [
  "prediction",
  "prediction_agent",
  "ambient_agent",
  "monitoring_agent",
  "dashboard",
  "risk",
];

/**
 * Agent slugs that have dedicated views with their own deliverable browsing.
 * These agents get dashboard icon treatment (no conversation sub-list in sidebar)
 * but still manage their own conversations internally via dedicated routes.
 */
const DEDICATED_VIEW_AGENTS = ["legal-department", "marketing-swarm", "cad-agent"];

/**
 * Runner types that use dashboard mode
 */
const DASHBOARD_RUNNERS = [
  "stock-predictor",
  "crypto-predictor",
  "market-predictor",
  "election-predictor",
  "risk-analyzer",
];

/**
 * Get the interaction mode for an agent.
 *
 * @param agent - The agent to check
 * @returns Interaction mode configuration
 */
export function getInteractionMode(agent: Agent): InteractionModeConfig {
  // Check explicit metadata override
  if (agent.metadata?.interaction_mode) {
    const mode = agent.metadata.interaction_mode as AgentInteractionMode;
    return {
      mode,
      dashboardType: mode === "dashboard" ? getDashboardType(agent) : undefined,
      component: agent.metadata?.customUIComponent as string | undefined,
      canStartConversation:
        mode === "conversation" || agent.metadata?.canChat === true,
      canOpenDashboard: mode === "dashboard",
    };
  }

  // Check for hasCustomUI flag
  if (agent.metadata?.hasCustomUI || agent.hasCustomUI) {
    const customComponent = (agent.metadata?.customUIComponent ||
      agent.customUIComponent) as string | undefined;

    // Conversation pane components with custom UI (still use conversation flow)
    const conversationPaneComponents: string[] = [];
    const isConversationPaneCustomUI =
      customComponent && conversationPaneComponents.includes(customComponent);

    if (isConversationPaneCustomUI) {
      // These are conversation agents with custom UI, not dashboard agents
      return {
        mode: "conversation",
        component: customComponent,
        canStartConversation: true,
        canOpenDashboard: false,
      };
    }

    // Other custom UI agents are dashboard agents
    return {
      mode: "dashboard",
      dashboardType: getDashboardType(agent),
      component: customComponent,
      canStartConversation: agent.metadata?.canChat === true,
      canOpenDashboard: true,
    };
  }

  // Check agent type
  if (agent.type && DASHBOARD_AGENT_TYPES.includes(agent.type.toLowerCase())) {
    return {
      mode: "dashboard",
      dashboardType: getDashboardType(agent),
      canStartConversation: false,
      canOpenDashboard: true,
    };
  }

  // Check runner configuration
  const runnerConfig = agent.metadata?.runnerConfig as
    | { runner?: string }
    | undefined;
  if (runnerConfig?.runner && DASHBOARD_RUNNERS.includes(runnerConfig.runner)) {
    return {
      mode: "dashboard",
      dashboardType: "prediction",
      canStartConversation: true, // Prediction agents support learning conversations
      canOpenDashboard: true,
    };
  }

  // Check for dedicated view agents (have their own deliverable-centric UI)
  const agentSlug = agent.slug || agent.name || "";
  if (DEDICATED_VIEW_AGENTS.includes(agentSlug)) {
    return {
      mode: "dashboard",
      dashboardType: "custom",
      canStartConversation: false,
      canOpenDashboard: true,
    };
  }

  // Default to conversation mode
  return {
    mode: "conversation",
    canStartConversation: true,
    canOpenDashboard: false,
  };
}

/**
 * Get the dashboard type for an agent.
 */
function getDashboardType(agent: Agent): DashboardType {
  // Check explicit dashboard type
  if (agent.metadata?.dashboardType) {
    return agent.metadata.dashboardType as DashboardType;
  }

  // Check runner config
  const runnerConfig = agent.metadata?.runnerConfig as
    | { runner?: string }
    | undefined;
  if (runnerConfig?.runner) {
    if (runnerConfig.runner === "risk-analyzer") {
      return "risk";
    }
    if (DASHBOARD_RUNNERS.includes(runnerConfig.runner)) {
      return "prediction";
    }
  }

  // Check agent type
  if (agent.type) {
    const agentType = agent.type.toLowerCase();
    if (agentType === "risk") {
      return "risk";
    }
    if (agentType.includes("prediction") || agentType.includes("ambient")) {
      return "prediction";
    }
    if (agentType.includes("monitoring")) {
      return "monitoring";
    }
    if (agentType.includes("analytics")) {
      return "analytics";
    }
  }

  // Check custom UI component name
  const component = (agent.metadata?.customUIComponent ||
    agent.customUIComponent) as string | undefined;
  if (component) {
    if (component.toLowerCase().includes("prediction")) {
      return "prediction";
    }
    if (component.toLowerCase().includes("monitoring")) {
      return "monitoring";
    }
  }

  return "custom";
}

/**
 * Check if an agent should show dashboard icon.
 */
export function shouldShowDashboardIcon(agent: Agent): boolean {
  const config = getInteractionMode(agent);
  return config.canOpenDashboard;
}

/**
 * Check if an agent should show conversation icon.
 */
export function shouldShowConversationIcon(agent: Agent): boolean {
  const config = getInteractionMode(agent);
  return config.canStartConversation;
}

/**
 * Check if an agent is a prediction agent.
 */
export function isPredictionAgent(agent: Agent): boolean {
  const config = getInteractionMode(agent);
  return config.dashboardType === "prediction";
}

/**
 * Get the component name for a dashboard agent.
 */
export function getDashboardComponent(agent: Agent): string | null {
  const config = getInteractionMode(agent);

  if (config.component) {
    return config.component;
  }

  if (config.dashboardType === "prediction") {
    return "PredictionAgentPane";
  }

  if (config.dashboardType === "risk") {
    return "RiskAgentPane";
  }

  // For dashboard agents without a specific component (e.g., dedicated view agents),
  // return the dashboard type so the opener can route accordingly
  if (config.mode === "dashboard") {
    return config.dashboardType || "custom";
  }

  return null;
}

/**
 * Check if an agent is a pure dashboard agent (no conversation counts should be shown).
 * Dashboard agents use a single shared conversation per session, so showing individual
 * conversation counts is misleading.
 */
export function isDashboardOnlyAgent(agent: Agent): boolean {
  const config = getInteractionMode(agent);
  // Dashboard agents that can't start real conversations are dashboard-only
  // Prediction/Risk agents fall into this category
  return config.mode === "dashboard" && !config.canStartConversation;
}
