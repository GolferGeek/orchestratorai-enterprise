import axios, { AxiosInstance, AxiosError } from 'axios';
import { ApiClient, ApiEndpoint, ApiError, ApiResponse, ApiFeature } from '../../types/api';
import type { ConversationHistoryEntry } from '../../types/conversation';
import type { AgentInfo, TaskResponse } from '../../types/chat';
export abstract class BaseApiClient implements ApiClient {
  protected axiosInstance: AxiosInstance;
  protected endpoint: ApiEndpoint;
  constructor(endpoint: ApiEndpoint) {
    this.endpoint = endpoint;
    this.axiosInstance = axios.create({
      baseURL: endpoint.baseUrl,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 60000, // 60 second timeout for complex operations like blog generation
    });
    // Add response interceptor for consistent error handling
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        const apiError = this.handleAxiosError(error);
        return Promise.reject(apiError);
      }
    );
    // Add request interceptor to automatically include auth token
    this.axiosInstance.interceptors.request.use(
      (config) => {
        const token = this.getAuthToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );
  }
  /**
   * Get the current auth token from storage
   * TokenStorageService migrates tokens from localStorage to sessionStorage,
   * so we check sessionStorage first, then fall back to localStorage
   */
  private getAuthToken(): string | null {
    return sessionStorage.getItem('authToken') || localStorage.getItem('authToken');
  }
  // Update the authorization header for this client instance
  setAuthToken(token: string | null): void {
    if (token) {
      this.axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete this.axiosInstance.defaults.headers.common['Authorization'];
    }
  }
  // Abstract methods that must be implemented by specific API clients
  abstract postTaskToOrchestrator(
    userInputText: string,
    sessionId?: string | null,
    conversationHistory?: ConversationHistoryEntry[]
  ): Promise<TaskResponse>;
  abstract getAvailableAgents(): Promise<AgentInfo[]>;
  // Concrete implementations
  getEndpointInfo(): ApiEndpoint {
    return { ...this.endpoint };
  }
  isFeatureSupported(feature: ApiFeature): boolean {
    return this.endpoint.features.includes(feature);
  }
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.axiosInstance.get('/health');
      return response.status === 200;
    } catch {
      return false;
    }
  }
  // Utility methods
  protected handleAxiosError(error: AxiosError): ApiError {
    const apiError: ApiError = {
      message: 'An error occurred while communicating with the API',
      endpoint: this.endpoint.name,
    };
    if (error.response) {
      // Server responded with error status
      apiError.statusCode = error.response.status;
      apiError.message = this.extractErrorMessage(error.response.data);
      apiError.details = error.response.data as ApiError['details'];
      // Special handling for authentication errors
      if (error.response.status === 401) {
        apiError.message = 'Authentication failed. Please try logging in again.';
      }
    } else if (error.request) {
      // Request was made but no response received
      apiError.message = 'No response received from the server';
      apiError.code = 'NETWORK_ERROR';
    } else {
      // Something else happened
      apiError.message = error.message;
    }
    return apiError;
  }
  private extractErrorMessage(data: unknown): string {
    if (typeof data === 'string') {
      return data;
    }
    if (data && typeof data === 'object') {
      // Try common error message fields
      const errorObj = data as Record<string, unknown>;
      if (errorObj.detail && typeof errorObj.detail === 'string') return errorObj.detail;
      if (errorObj.message && typeof errorObj.message === 'string') return errorObj.message;
      if (errorObj.error && typeof errorObj.error === 'string') return errorObj.error;
      if (errorObj.msg && typeof errorObj.msg === 'string') return errorObj.msg;
    }
    return 'An unexpected error occurred';
  }
  protected createSuccessResponse<T>(data: T): ApiResponse<T> {
    return {
      success: true,
      data,
      metadata: {
        version: this.endpoint.version,
        technology: this.endpoint.technology,
        timestamp: new Date().toISOString(),
      },
    };
  }
  protected createErrorResponse(error: ApiError): ApiResponse<never> {
    return {
      success: false,
      error,
      metadata: {
        version: this.endpoint.version,
        technology: this.endpoint.technology,
        timestamp: new Date().toISOString(),
      },
    };
  }
} 