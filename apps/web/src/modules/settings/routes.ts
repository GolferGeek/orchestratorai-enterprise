import {
  analyticsOutline,
  cashOutline,
  cogOutline,
  hardwareChipOutline,
  heartOutline,
  listOutline,
  pulseOutline,
  serverOutline,
  terminalOutline,
} from 'ionicons/icons';

export interface SettingsModuleRoute {
  label: string;
  path: string;
  apiPrefix: string;
  permission: string;
  description: string;
  icon: string;
  group: 'llm' | 'observability' | 'system' | 'infrastructure';
}

// Copied from the legacy AdminShell LLM, Observability, System, and
// Data & Infrastructure sections and adapted to unified in-app routes.
export const settingsModuleRoutes: SettingsModuleRoute[] = [
  {
    label: 'System Config',
    path: '/app/settings/system',
    apiPrefix: '/admin/system-config',
    permission: 'admin:settings',
    description: 'Manage system-level configuration.',
    icon: cogOutline,
    group: 'system',
  },
  {
    label: 'System Health',
    path: '/app/settings/system/health',
    apiPrefix: '/health',
    permission: 'admin:settings',
    description: 'Check unified platform health and service status.',
    icon: heartOutline,
    group: 'system',
  },
  {
    label: 'LLM Usage',
    path: '/app/settings/llm/usage',
    apiPrefix: '/admin/llm/usage',
    permission: 'admin:settings',
    description: 'Review model usage, requests, and operational metrics.',
    icon: analyticsOutline,
    group: 'llm',
  },
  {
    label: 'LLM Models',
    path: '/app/settings/llm/models',
    apiPrefix: '/admin/llm/models',
    permission: 'admin:settings',
    description: 'Configure available model providers and model settings.',
    icon: hardwareChipOutline,
    group: 'llm',
  },
  {
    label: 'LLM Costs',
    path: '/app/settings/llm/costs',
    apiPrefix: '/admin/llm/costs',
    permission: 'admin:settings',
    description: 'Review cost attribution and model spend.',
    icon: cashOutline,
    group: 'llm',
  },
  {
    label: 'Observability',
    path: '/app/settings/observability',
    apiPrefix: '/admin/observability',
    permission: 'admin:settings',
    description: 'Inspect platform metrics and observability dashboards.',
    icon: pulseOutline,
    group: 'observability',
  },
  {
    label: 'Event Log',
    path: '/app/settings/observability/events',
    apiPrefix: '/admin/observability/events',
    permission: 'admin:settings',
    description: 'Inspect emitted platform events and audit signals.',
    icon: listOutline,
    group: 'observability',
  },
  {
    label: 'MCP Servers',
    path: '/app/settings/mcp',
    apiPrefix: '/admin/mcp',
    permission: 'admin:settings',
    description: 'Manage MCP server integration configuration.',
    icon: terminalOutline,
    group: 'infrastructure',
  },
  {
    label: 'Database',
    path: '/app/settings/database',
    apiPrefix: '/admin/database',
    permission: 'admin:settings',
    description: 'Review database configuration and administrative status.',
    icon: serverOutline,
    group: 'infrastructure',
  },
];
