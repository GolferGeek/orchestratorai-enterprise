import axios, {
  AxiosError,
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";
import axiosRetry from "axios-retry";
import type { JsonObject, JsonValue } from "@orchestrator-ai/transport-types";
import { TaskResponse, AgentInfo } from "../types/chat";
import {
  LLMSelection,
  SendMessageRequest,
  SendMessageResponse,
} from "../types/llm";
import type { AgentHierarchyResponse } from "@/types/agent";
import {
  getSecureApiBaseUrl,
  getSecureHeaders,
  validateSecureContext,
  logSecurityConfig,
} from "../utils/securityConfig";
import { useApiSanitization } from "@/composables/useApiSanitization";
import { useErrorStore } from "@/stores/errorStore";
import { trackAPI } from "../utils/performanceMonitor";
import { tokenStorage } from "./tokenStorageService";

type ConversationHistoryItem = {
  role: string;
  content: string;
  metadata?: JsonObject;
};

type OrchestratorTaskResult = JsonObject &
  LLMContentCarrier & {
    success?: boolean;
    metadata?: JsonObject;
  };

type RequestConfig = InternalAxiosRequestConfig & {
  _suppress404Logging?: boolean;
  _suppressStatuses?: number[];
  _retryCount?: number;
};

interface ApiErrorContext {
  url: string;
  method: string;
  status?: number;
  statusText?: string;
  responseData?: unknown;
  requestData?: unknown;
  timeout: boolean;
  networkError: boolean;
  retryCount: number;
  timestamp: number;
}

type LLMContentCarrier = {
  content?: string;
  response?: string;
  message?: string;
  result?: string;
};

const extractLLMContent = (
  payload: LLMContentCarrier | null | undefined,
  fallback = "Task completed",
): string => {
  if (!payload) {
    return fallback;
  }

  const candidates = [
    payload.content,
    payload.response,
    payload.message,
    payload.result,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }

  return fallback;
};

// Extend Axios types to include our custom metadata
declare module "axios" {
  interface InternalAxiosRequestConfig {
    metadata?: {
      startTime?: number;
    };
    _suppress404Logging?: boolean;
    _suppressStatuses?: number[];
    _retry?: boolean;
    _retryCount?: number;
  }
}

// Validate security context on startup
validateSecureContext();

// API endpoint configuration with HTTPS enforcement
const API_BASE_URL = getSecureApiBaseUrl();

interface JsonRpcResponse<Result = JsonValue> {
  jsonrpc: "2.0";
  result?: Result;
  error?: {
    code: number;
    message: string;
    data?: JsonValue;
  };
  id: string | number | null;
}

class ApiService {
  private axiosInstance: AxiosInstance;
  private apiSanitization = useApiSanitization();
  private _errorStore?: ReturnType<typeof useErrorStore>;

  // Refresh deduplication: only one refresh at a time, all concurrent 401s wait for the same result
  private isRefreshingToken = false;
  private refreshPromise: Promise<string | null> | null = null;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: API_BASE_URL,
      headers: getSecureHeaders(),
      timeout: parseInt(import.meta.env.VITE_API_TIMEOUT_MS || "120000", 10),
      // Additional security settings
      withCredentials: false, // Don't send credentials cross-origin unless explicitly needed
      maxRedirects: 0, // Prevent redirect attacks
    });

    // Log security configuration in development
    if (import.meta.env.DEV) {
      logSecurityConfig();
    }

    // Configure retry logic for failed requests
    axiosRetry(this.axiosInstance, {
      retries: 3, // Number of retry attempts
      retryDelay: axiosRetry.exponentialDelay, // Exponential backoff
      retryCondition: (error) => {
        // Retry on network errors or 5xx server errors
        return (
          axiosRetry.isNetworkOrIdempotentRequestError(error) ||
          (error.response?.status ? error.response.status >= 500 : false) ||
          error.response?.status === 429
        ); // Rate limiting
      },
      onRetry: (_retryCount, _error, _requestConfig) => {},
    });

    // Add request interceptor for performance tracking
    this.axiosInstance.interceptors.request.use(
      (config) => {
        // Add start time for performance tracking
        config.metadata = { startTime: performance.now() };
        return config;
      },
      (error) => Promise.reject(error),
    );

    // Add response interceptor for error handling, automatic token refresh, and performance tracking
    this.axiosInstance.interceptors.response.use(
      (response: AxiosResponse) => {
        // Track API performance
        const config = response.config as RequestConfig;
        if (config.metadata?.startTime) {
          const responseTime = performance.now() - config.metadata.startTime;
          const endpoint = config.url || "unknown";
          const method = (config.method || "GET").toUpperCase();
          trackAPI(endpoint, method, responseTime, response.status);
        }
        return response;
      },
      async (error: AxiosError) => {
        const originalRequest = (error.config || {}) as RequestConfig;

        // Track API performance for errors too
        if (originalRequest.metadata?.startTime) {
          const responseTime =
            performance.now() - originalRequest.metadata.startTime;
          const endpoint = originalRequest.url || "unknown";
          const method = (originalRequest.method || "GET").toUpperCase();
          const status = error.response?.status || 0;
          trackAPI(endpoint, method, responseTime, status);
        }

        // Global API failure detection - log all API errors
        this.logApiFailure(error, originalRequest);

        // If error is 401 and we haven't already tried to refresh
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          // Use deduplicated refresh: all concurrent 401s share one refresh attempt
          const newToken = await this.deduplicatedRefresh();

          if (newToken) {
            // Retry the original request with the new token
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return this.axiosInstance(originalRequest);
          }
        }

        return Promise.reject(error);
      },
    );
  }

  /**
   * Get error store instance (lazy-loaded)
   */
  private get errorStore() {
    if (!this._errorStore) {
      this._errorStore = useErrorStore();
    }
    return this._errorStore;
  }

  /**
   * Global API failure detection and logging
   */
  private logApiFailure(error: AxiosError, requestConfig?: RequestConfig) {
    try {
      // Skip logging for optional endpoints when explicitly requested
      const status = error?.response?.status;
      const suppressed: number[] = Array.isArray(
        requestConfig?._suppressStatuses,
      )
        ? (requestConfig._suppressStatuses as number[])
        : [];
      if (
        (requestConfig?._suppress404Logging && status === 404) ||
        (suppressed.length && status && suppressed.includes(status))
      ) {
        return;
      }
      // Determine error type and severity
      const errorType = this.determineErrorType(error);
      const severity = this.determineErrorSeverity(error);

      // Create comprehensive error context
      const context: ApiErrorContext = {
        url: requestConfig?.url || "unknown",
        method: (requestConfig?.method || "get").toUpperCase(),
        status: error.response?.status,
        statusText: error.response?.statusText,
        responseData: error.response?.data,
        requestData: requestConfig?.data,
        timeout: error.code === "ECONNABORTED",
        networkError: !error.response,
        retryCount: requestConfig?._retryCount ?? 0,
        timestamp: Date.now(),
      };

      // Log to error store
      const apiError = new Error(this.formatErrorMessage(error, context));
      apiError.stack = error.stack;
      apiError.name = "ApiError";

      this.errorStore.addError(apiError, {
        component: "ApiService",
        url: context.url,
        additionalContext: {
          ...context,
          originalErrorType: errorType,
          originalSeverity: severity,
        } as unknown as import("@/types/index").JsonObject,
      });

      // Console logging for development
      if (import.meta.env.DEV) {
        console.group(`🚨 API Failure Detected [${severity.toUpperCase()}]`);
        console.error("Error:", error.message);
        console.groupEnd();
      }

      // Check for critical patterns that need immediate attention
      this.checkForCriticalPatterns(error, context);
    } catch (loggingError) {
      console.error("Failed to log API failure:", loggingError);
    }
  }

  /**
   * Determine the type of error for categorization
   */
  private determineErrorType(
    error: AxiosError,
  ): "network" | "api" | "permission" | "validation" | "unknown" {
    if (!error.response) {
      return "network"; // Network/connection errors
    }

    const status = error.response.status;
    if (status === 401 || status === 403) {
      return "permission";
    }
    if (status >= 400 && status < 500) {
      return "validation"; // Client errors
    }
    if (status >= 500) {
      return "api"; // Server errors
    }

    return "unknown";
  }

  /**
   * Determine error severity based on status and context
   */
  private determineErrorSeverity(
    error: AxiosError,
  ): "low" | "medium" | "high" | "critical" {
    const status = error.response?.status;

    // Network errors are always high severity
    if (!error.response) {
      return "high";
    }

    // Critical server errors
    if (status !== undefined && status >= 500) {
      return "critical";
    }

    // Auth errors are high priority
    if (status === 401 || status === 403) {
      return "high";
    }

    // Client errors are medium
    if (status !== undefined && status >= 400 && status < 500) {
      return "medium";
    }

    return "low";
  }

  /**
   * Format a user-friendly error message
   */
  private formatErrorMessage(
    error: AxiosError,
    context: ApiErrorContext,
  ): string {
    const { status, method, url } = context;

    if (!error.response) {
      return `Network connection failed for ${method} ${url}`;
    }

    switch (status) {
      case 401:
        return "Authentication required - please log in again";
      case 403:
        return "Access denied - insufficient permissions";
      case 404:
        return `Resource not found: ${method} ${url}`;
      case 429:
        return "Too many requests - please wait and try again";
      case 500:
        return "Server error - our team has been notified";
      case 502:
      case 503:
      case 504:
        return "Service temporarily unavailable - please try again";
      default:
        return `API request failed: ${method} ${url} (${status})`;
    }
  }

  /**
   * Check for patterns that indicate critical system issues
   */
  private checkForCriticalPatterns(
    error: AxiosError,
    context: ApiErrorContext,
  ) {
    // Pattern 1: Multiple 5xx errors in short time frame
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const recentServerErrors = this.errorStore.recentErrors.filter(
      (e: { timestamp: number; context?: { status?: number } }) =>
        e.timestamp > fiveMinutesAgo &&
        e.context?.status !== undefined &&
        e.context.status >= 500,
    );

    if (recentServerErrors.length >= 3) {
      const outageError = new Error(
        "Critical: Multiple server errors detected - possible system outage",
      );
      outageError.name = "SystemOutageError";
      this.errorStore.addError(outageError, {
        component: "ApiService",
        additionalContext: {
          pattern: "server_outage",
          errorCount: recentServerErrors.length,
          severity: "critical",
        },
      });
    }

    // Pattern 2: Network connectivity issues
    if (!error.response && context.retryCount >= 2) {
      const networkError = new Error(
        "Critical: Persistent network connectivity issues detected",
      );
      networkError.name = "NetworkOutageError";
      this.errorStore.addError(networkError, {
        component: "ApiService",
        additionalContext: {
          pattern: "network_outage",
          retryCount: context.retryCount,
          severity: "critical",
        },
      });
    }

    // Pattern 3: Auth system failures
    if (context.status === 401 && context.url.includes("/auth/")) {
      const authError = new Error(
        "Critical: Authentication system failure detected",
      );
      authError.name = "AuthSystemFailureError";
      this.errorStore.addError(authError, {
        component: "ApiService",
        url: context.url,
        additionalContext: {
          pattern: "auth_system_failure",
          severity: "critical",
        },
      });
    }
  }

  /**
   * Send enhanced message with LLM preferences to sessions API
   */
  async sendEnhancedMessage(
    sessionId: string,
    messageRequest: SendMessageRequest,
  ): Promise<SendMessageResponse> {
    const authToken = await tokenStorage.getAccessToken();

    // API now expects camelCase directly
    const apiRequest = {
      content: messageRequest.content,
      llmSelection: messageRequest.llmSelection,
    };

    const response = await this.axiosInstance.post<unknown>(
      `/sessions/${sessionId}/messages`,
      apiRequest,
      {
        headers: {
          Authorization: authToken ? `Bearer ${authToken}` : undefined,
        },
      },
    );

    // API now returns camelCase directly
    return response.data as SendMessageResponse;
  }

  /**
   * Post a task to the NestJS orchestrator (legacy method)
   */
  async postTaskToOrchestrator(
    userInputText: string,
    sessionId?: string | null,
    conversationHistory?: ConversationHistoryItem[],
    llmSelection?: LLMSelection,
  ): Promise<TaskResponse> {
    // Get the current auth token from secure storage to pass to orchestrator
    const authToken = await tokenStorage.getAccessToken();

    // Get current user information for proper database RLS
    let currentUser = null;
    if (authToken) {
      try {
        // Ensure auth token is set in headers for the /auth/me request
        const userResponse = await this.axiosInstance.get("/auth/me", {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });
        currentUser = userResponse.data;
      } catch {
        // Silently ignore user fetch errors
      }
    }

    // Create and sanitize the request payload
    const requestPayload = {
      jsonrpc: "2.0",
      method: "handle_request",
      params: {
        message: userInputText,
        session_id: sessionId,
        conversation_history: conversationHistory || [],
        authToken: authToken, // Pass auth token to orchestrator for agent pool refresh
        currentUser: currentUser, // Pass current user for database RLS
        // Add LLM preferences if provided (API expects camelCase)
        ...(llmSelection && { llmSelection }),
      },
      id: Date.now(), // Use timestamp as unique ID
    };

    // Sanitize the orchestrator request params
    const paramsToSanitize = {
      ...requestPayload.params,
      session_id: requestPayload.params.session_id || undefined, // Convert null to undefined
    };
    const sanitizedParams =
      this.apiSanitization.sanitizeRequest(paramsToSanitize);
    const sanitizedPayload = { ...requestPayload, params: sanitizedParams };

    const response = await this.axiosInstance.post<
      JsonRpcResponse<OrchestratorTaskResult>
    >("/agents/orchestrator/orchestrator/tasks", sanitizedPayload, {
      headers: {
        Authorization: authToken ? `Bearer ${authToken}` : undefined,
      },
    });

    const jsonRpcResponse = response.data;

    if (jsonRpcResponse.error) {
      throw new Error(
        `JSON-RPC Error ${jsonRpcResponse.error.code}: ${jsonRpcResponse.error.message}`,
      );
    }

    if (jsonRpcResponse.result) {
      const result = jsonRpcResponse.result;

      // Extract agent name from metadata
      let respondingAgentName = "Agent"; // default for NestJS
      if (result.metadata) {
        const metadata = result.metadata as Record<string, JsonValue>;
        respondingAgentName =
          (metadata.delegatedTo as string) ||
          ((metadata.originalAgent as Record<string, JsonValue>)
            ?.agentName as string) ||
          (metadata.agentName as string) ||
          (metadata.respondingAgentName as string) ||
          "Agent";
      }

      return {
        id: jsonRpcResponse.id?.toString() || Date.now().toString(),
        status: {
          state: result.success ? "completed" : "failed",
          timestamp: new Date().toISOString(),
          message: result.success
            ? "Task completed successfully"
            : "Task failed",
        },
        result: extractLLMContent(result, "Success"),
        metadata: {
          agentName: respondingAgentName,
          respondingAgentName: respondingAgentName,
          ...result.metadata,
        },
        response_message: {
          role: "assistant",
          parts: [
            {
              type: "text",
              text: extractLLMContent(result, "Task completed"),
            },
          ],
          metadata: {
            respondingAgentName: respondingAgentName,
          },
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        session_id: sessionId || null,
      };
    }

    throw new Error("No result in JSON-RPC response");
  }

  /**
   * Get available NestJS agents
   */
  async getAvailableAgents(organization?: string): Promise<AgentInfo[]> {
    const response = await this.axiosInstance.get<{ agents: AgentInfo[] }>(
      "/agents",
      {
        headers: organization ? { "x-organization-slug": organization } : {},
      },
    );
    return response.data.agents || [];
  }

  async getAgentHierarchy(
    organization?: string,
  ): Promise<AgentHierarchyResponse> {
    // Use department-based hierarchy endpoint

    const response = await this.axiosInstance.get<AgentHierarchyResponse>(
      "/hierarchy/.well-known/hierarchy",
      {
        headers: organization ? { "x-organization-slug": organization } : {},
      },
    );
    return response.data;
  }

  /**
   * Health check for NestJS API
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.axiosInstance.get("/health");
      return response.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * Get NestJS agent pool statistics
   */
  async getAgentPoolStats(): Promise<unknown> {
    const response = await this.axiosInstance.get("/agent-pool/stats");
    return response.data;
  }

  /**
   * Get NestJS registered agents
   */
  async getRegisteredAgents(): Promise<unknown> {
    const response = await this.axiosInstance.get("/agent-pool/agents");
    return response.data;
  }

  /**
   * Get agent details by ID
   */
  async getAgentDetails(agentId: string): Promise<AgentInfo> {
    const response = await this.axiosInstance.get<AgentInfo>(
      `/agents/${agentId}`,
    );
    return response.data;
  }

  /**
   * Check if a feature is supported
   */
  isFeatureSupported(feature: string): boolean {
    // NestJS supports all current features
    const supportedFeatures = [
      "orchestrator",
      "agent_discovery",
      "session_management",
      "agent_pool_stats",
    ];
    return supportedFeatures.includes(feature);
  }

  /**
   * Update authorization token
   */
  async setAuthToken(token: string | null): Promise<void> {
    if (token) {
      this.axiosInstance.defaults.headers.common["Authorization"] =
        `Bearer ${token}`;
    } else {
      delete this.axiosInstance.defaults.headers.common["Authorization"];
    }
  }

  /**
   * Clear authorization
   */
  clearAuth(): void {
    delete this.axiosInstance.defaults.headers.common["Authorization"];
  }

  /**
   * Deduplicated token refresh.
   * When multiple concurrent 401s arrive, only the FIRST triggers the actual refresh.
   * All others wait for that same promise. This prevents racing on
   * single-use refresh tokens (common with credential-based auth providers).
   *
   * @returns The new access token, or null if refresh failed
   */
  private async deduplicatedRefresh(): Promise<string | null> {
    // If a refresh is already in flight, wait for it
    if (this.isRefreshingToken && this.refreshPromise) {
      return this.refreshPromise;
    }

    this.isRefreshingToken = true;
    this.refreshPromise = (async () => {
      // Dynamic import to avoid circular dependency with auth providers
      const { getAuthProvider } = await import("@/services/auth");
      const authProvider = getAuthProvider();

      const tokenData = await authProvider.refreshToken();
      const { accessToken } = tokenData;

      // Update stored tokens in secure storage
      await tokenStorage.setAccessToken(accessToken);
      if (tokenData.refreshToken) {
        await tokenStorage.setRefreshToken(tokenData.refreshToken);
      }

      // Update default headers
      await this.setAuthToken(accessToken);

      return accessToken;
    })().catch(async (refreshError) => {
      // Clear auth data and force re-login
      await tokenStorage.clearTokens();
      this.clearAuth();

      this.logApiFailure(
        refreshError as AxiosError,
        { url: "/auth/refresh", method: "POST" } as RequestConfig,
      );

      window.dispatchEvent(new CustomEvent("auth:session-expired"));
      return null;
    }).finally(() => {
      this.isRefreshingToken = false;
      this.refreshPromise = null;
    });

    return this.refreshPromise;
  }

  /**
   * Create a new session
   */
  async createSession(name: string): Promise<unknown> {
    const authToken = await tokenStorage.getAccessToken();

    const response = await this.axiosInstance.post(
      "/sessions",
      { name },
      {
        headers: {
          Authorization: authToken ? `Bearer ${authToken}` : undefined,
        },
      },
    );

    return response.data;
  }

  /**
   * Get session messages with LLM evaluation data
   */
  async getSessionMessages(
    sessionId: string,
    options: {
      skip?: number;
      limit?: number;
      includeEvaluations?: boolean;
      includeLlmData?: boolean;
    } = {},
  ): Promise<SendMessageResponse[]> {
    const authToken = await tokenStorage.getAccessToken();

    const queryParams = new URLSearchParams();
    if (options.skip !== undefined)
      queryParams.append("skip", options.skip.toString());
    if (options.limit !== undefined)
      queryParams.append("limit", options.limit.toString());
    if (options.includeEvaluations)
      queryParams.append("include_evaluations", "true");
    if (options.includeLlmData) queryParams.append("include_llm_data", "true");

    const response = await this.axiosInstance.get(
      `/sessions/${sessionId}/messages/enhanced?${queryParams.toString()}`,
      {
        headers: {
          Authorization: authToken ? `Bearer ${authToken}` : undefined,
        },
      },
    );

    return response.data;
  }

  /**
   * Get user sessions
   */
  async getUserSessions(
    skip: number = 0,
    limit: number = 100,
  ): Promise<unknown> {
    const authToken = await tokenStorage.getAccessToken();

    const response = await this.axiosInstance.get(
      `/sessions?skip=${skip}&limit=${limit}`,
      {
        headers: {
          Authorization: authToken ? `Bearer ${authToken}` : undefined,
        },
      },
    );

    return response.data;
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    const authToken = await tokenStorage.getAccessToken();

    await this.axiosInstance.delete(`/sessions/${sessionId}`, {
      headers: {
        Authorization: authToken ? `Bearer ${authToken}` : undefined,
      },
    });
  }

  /**
   * Get agents list for modal display (UI endpoint)
   */
  async getAgentsList(): Promise<unknown> {
    const authToken = await tokenStorage.getAccessToken();
    const response = await this.axiosInstance.get(
      "/orchestrator/ui/agents-list",
      {
        headers: {
          Authorization: authToken ? `Bearer ${authToken}` : undefined,
        },
      },
    );

    return response.data;
  }

  /**
   * Get agent capabilities for modal display (UI endpoint)
   */
  async getAgentCapabilities(agentName: string): Promise<unknown> {
    const authToken = await tokenStorage.getAccessToken();
    const response = await this.axiosInstance.get(
      `/orchestrator/ui/agent-capabilities/${encodeURIComponent(agentName)}`,
      {
        headers: {
          Authorization: authToken ? `Bearer ${authToken}` : undefined,
        },
      },
    );

    return response.data;
  }

  /**
   * Get current user profile
   */
  async getCurrentUser(): Promise<unknown> {
    const authToken = await tokenStorage.getAccessToken();
    const response = await this.axiosInstance.get("/auth/me", {
      headers: {
        Authorization: authToken ? `Bearer ${authToken}` : undefined,
      },
    });

    return response.data;
  }

  /**
   * Login with email and password
   */
  async login(credentials: {
    email: string;
    password: string;
  }): Promise<unknown> {
    const response = await this.axiosInstance.post("/auth/login", credentials);
    return response.data;
  }

  /**
   * Sign up with email and password
   */
  async signup(credentials: {
    email: string;
    password: string;
  }): Promise<unknown> {
    const response = await this.axiosInstance.post("/auth/signup", credentials);
    return response.data;
  }

  /**
   * Refresh auth token
   */
  async refreshToken(refreshToken: string): Promise<unknown> {
    const response = await this.axiosInstance.post("/auth/refresh", {
      refreshToken,
    });
    return response.data;
  }

  /**
   * Generic GET method
   */
  async get<T = unknown>(
    url: string,
    options?: { suppressErrors?: boolean; headers?: Record<string, string> },
  ): Promise<T> {
    try {
      // Use axios default headers (set via setAuthToken) instead of manually fetching from localStorage
      const config: Record<string, unknown> = {};
      if (options?.suppressErrors) {
        config._suppressStatuses = [404];
      }
      if (options?.headers) {
        config.headers = options.headers;
      }
      const response = await this.axiosInstance.get<T>(url, config);

      return response.data;
    } catch (error) {
      console.error(`ApiService.get error for ${url}:`, error);
      throw error;
    }
  }

  /**
   * GET but suppress error-store logging for 404s (for optional/demo endpoints)
   */
  async getQuiet404<T = unknown>(url: string): Promise<T> {
    const response = await this.axiosInstance.get<T>(url, {
      _suppress404Logging: true,
    } as InternalAxiosRequestConfig);
    return response.data;
  }

  /**
   * Generic POST method
   */
  async post<T = unknown, Body = unknown>(
    url: string,
    data?: Body,
    options?: { headers?: Record<string, string> },
  ): Promise<T> {
    try {
      // Use axios default headers (set via setAuthToken) instead of manually fetching from localStorage
      const config: Record<string, unknown> = {};
      if (options?.headers) {
        config.headers = options.headers;
      }
      const response = await this.axiosInstance.post<T>(url, data, config);

      return response.data;
    } catch (error) {
      console.error(`ApiService.post error for ${url}:`, error);
      throw error;
    }
  }

  /**
   * POST FormData (for file uploads)
   * This method properly handles multipart/form-data by not setting Content-Type
   * so axios can set it with the correct boundary
   */
  async postFormData<T = unknown>(
    url: string,
    formData: FormData,
    additionalHeaders?: Record<string, string>,
  ): Promise<T> {
    try {
      const response = await this.axiosInstance.post<T>(url, formData, {
        headers: {
          ...additionalHeaders,
          // Explicitly remove Content-Type so axios sets multipart/form-data with boundary
          "Content-Type": undefined as unknown as string,
        },
        // Ensure axios doesn't transform the data
        transformRequest: [(data) => data],
      });
      return response.data;
    } catch (error) {
      console.error(`ApiService.postFormData error for ${url}:`, error);
      throw error;
    }
  }

  /**
   * Generic PUT method
   */
  async put<T = unknown, Body = unknown>(
    url: string,
    data?: Body,
    options?: { headers?: Record<string, string> },
  ): Promise<T> {
    const config: Record<string, unknown> = {};
    if (options?.headers) {
      config.headers = options.headers;
    }
    const response = await this.axiosInstance.put<T>(url, data, config);
    return response.data;
  }

  /**
   * Generic PATCH method
   */
  async patch<T = unknown, Body = unknown>(
    url: string,
    data?: Body,
    options?: { headers?: Record<string, string> },
  ): Promise<T> {
    const config: Record<string, unknown> = {};
    if (options?.headers) {
      config.headers = options.headers;
    }
    const response = await this.axiosInstance.patch<T>(url, data, config);
    return response.data;
  }

  /**
   * Generic DELETE method
   */
  async delete<T = unknown>(
    url: string,
    options?: { headers?: Record<string, string> },
  ): Promise<T> {
    const config: Record<string, unknown> = {};
    if (options?.headers) {
      config.headers = options.headers;
    }
    const response = await this.axiosInstance.delete<T>(url, config);
    return response.data;
  }

  /**
   * Get base URL
   */
  getBaseUrl(): string {
    return API_BASE_URL;
  }

  /**
   * Process conversation with audio input via A2A tasks endpoint
   * IMPORTANT: This must match the exact format that normal text messages use
   */
  async processConversation(data: {
    conversationId: string;
    audioData: string;
    encoding: string;
    sampleRate: number;
    agentName?: string;
    agentType?: string;
    llmSelection?: LLMSelection;
  }): Promise<{
    transcript: string;
    response: string;
    responseAudio?: string;
  }> {
    try {
      const authToken = await tokenStorage.getAccessToken();

      // Use default agent if not specified
      const agentName = data.agentName || "assistant";
      const agentType = data.agentType || "generalists";

      // Build conversation history (simplified for speech - we don't have access to the full chat store here)
      // In a real implementation, this should come from the ConversationalSpeechButton component
      const conversationHistory: ConversationHistoryItem[] = [];

      // Debug: Log the incoming LLM selection

      // Use the LLM selection as-is - no fallbacks, let errors surface
      const llmSelection = data.llmSelection;

      // Generate unique task ID
      const taskId = crypto.randomUUID();

      // Send audio directly to A2A tasks endpoint with EXACT same format as normal text
      const taskRequest = {
        method: "process",
        prompt: data.audioData, // Send base64 audio as the prompt
        conversationId: data.conversationId,
        conversationHistory: conversationHistory,
        llmSelection: llmSelection,
        executionMode: "immediate", // Use immediate mode for speech
        taskId: taskId,
        metadata: {
          speechInput: true,
          originalEncoding: data.encoding,
          originalSampleRate: data.sampleRate,
          audioInput: true,
          encoding: data.encoding,
          sampleRate: data.sampleRate,
        },
      };

      const response = await this.axiosInstance.post(
        `/agents/${agentType}/${agentName}/tasks`,
        taskRequest,
        {
          headers: {
            Authorization: authToken ? `Bearer ${authToken}` : undefined,
            "Content-Type": "application/json",
          },
        },
      );

      const result = response.data;

      // Extract the response from the A2A task result
      const taskResponse = result.result;
      const transcribedText =
        result.audioInput?.transcribedText ||
        "Audio transcription not available";
      const responseText = extractLLMContent(
        taskResponse,
        "No response available",
      );
      const responseAudio = result.responseAudio; // Audio synthesis result if available

      return {
        transcript: transcribedText,
        response: responseText,
        responseAudio: responseAudio,
      };
    } catch (error) {
      console.error("A2A Audio processing error:", error);
      throw error;
    }
  }

  /**
   * Start a speech conversation session
   */
  async startSpeechConversation(conversationId: string): Promise<{
    sessionId: string;
    status: string;
  }> {
    try {
      const authToken = await tokenStorage.getAccessToken();

      const response = await this.axiosInstance.post(
        "/speech/start-conversation",
        { conversationId },
        {
          headers: {
            Authorization: authToken ? `Bearer ${authToken}` : undefined,
          },
        },
      );

      return response.data;
    } catch (error) {
      console.error("Speech start conversation error:", error);
      throw error;
    }
  }

  /**
   * End a speech conversation session
   */
  async endSpeechConversation(conversationId: string): Promise<void> {
    try {
      const authToken = await tokenStorage.getAccessToken();

      await this.axiosInstance.post(
        "/speech/end-conversation",
        { conversationId },
        {
          headers: {
            Authorization: authToken ? `Bearer ${authToken}` : undefined,
          },
        },
      );
    } catch (error) {
      console.error("Speech end conversation error:", error);
      throw error;
    }
  }

  /**
   * Process audio stream for speech
   */
  async processSpeechAudio(
    audioBlob: Blob,
    conversationId: string,
  ): Promise<{
    transcript: string;
    response: string;
    responseAudio?: string;
  }> {
    try {
      const authToken = await tokenStorage.getAccessToken();
      const formData = new FormData();
      formData.append("audio", audioBlob);
      formData.append("conversationId", conversationId);

      const response = await this.axiosInstance.post(
        "/speech/process-audio",
        formData,
        {
          headers: {
            Authorization: authToken ? `Bearer ${authToken}` : undefined,
            "Content-Type": "multipart/form-data",
          },
        },
      );

      return response.data;
    } catch (error) {
      console.error("Speech audio processing error:", error);
      throw error;
    }
  }

  /**
   * Revert uncommitted git changes (super-admin, dev only).
   */
  async gitRevert(): Promise<{ success: boolean; message: string }> {
    const authToken = await tokenStorage.getAccessToken();
    const response = await this.axiosInstance.post<{
      success: boolean;
      message: string;
    }>("/super-admin/git/revert", undefined, {
      headers: {
        Authorization: authToken ? `Bearer ${authToken}` : undefined,
      },
    });
    return response.data;
  }

  /**
   * Transcribe audio to text only
   */
  async transcribeAudio(
    audioData: string,
    encoding?: string,
    sampleRate?: number,
  ): Promise<{
    text: string;
    confidence: number;
  }> {
    try {
      const authToken = await tokenStorage.getAccessToken();

      const response = await this.axiosInstance.post(
        "/speech/transcribe",
        {
          audioData,
          encoding,
          sampleRate,
        },
        {
          headers: {
            Authorization: authToken ? `Bearer ${authToken}` : undefined,
            "Content-Type": "application/json",
          },
        },
      );

      return response.data;
    } catch (error) {
      console.error("Audio transcription error:", error);
      throw error;
    }
  }

  /**
   * Convert text to speech audio
   */
  async synthesizeText(
    text: string,
    voiceName?: string,
    speakingRate?: number,
  ): Promise<{
    audioData: string;
    format: string;
  }> {
    try {
      const authToken = await tokenStorage.getAccessToken();

      const response = await this.axiosInstance.post(
        "/speech/synthesize",
        {
          text,
          voiceName,
          speakingRate,
        },
        {
          headers: {
            Authorization: authToken ? `Bearer ${authToken}` : undefined,
            "Content-Type": "application/json",
          },
        },
      );

      return response.data;
    } catch (error) {
      console.error("Text-to-speech synthesis error:", error);
      throw error;
    }
  }
}

// Export singleton instance
export const apiService = new ApiService();

// Legacy export for backward compatibility
export const nestjsApiService = apiService;

// Default export for legacy compatibility
export default apiService;
