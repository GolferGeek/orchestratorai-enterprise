import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { ApiVersion, ApiTechnology } from '../types/api';
/**
 * Generate a UUID - polyfill for crypto.randomUUID()
 */
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback implementation for browsers that don't support crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
export interface UserPreferences {
  // API Preferences
  preferredApiVersion: ApiVersion;
  preferredTechnology: ApiTechnology;
  autoSwitchToHealthyEndpoint: boolean;
  rememberApiSelection: boolean;
  // LLM Preferences
  preferredProviderName?: string;
  preferredModelName?: string;
  // UI Preferences
  theme: 'light' | 'dark' | 'auto';
  language: string;
  showAdvancedOptions: boolean;
  enableDebugMode: boolean;
  // Chat Preferences
  enableAutoScroll: boolean;
  showTimestamps: boolean;
  enableSoundNotifications: boolean;
  messageHistory: number; // Number of messages to keep in history
  // Task Execution Preferences
  defaultExecutionMode: 'immediate' | 'polling' | 'real-time' | 'auto';
  pollingInterval: number; // seconds
  enableProgressIndicators: boolean;
  autoSwitchToWebSocketForWorkflows: boolean;
  immediateTimeoutDuration: number; // seconds
  showExecutionModeIndicator: boolean;
  enableQuickModeToggle: boolean;
  // Performance Preferences
  enableCaching: boolean;
  cacheDuration: number; // In minutes
  enableOfflineMode: boolean;
  // Developer Preferences
  showApiMetadata: boolean;
  enableRequestLogging: boolean;
  showHealthStatus: boolean;
  // Accessibility Preferences
  enableHighContrast: boolean;
  fontSize: 'small' | 'medium' | 'large';
  enableScreenReader: boolean;
  // Session Management
  persistSessions: boolean;
  autoSaveInterval: number; // In seconds
  maxSessions: number;
}
interface UserProfile {
  id: string;
  name: string;
  email?: string;
  role: 'user' | 'admin' | 'developer';
  preferences: UserPreferences;
  createdAt: Date;
  lastActive: Date;
}

interface PreferencesImportData {
  preferences?: Partial<UserPreferences>;
  userProfile?: Partial<UserProfile> & {
    createdAt?: string | Date;
    lastActive?: string | Date;
  };
  version?: string;
  exportedAt?: string;
}
const DEFAULT_PREFERENCES: UserPreferences = {
  // API Preferences
  preferredApiVersion: 'v1',
  preferredTechnology: 'typescript-nestjs',
  autoSwitchToHealthyEndpoint: true,
  rememberApiSelection: true,
  // LLM Preferences
  preferredProviderName: 'Ollama',
  preferredModelName: 'llama3.2:1b', // Default to Ollama llama3.2:1b model
  // UI Preferences
  theme: 'auto',
  language: 'en',
  showAdvancedOptions: false,
  enableDebugMode: false,
  // Chat Preferences
  enableAutoScroll: true,
  showTimestamps: true,
  enableSoundNotifications: false,
  messageHistory: 100,
  // Task Execution Preferences
  defaultExecutionMode: 'auto',
  pollingInterval: 2,
  enableProgressIndicators: true,
  autoSwitchToWebSocketForWorkflows: false,
  immediateTimeoutDuration: 30,
  showExecutionModeIndicator: true,
  enableQuickModeToggle: true,
  // Performance Preferences
  enableCaching: true,
  cacheDuration: 30,
  enableOfflineMode: false,
  // Developer Preferences
  showApiMetadata: false,
  enableRequestLogging: false,
  showHealthStatus: true,
  // Accessibility Preferences
  enableHighContrast: false,
  fontSize: 'medium',
  enableScreenReader: false,
  // Session Management
  persistSessions: true,
  autoSaveInterval: 30,
  maxSessions: 10,
};
export const useUserPreferencesStore = defineStore('userPreferences', () => {
  // Reactive state
  const currentUser = ref<UserProfile | null>(null);
  const preferences = ref<UserPreferences>({ ...DEFAULT_PREFERENCES });
  const isLoading = ref(false);
  const lastSaved = ref<Date | null>(null);
  // Computed properties
  const effectiveTheme = computed(() => {
    if (preferences.value.theme === 'auto') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return preferences.value.theme;
  });
  const preferredEndpoint = computed(() => {
    const available = [{ version: 'v1', technology: 'typescript-nestjs' }]; // Simplified for unified API
    return available.find(ep => 
      ep.version === preferences.value.preferredApiVersion && 
      ep.technology === preferences.value.preferredTechnology
    ) || available[0];
  });
  const isAdvancedUser = computed(() => {
    return currentUser.value?.role === 'developer' || 
           currentUser.value?.role === 'admin' ||
           preferences.value.showAdvancedOptions;
  });

  const preferredProvider = computed(() => preferences.value.preferredProviderName);
  const preferredModel = computed(() => preferences.value.preferredModelName);
  // Watchers for automatic preference application
  // API version switching removed - only NestJS v1 is supported
  watch(
    () => preferences.value.theme,
    (newTheme) => {
      applyTheme(newTheme);
    }
  );
  // Actions
  const initializePreferences = async () => {
    isLoading.value = true;
    try {
      await loadUserProfile();
      await loadPreferences();
      applyPreferences();
      setupAutoSave();
    } catch {
      // Failed to load preferences, continue with defaults
    } finally {
      isLoading.value = false;
    }
  };
  const loadUserProfile = async () => {
    try {
      const saved = localStorage.getItem('userProfile');
      if (saved) {
        const profile = JSON.parse(saved);
        profile.createdAt = new Date(profile.createdAt);
        profile.lastActive = new Date(profile.lastActive);
        currentUser.value = profile;
      } else {
        // Create default user profile
        currentUser.value = {
          id: generateUUID(),
          name: 'Anonymous User',
          role: 'user',
          preferences: { ...DEFAULT_PREFERENCES },
          createdAt: new Date(),
          lastActive: new Date(),
        };
        saveUserProfile();
      }
    } catch {
      // Create fallback profile
      currentUser.value = {
        id: 'fallback',
        name: 'Anonymous User',
        role: 'user',
        preferences: { ...DEFAULT_PREFERENCES },
        createdAt: new Date(),
        lastActive: new Date(),
      };
    }
  };
  const loadPreferences = async () => {
    try {
      const saved = localStorage.getItem('userPreferences');
      if (saved) {
        const loadedPrefs = JSON.parse(saved);
        // Merge with defaults to handle new preference fields
        preferences.value = { ...DEFAULT_PREFERENCES, ...loadedPrefs };
      }
    } catch {
      preferences.value = { ...DEFAULT_PREFERENCES };
    }
  };
  const savePreferences = () => {
    try {
      localStorage.setItem('userPreferences', JSON.stringify(preferences.value));
      lastSaved.value = new Date();
      // Update user profile with current preferences
      if (currentUser.value) {
        currentUser.value.preferences = { ...preferences.value };
        currentUser.value.lastActive = new Date();
        saveUserProfile();
      }
    } catch {
      // Failed to save preferences
    }
  };
  const saveUserProfile = () => {
    try {
      if (currentUser.value) {
        localStorage.setItem('userProfile', JSON.stringify(currentUser.value));
      }
    } catch {
      // Failed to save user profile
    }
  };
  const updatePreference = <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K]
  ) => {
    (preferences.value as UserPreferences)[key] = value;
    savePreferences();
  };
  const updateMultiplePreferences = (updates: Partial<UserPreferences>) => {
    Object.assign(preferences.value, updates);
    savePreferences();
  };
  const resetPreferences = () => {
    preferences.value = { ...DEFAULT_PREFERENCES };
    savePreferences();
  };
  const resetToDefaults = <K extends keyof UserPreferences>(category?: K) => {
    if (category) {
      preferences.value[category] = DEFAULT_PREFERENCES[category] as UserPreferences[K];
    } else {
      preferences.value = { ...DEFAULT_PREFERENCES };
    }
    savePreferences();
  };
  const applyPreferences = () => {
    applyTheme(preferences.value.theme);
    applyApiPreferences();
    applyAccessibilityPreferences();
    applyPerformancePreferences();
  };
  const applyTheme = (theme: 'light' | 'dark' | 'auto') => {
    const resolvedTheme: 'light' | 'dark' = theme === 'auto' 
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme;
    
    // Apply theme using data-theme attribute (matches existing CSS selectors)
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    
    // Apply Ionic's class-based dark mode (required for Ionic components)
    // This is the key class that dark.class.css looks for
    document.documentElement.classList.toggle('ion-palette-dark', resolvedTheme === 'dark');
    
    // Also apply body classes for compatibility with custom CSS
    const body = document.body;
    body.classList.remove('theme-light', 'theme-dark');
    body.classList.add(`theme-${resolvedTheme}`);
    
    // Update meta theme-color for mobile browsers
    let themeColorMeta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement;
    if (!themeColorMeta) {
      themeColorMeta = document.createElement('meta');
      themeColorMeta.name = 'theme-color';
      document.head.appendChild(themeColorMeta);
    }
    themeColorMeta.content = resolvedTheme === 'dark' ? '#1a1a1a' : '#ffffff';
  };
  const applyApiPreferences = async () => {
    if (preferences.value.rememberApiSelection && preferredEndpoint.value) {
      try {
        // Simplified for unified API - no switching needed
      } catch {
        // Failed to apply API preferences
      }
    }
  };
  const applyAccessibilityPreferences = () => {
    const body = document.body;
    // High contrast mode
    body.classList.toggle('high-contrast', preferences.value.enableHighContrast);
    // Font size
    body.classList.remove('font-small', 'font-medium', 'font-large');
    body.classList.add(`font-${preferences.value.fontSize}`);
    // Screen reader support
    if (preferences.value.enableScreenReader) {
      body.setAttribute('data-screen-reader', 'true');
    } else {
      body.removeAttribute('data-screen-reader');
    }
  };
  const applyPerformancePreferences = () => {
    // Configure caching behavior
    if (preferences.value.enableCaching) {
      // Could set cache headers or configure service worker
    }
    // Configure offline mode
    if (preferences.value.enableOfflineMode) {
      // Could register service worker for offline functionality
    }
  };
  let autoSaveInterval: number | null = null;
  const setupAutoSave = () => {
    if (autoSaveInterval) {
      clearInterval(autoSaveInterval);
    }
    if (preferences.value.autoSaveInterval > 0) {
      autoSaveInterval = window.setInterval(() => {
        savePreferences();
      }, preferences.value.autoSaveInterval * 1000);
    }
  };
  const exportPreferences = () => {
    return {
      userProfile: currentUser.value,
      preferences: preferences.value,
      exportedAt: new Date().toISOString(),
      version: '1.0.0',
    };
  };
  const importPreferences = (data: PreferencesImportData) => {
    if (data.preferences) {
      preferences.value = { ...DEFAULT_PREFERENCES, ...data.preferences };
    }
    if (data.userProfile) {
      const baseProfile: UserProfile = currentUser.value ?? {
        id: generateUUID(),
        name: 'Anonymous User',
        role: 'user',
        email: undefined,
        preferences: { ...DEFAULT_PREFERENCES },
        createdAt: new Date(),
        lastActive: new Date(),
      };

      currentUser.value = {
        ...baseProfile,
        ...data.userProfile,
        preferences: {
          ...DEFAULT_PREFERENCES,
          ...(data.userProfile.preferences ?? baseProfile.preferences),
        },
        createdAt: new Date(data.userProfile.createdAt ?? baseProfile.createdAt),
        lastActive: new Date(data.userProfile.lastActive ?? new Date()),
      };
    }
    savePreferences();
    applyPreferences();
  };
  // Quick access methods for common preferences
  const setApiVersion = async (version: ApiVersion) => {
    updatePreference('preferredApiVersion', version);
    if (preferences.value.rememberApiSelection) {
      await applyApiPreferences();
    }
  };
  const setTheme = (theme: 'light' | 'dark' | 'auto') => {
    updatePreference('theme', theme);
  };
  const toggleAdvancedMode = () => {
    updatePreference('showAdvancedOptions', !preferences.value.showAdvancedOptions);
  };
  const toggleDebugMode = () => {
    updatePreference('enableDebugMode', !preferences.value.enableDebugMode);
  };
  // Task execution convenience methods
  const setExecutionMode = (mode: 'immediate' | 'polling' | 'real-time' | 'auto') => {
    updatePreference('defaultExecutionMode', mode);
  };
  const toggleProgressIndicators = () => {
    updatePreference('enableProgressIndicators', !preferences.value.enableProgressIndicators);
  };
  const toggleQuickModeToggle = () => {
    updatePreference('enableQuickModeToggle', !preferences.value.enableQuickModeToggle);
  };
  const setPollingInterval = (seconds: number) => {
    updatePreference('pollingInterval', Math.max(1, Math.min(60, seconds)));
  };
  const setImmediateTimeout = (seconds: number) => {
    updatePreference('immediateTimeoutDuration', Math.max(5, Math.min(300, seconds)));
  };

  // LLM preference helpers
  const setPreferredProvider = (providerName: string) => {
    updatePreference('preferredProviderName', providerName);
  };
  const setPreferredModel = (modelName: string) => {
    updatePreference('preferredModelName', modelName);
  };
  const setLLMPreferences = (providerName: string, modelName: string) => {
    updateMultiplePreferences({
      preferredProviderName: providerName,
      preferredModelName: modelName,
    });
  };

  // Listen for system theme changes
  if (typeof window !== 'undefined') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (preferences.value.theme === 'auto') {
        applyTheme('auto');
      }
    });
  }
  return {
    // State
    currentUser,
    preferences,
    isLoading,
    lastSaved,
    // Computed
    effectiveTheme,
    preferredEndpoint,
    isAdvancedUser,
    preferredProvider,
    preferredModel,
    // Actions
    initializePreferences,
    loadUserProfile,
    loadPreferences,
    savePreferences,
    updatePreference,
    updateMultiplePreferences,
    resetPreferences,
    resetToDefaults,
    applyPreferences,
    exportPreferences,
    importPreferences,
    // Quick access
    setApiVersion,
    setTheme,
    toggleAdvancedMode,
    toggleDebugMode,
    // Task execution quick access
    setExecutionMode,
    toggleProgressIndicators,
    toggleQuickModeToggle,
    setPollingInterval,
    setImmediateTimeout,
    // LLM preference quick access
    setPreferredProvider,
    setPreferredModel,
    setLLMPreferences,
  };
}); 
