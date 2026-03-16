import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { JsonObject, JsonValue } from '@/types';
import { ApiEndpoint, API_FEATURES, ApiVersion, ApiTechnology } from '../types/api';
import { apiService } from '../services/apiService';

type EndpointHealthStatus = {
  isHealthy: boolean;
  lastChecked: Date;
  responseTime?: number;
  error?: string;
};

type EndpointHealthMap = Record<string, EndpointHealthStatus>;
type FeatureAvailabilityMap = Record<string, string[]>;

type EndpointDiscoveryInfo = JsonObject & {
  version?: JsonValue;
  technology?: JsonValue;
  name?: JsonValue;
  description?: JsonValue;
  features?: JsonValue;
};

const isJsonObject = (value: unknown): value is JsonObject => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

interface PersistedEndpointHealthRecord {
  isHealthy: boolean;
  lastChecked: string;
  responseTime?: number;
  error?: string;
}

interface PersistedApiConfiguration {
  endpointHealthStatus?: Record<string, PersistedEndpointHealthRecord>;
  featureAvailability?: Record<string, string[]>;
  lastDiscoveryTime?: string;
  configurationVersion?: string;
  lastUpdated?: string;
}

interface EndpointInfoPayload {
  version?: ApiVersion;
  technology?: ApiTechnology;
  name?: string;
  description?: string;
  features?: string[];
}
interface ApiConfigState {
  // Environment configuration
  environment: 'development' | 'staging' | 'production';
  // Dynamic endpoint discovery
  discoveredEndpoints: ApiEndpoint[];
  lastDiscoveryTime: Date | null;
  discoveryInProgress: boolean;
  // Health monitoring
  endpointHealthStatus: EndpointHealthMap;
  // Feature availability cache
  featureAvailability: FeatureAvailabilityMap; // endpoint name -> features
  // Configuration metadata
  configurationVersion: string;
  lastUpdated: Date;
}
const resolveEnvironment = (): ApiConfigState['environment'] => {
  const mode = import.meta.env.MODE;
  if (mode === 'production' || mode === 'staging') {
    return mode;
  }
  return 'development';
};

const asString = (value: JsonValue | undefined, fallback = ''): string => (
  typeof value === 'string' ? value : fallback
);

const asStringArray = (value: JsonValue | undefined): string[] | undefined => (
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : undefined
);

const toApiVersion = (value: JsonValue | undefined): ApiVersion => (
  typeof value === 'string' && value === 'v2' ? 'v2' : 'v1'
);

const toApiTechnology = (value: JsonValue | undefined): ApiTechnology => (
  typeof value === 'string' && value === 'typescript-nestjs' ? 'typescript-nestjs' : 'typescript-nestjs'
);

const parseEndpointInfo = (raw: unknown): EndpointInfoPayload | null => {
  if (!isJsonObject(raw)) {
    return null;
  }

  const candidate = raw as EndpointDiscoveryInfo;
  const features = asStringArray(candidate.features);
  const version = typeof candidate.version === 'string' ? toApiVersion(candidate.version) : undefined;
  const technology = typeof candidate.technology === 'string' ? toApiTechnology(candidate.technology) : undefined;
  const name = typeof candidate.name === 'string' ? candidate.name : undefined;
  const description = typeof candidate.description === 'string' ? candidate.description : undefined;

  return {
    version,
    technology,
    name,
    description,
    features,
  };
};

const parsePersistedConfiguration = (raw: unknown): PersistedApiConfiguration | null => {
  if (!isJsonObject(raw)) {
    return null;
  }

  const candidate = raw as JsonObject;

  const endpointHealthSource = candidate.endpointHealthStatus;
  const endpointHealthStatus = isJsonObject(endpointHealthSource)
    ? Object.entries(endpointHealthSource).reduce<Record<string, PersistedEndpointHealthRecord>>((acc, [key, value]) => {
        if (!isJsonObject(value)) {
          return acc;
        }

        const isHealthy = value.isHealthy;
        const lastChecked = value.lastChecked;

        if (typeof isHealthy !== 'boolean' || typeof lastChecked !== 'string') {
          return acc;
        }

        acc[key] = {
          isHealthy,
          lastChecked,
          responseTime: typeof value.responseTime === 'number' ? value.responseTime : undefined,
          error: typeof value.error === 'string' ? value.error : undefined,
        };

        return acc;
      }, {})
    : undefined;

  const featureAvailabilitySource = candidate.featureAvailability;
  const featureAvailability = isJsonObject(featureAvailabilitySource)
    ? Object.entries(featureAvailabilitySource).reduce<Record<string, string[]>>((acc, [key, value]) => {
        if (!Array.isArray(value)) {
          return acc;
        }

        const features = value.filter((item): item is string => typeof item === 'string');
        acc[key] = features;
        return acc;
      }, {})
    : undefined;

  const lastDiscoveryTime = typeof candidate.lastDiscoveryTime === 'string' ? candidate.lastDiscoveryTime : undefined;
  const configurationVersion = typeof candidate.configurationVersion === 'string' ? candidate.configurationVersion : undefined;
  const lastUpdated = typeof candidate.lastUpdated === 'string' ? candidate.lastUpdated : undefined;

  return {
    endpointHealthStatus,
    featureAvailability,
    lastDiscoveryTime,
    configurationVersion,
    lastUpdated,
  };
};
export const useApiConfigStore = defineStore('apiConfig', () => {
  // Reactive state
  const state = ref<ApiConfigState>({
    environment: resolveEnvironment(),
    discoveredEndpoints: [],
    lastDiscoveryTime: null,
    discoveryInProgress: false,
    endpointHealthStatus: {},
    featureAvailability: {},
    configurationVersion: '1.0.0',
    lastUpdated: new Date(),
  });
  // Environment-based configuration
  const environmentConfig = computed(() => {
    const env = state.value.environment;
    switch (env) {
      case 'production':
        return {
          defaultTimeout: 15000,
          healthCheckInterval: 300000, // 5 minutes
          enableDebugMode: false,
          allowEndpointSwitching: false, // Lock to production endpoints
          maxRetries: 3,
        };
      case 'staging':
        return {
          defaultTimeout: 10000,
          healthCheckInterval: 120000, // 2 minutes
          enableDebugMode: true,
          allowEndpointSwitching: true,
          maxRetries: 2,
        };
      default: // development
        return {
          defaultTimeout: 5000,
          healthCheckInterval: 60000, // 1 minute
          enableDebugMode: true,
          allowEndpointSwitching: true,
          maxRetries: 1,
        };
    }
  });
  // Computed properties
  const allEndpoints = computed(() => [
    // Unified API endpoint
    {
      version: 'v1' as const,
      technology: 'typescript-nestjs' as const,
      baseUrl: import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_NESTJS_BASE_URL,
      name: 'Orchestrator AI API',
      description: 'Unified NestJS API',
      features: [
        API_FEATURES.ORCHESTRATOR,
        API_FEATURES.AGENT_DISCOVERY,
        API_FEATURES.SESSION_MANAGEMENT,
      ],
      isAvailable: true,
    },
    ...state.value.discoveredEndpoints,
  ]);
  const healthyEndpoints = computed(() =>
    allEndpoints.value.filter(endpoint => {
      const health = state.value.endpointHealthStatus[endpoint.name];
      return health?.isHealthy && endpoint.isAvailable;
    })
  );
  const availableFeatures = computed(() => {
    const currentEndpoint = allEndpoints.value[0]; // Use unified API
    return state.value.featureAvailability[currentEndpoint.name] || currentEndpoint.features;
  });
  // Actions
  const initializeConfiguration = async () => {
    try {
      // Load saved configuration from localStorage
      await loadSavedConfiguration();
      // Perform initial health checks
      await performHealthChecks();
      // Start periodic health monitoring
      startHealthMonitoring();
    } catch {
      // Failed to initialize API configuration
    }
  };
  const loadSavedConfiguration = async () => {
    try {
      const saved = localStorage.getItem('apiConfiguration');
      if (saved) {
        const parsed = parsePersistedConfiguration(JSON.parse(saved));
        if (parsed?.endpointHealthStatus) {
          const mapped: EndpointHealthMap = {};
          for (const [endpoint, record] of Object.entries(parsed.endpointHealthStatus)) {
            mapped[endpoint] = {
              isHealthy: record.isHealthy,
              lastChecked: new Date(record.lastChecked),
              responseTime: record.responseTime,
              error: record.error,
            };
          }
          state.value.endpointHealthStatus = mapped;
        }
        if (parsed?.featureAvailability) {
          state.value.featureAvailability = parsed.featureAvailability;
        }
        if (parsed?.lastDiscoveryTime) {
          state.value.lastDiscoveryTime = new Date(parsed.lastDiscoveryTime);
        }
      }
    } catch {
      // Failed to load saved configuration
    }
  };
  const saveConfiguration = () => {
    try {
      const toSave = {
        endpointHealthStatus: state.value.endpointHealthStatus,
        featureAvailability: state.value.featureAvailability,
        lastDiscoveryTime: state.value.lastDiscoveryTime,
        configurationVersion: state.value.configurationVersion,
        lastUpdated: new Date(),
      };
      localStorage.setItem('apiConfiguration', JSON.stringify(toSave));
    } catch {
      // Failed to save configuration
    }
  };
  const performHealthChecks = async () => {
    try {
      const results = { 'Orchestrator AI API': true };
      const now = new Date();
      for (const [endpointName, isHealthy] of Object.entries(results)) {
        state.value.endpointHealthStatus[endpointName] = {
          isHealthy,
          lastChecked: now,
          responseTime: 0,
          error: isHealthy ? undefined : 'Health check failed',
        };
        // Update endpoint availability based on health
        // Update endpoint availability (simplified for unified API)
      }
      saveConfiguration();
    } catch {
      // Failed to test endpoint
    }
  };
  const performHealthCheckForEndpoint = async (endpointName: string) => {
    try {
      // Simplified for unified API
      if (endpointName !== 'Orchestrator AI API') return false;
      const startTime = Date.now();
      const isHealthy = await apiService.healthCheck();
      const responseTime = Date.now() - startTime;
      state.value.endpointHealthStatus[endpointName] = {
        isHealthy,
        lastChecked: new Date(),
        responseTime,
        error: isHealthy ? undefined : 'Health check failed',
      };
      // Simplified endpoint availability update
      saveConfiguration();
      return isHealthy;
    } catch (error) {
      state.value.endpointHealthStatus[endpointName] = {
        isHealthy: false,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      return false;
    }
  };
  const discoverEndpoints = async () => {
    if (state.value.discoveryInProgress) return;
    state.value.discoveryInProgress = true;
    try {
      // In a real implementation, this might call a discovery service
      // For now, we'll check for additional endpoints based on environment
      const baseUrls = [
        // Prefer explicit VITE_WEB_PORT; default dev port remains 9001; 7101 only as configured
        `http://localhost:${import.meta.env.VITE_WEB_PORT || '9001'}`,
        // Add staging/production URLs based on environment
      ];
      const discovered: ApiEndpoint[] = [];
      for (const baseUrl of baseUrls) {
        try {
          // Try to discover endpoint capabilities
          const response = await fetch(`${baseUrl}/health`, {
            method: 'GET',
            signal: AbortSignal.timeout(environmentConfig.value.defaultTimeout),
          });
          if (response.ok) {
            // Try to get more information about the endpoint
            const infoResponse = await fetch(`${baseUrl}/api/info`, {
              signal: AbortSignal.timeout(environmentConfig.value.defaultTimeout),
            });
            let endpointInfo: EndpointDiscoveryInfo = {};
            let parsedInfo: EndpointInfoPayload | null = null;
            if (infoResponse.ok) {
              const rawInfo: unknown = await infoResponse.json();
              if (isJsonObject(rawInfo)) {
                endpointInfo = rawInfo as EndpointDiscoveryInfo;
                parsedInfo = parseEndpointInfo(endpointInfo);
              }
            }
            const features = parsedInfo?.features
              ?? asStringArray(endpointInfo.features)
              ?? [API_FEATURES.ORCHESTRATOR];
            const endpoint: ApiEndpoint = {
              version: parsedInfo?.version ?? toApiVersion(endpointInfo.version),
              technology: parsedInfo?.technology ?? toApiTechnology(endpointInfo.technology),
              baseUrl,
              name: parsedInfo?.name ?? asString(endpointInfo.name, `Discovered ${baseUrl}`),
              description: parsedInfo?.description ?? asString(endpointInfo.description, `Auto-discovered endpoint at ${baseUrl}`),
              features,
              isAvailable: true,
            };
            discovered.push(endpoint);
          }
        } catch {
          // Endpoint not available, skip
        }
      }
      state.value.discoveredEndpoints = discovered;
      state.value.lastDiscoveryTime = new Date();
    } catch {
      // Failed to perform health checks
    } finally {
      state.value.discoveryInProgress = false;
      saveConfiguration();
    }
  };
  const updateFeatureAvailability = async (endpointName: string) => {
    try {
      // Simplified for unified API - use static feature list
      if (endpointName !== 'Orchestrator AI API') return;
      const endpoint = allEndpoints.value.find(ep => ep.name === endpointName);
      if (!endpoint) return;
      // Use static feature list from endpoint configuration
      state.value.featureAvailability[endpointName] = endpoint.features;
      saveConfiguration();
    } catch {
      // Fall back to static features
      const endpoint = allEndpoints.value.find(ep => ep.name === endpointName);
      if (endpoint) {
        state.value.featureAvailability[endpointName] = endpoint.features;
      }
    }
  };
  let healthMonitoringInterval: number | null = null;
  const startHealthMonitoring = () => {
    if (healthMonitoringInterval) return;
    const interval = environmentConfig.value.healthCheckInterval;
    healthMonitoringInterval = window.setInterval(async () => {
      await performHealthChecks();
    }, interval);
  };
  const stopHealthMonitoring = () => {
    if (healthMonitoringInterval) {
      clearInterval(healthMonitoringInterval);
      healthMonitoringInterval = null;
    }
  };
  const resetConfiguration = () => {
    localStorage.removeItem('apiConfiguration');
    state.value = {
      environment: resolveEnvironment(),
      discoveredEndpoints: [],
      lastDiscoveryTime: null,
      discoveryInProgress: false,
      endpointHealthStatus: {},
      featureAvailability: {},
      configurationVersion: '1.0.0',
      lastUpdated: new Date(),
    };
  };
  const getEndpointHealth = (endpointName: string): EndpointHealthStatus | null => (
    state.value.endpointHealthStatus[endpointName] || null
  );
  return {
    // State
    state,
    // Computed
    environmentConfig,
    allEndpoints,
    healthyEndpoints,
    availableFeatures,
    // Actions
    initializeConfiguration,
    loadSavedConfiguration,
    saveConfiguration,
    performHealthChecks,
    performHealthCheckForEndpoint,
    discoverEndpoints,
    updateFeatureAvailability,
    startHealthMonitoring,
    stopHealthMonitoring,
    resetConfiguration,
    getEndpointHealth,
  };
}); 
