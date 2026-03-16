import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useApiConfigStore } from '../stores/apiConfigStore';
import { API_FEATURES, ApiFeature, ApiVersion, ApiTechnology } from '../types/api';
interface FeatureCompatibility {
  feature: ApiFeature;
  isSupported: boolean;
  minimumVersion: ApiVersion;
  alternativeFeature?: ApiFeature;
  fallbackMessage?: string;
  requiresTechnology?: ApiTechnology;
}
interface VersionCapabilities {
  version: ApiVersion;
  technology: ApiTechnology;
  features: ApiFeature[];
  limitations: string[];
  recommendations: string[];
}
export function useFeatureDetection() {
  // Stores
  const apiConfigStore = useApiConfigStore();
  // Reactive state
  const detectedFeatures = ref<Set<ApiFeature>>(new Set());
  const lastDetectionTime = ref<Date | null>(null);
  const detectionInProgress = ref(false);
  const detectionError = ref<string | null>(null);
  // Feature compatibility matrix
  const featureCompatibility: Record<ApiFeature, FeatureCompatibility> = {
    [API_FEATURES.ORCHESTRATOR]: {
      feature: API_FEATURES.ORCHESTRATOR,
      isSupported: true,
      minimumVersion: 'v1',
    },
    [API_FEATURES.AGENT_DISCOVERY]: {
      feature: API_FEATURES.AGENT_DISCOVERY,
      isSupported: true,
      minimumVersion: 'v1',
    },
    [API_FEATURES.SESSION_MANAGEMENT]: {
      feature: API_FEATURES.SESSION_MANAGEMENT,
      isSupported: true,
      minimumVersion: 'v1',
    },
    [API_FEATURES.HIERARCHICAL_AGENTS]: {
      feature: API_FEATURES.HIERARCHICAL_AGENTS,
      isSupported: true,
      minimumVersion: 'v2',
      fallbackMessage: 'Hierarchical agents require V2 API. Switch to V2 to enable this feature.',
    },
    [API_FEATURES.REAL_TIME_CHAT]: {
      feature: API_FEATURES.REAL_TIME_CHAT,
      isSupported: false,
      minimumVersion: 'v2',
      requiresTechnology: 'typescript-nestjs',
      fallbackMessage: 'Real-time chat requires TypeScript NestJS backend.',
    },
    [API_FEATURES.FILE_UPLOAD]: {
      feature: API_FEATURES.FILE_UPLOAD,
      isSupported: false,
      minimumVersion: 'v2',
      fallbackMessage: 'File upload feature is not yet implemented.',
    },
    [API_FEATURES.VOICE_SUPPORT]: {
      feature: API_FEATURES.VOICE_SUPPORT,
      isSupported: false,
      minimumVersion: 'v2',
      fallbackMessage: 'Voice support is planned for future releases.',
    },
    [API_FEATURES.MULTI_MODAL]: {
      feature: API_FEATURES.MULTI_MODAL,
      isSupported: false,
      minimumVersion: 'v2',
      fallbackMessage: 'Multi-modal support is in development.',
    },
  };
  // Version capabilities
  const versionCapabilities: VersionCapabilities[] = [
    {
      version: 'v1',
      technology: 'typescript-nestjs',
      features: [
        API_FEATURES.ORCHESTRATOR,
        API_FEATURES.AGENT_DISCOVERY,
        API_FEATURES.SESSION_MANAGEMENT,
        API_FEATURES.HIERARCHICAL_AGENTS,
        API_FEATURES.REAL_TIME_CHAT,
        API_FEATURES.MULTI_MODAL,
      ],
      limitations: [
        'Actively developed and maintained',
        'Production-ready NestJS implementation'
      ],
      recommendations: [
        'Modern TypeScript ecosystem',
        'Recommended for all agent workflows',
        'Real-time features available'
      ]
    }
  ];
  // Computed properties  
  const currentEndpoint = computed(() => ({
    version: 'v1' as ApiVersion,
    technology: 'typescript-nestjs' as ApiTechnology,
    name: 'Orchestrator AI API',
    features: [
      API_FEATURES.ORCHESTRATOR,
      API_FEATURES.AGENT_DISCOVERY, 
      API_FEATURES.SESSION_MANAGEMENT,
    ]
  }));
  const currentCapabilities = computed(() => {
    return versionCapabilities.find(cap => 
      cap.version === currentEndpoint.value.version && 
      cap.technology === currentEndpoint.value.technology
    ) || versionCapabilities[0];
  });
  const supportedFeatures = computed(() => {
    return Array.from(detectedFeatures.value);
  });
  const unsupportedFeatures = computed(() => {
    const allFeatures = Object.values(API_FEATURES);
    return allFeatures.filter(feature => !detectedFeatures.value.has(feature));
  });
  const featureRecommendations = computed(() => {
    const recommendations: Array<{
      feature: ApiFeature;
      message: string;
      action?: string;
      priority: 'low' | 'medium' | 'high';
    }> = [];
    unsupportedFeatures.value.forEach(feature => {
      const compatibility = featureCompatibility[feature];
      if (compatibility.fallbackMessage) {
        recommendations.push({
          feature,
          message: compatibility.fallbackMessage,
          action: getRecommendedAction(compatibility),
          priority: getPriority(compatibility)
        });
      }
    });
    return recommendations;
  });
  // Methods
  const detectFeatures = async (): Promise<void> => {
    if (detectionInProgress.value) return;
    detectionInProgress.value = true;
    detectionError.value = null;
    try {
      const endpoint = currentEndpoint.value;
      const detected = new Set<ApiFeature>();
      // Start with static features from endpoint configuration
      endpoint.features.forEach(feature => detected.add(feature as ApiFeature));
      // For V2 APIs, try dynamic feature detection
      if (endpoint.version === 'v2') {
        try {
          // Since we're using a single API service now, skip dynamic feature detection
        } catch {
          // Silently ignore feature detection errors
        }
      }
      // Validate detected features against compatibility matrix
      const validatedFeatures = new Set<ApiFeature>();
      detected.forEach(feature => {
        if (isFeatureCompatible(feature, endpoint.version, endpoint.technology)) {
          validatedFeatures.add(feature);
        }
      });
      detectedFeatures.value = validatedFeatures;
      lastDetectionTime.value = new Date();
      // Update API config store with detected features
      await apiConfigStore.updateFeatureAvailability(endpoint.name);
    } catch (error) {
      detectionError.value = error instanceof Error ? error.message : 'Unknown error';
    } finally {
      detectionInProgress.value = false;
    }
  };
  const isFeatureSupported = (feature: ApiFeature): boolean => {
    return detectedFeatures.value.has(feature);
  };
  const isFeatureCompatible = (
    feature: ApiFeature, 
    version: ApiVersion, 
    technology: ApiTechnology
  ): boolean => {
    const compatibility = featureCompatibility[feature];
    if (!compatibility) return false;
    // Check version requirement
    if (version < compatibility.minimumVersion) return false;
    // Check technology requirement
    if (compatibility.requiresTechnology && technology !== compatibility.requiresTechnology) {
      return false;
    }
    return compatibility.isSupported;
  };
  const getFeatureFallback = (feature: ApiFeature): string | null => {
    const compatibility = featureCompatibility[feature];
    return compatibility?.fallbackMessage || null;
  };
  const getAlternativeFeature = (feature: ApiFeature): ApiFeature | null => {
    const compatibility = featureCompatibility[feature];
    return compatibility?.alternativeFeature || null;
  };
  const getRecommendedAction = (compatibility: FeatureCompatibility): string | undefined => {
    if (compatibility.minimumVersion === 'v2') {
      return 'Switch to V2 API';
    }
    if (compatibility.requiresTechnology) {
      return `Switch to ${compatibility.requiresTechnology}`;
    }
    return undefined;
  };
  const getPriority = (compatibility: FeatureCompatibility): 'low' | 'medium' | 'high' => {
    if (compatibility.feature === API_FEATURES.HIERARCHICAL_AGENTS) return 'high';
    if (compatibility.feature === API_FEATURES.REAL_TIME_CHAT) return 'medium';
    return 'low';
  };
  const executeWithFallback = async <T>(
    feature: ApiFeature,
    primaryAction: () => Promise<T>,
    fallbackAction?: () => Promise<T> | T
  ): Promise<T> => {
    if (isFeatureSupported(feature)) {
      try {
        return await primaryAction();
      } catch (error) {
        if (fallbackAction) {
          return await fallbackAction();
        }
        throw error;
      }
    } else {
      if (fallbackAction) {
        return await fallbackAction();
      }
      throw new Error(`Feature ${feature} is not supported and no fallback provided`);
    }
  };
  const getVersionComparisonData = () => {
    return versionCapabilities.map(cap => ({
      ...cap,
      isCurrentVersion: cap.version === currentEndpoint.value.version && 
                       cap.technology === currentEndpoint.value.technology,
      isAvailable: apiConfigStore.allEndpoints.some(ep => 
        ep.version === cap.version && 
        ep.technology === cap.technology && 
        ep.isAvailable
      )
    }));
  };
  const canUpgradeForFeature = (feature: ApiFeature): boolean => {
    const compatibility = featureCompatibility[feature];
    if (!compatibility) return false;
    // Check if there's a higher version that supports this feature
    const availableEndpoints = apiConfigStore.allEndpoints;
    return availableEndpoints.some(endpoint => 
      endpoint.version >= compatibility.minimumVersion &&
      (!compatibility.requiresTechnology || endpoint.technology === compatibility.requiresTechnology) &&
      endpoint.isAvailable
    );
  };
  const getUpgradeRecommendation = (feature: ApiFeature): string | null => {
    if (!canUpgradeForFeature(feature)) return null;
    const compatibility = featureCompatibility[feature];
    const targetVersion = compatibility.minimumVersion;
    const targetTechnology = compatibility.requiresTechnology;
    if (targetTechnology) {
      return `Upgrade to ${targetVersion} with ${targetTechnology} to enable ${feature}`;
    } else {
      return `Upgrade to ${targetVersion} to enable ${feature}`;
    }
  };
  // Watchers
  watch(
    () => currentEndpoint.value,
    () => {
      detectFeatures();
    },
    { immediate: false }
  );
  // Lifecycle
  onMounted(() => {
    detectFeatures();
  });
  // Auto-refresh feature detection periodically
  let detectionInterval: number | undefined;
  const startPeriodicDetection = (intervalMs: number = 300000) => { // 5 minutes
    if (detectionInterval) return;
    detectionInterval = window.setInterval(() => {
      if (!detectionInProgress.value) {
        detectFeatures();
      }
    }, intervalMs);
  };
  const stopPeriodicDetection = () => {
    if (detectionInterval) {
      clearInterval(detectionInterval);
      detectionInterval = undefined;
    }
  };
  onUnmounted(() => {
    stopPeriodicDetection();
  });
  return {
    // State
    detectedFeatures: supportedFeatures,
    lastDetectionTime,
    detectionInProgress,
    detectionError,
    // Computed
    currentCapabilities,
    supportedFeatures,
    unsupportedFeatures,
    featureRecommendations,
    // Methods
    detectFeatures,
    isFeatureSupported,
    isFeatureCompatible,
    getFeatureFallback,
    getAlternativeFeature,
    executeWithFallback,
    getVersionComparisonData,
    canUpgradeForFeature,
    getUpgradeRecommendation,
    startPeriodicDetection,
    stopPeriodicDetection,
    // Constants
    API_FEATURES,
    featureCompatibility,
    versionCapabilities,
  };
} 