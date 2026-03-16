/**
 * Auth API Client — Command Navigation Shell
 *
 * Minimal HTTP client for Auth API (port 6100) calls only.
 * Command is a navigation shell; it never calls business API endpoints.
 * All requests target the Auth API via the Vite proxy at /auth/*.
 *
 * Methods exposed:
 *   login()           — POST /auth/login
 *   signup()          — POST /auth/signup
 *   refreshToken()    — POST /auth/refresh
 *   getCurrentUser()  — GET  /auth/me
 *   setAuthToken()    — set Bearer token on instance
 *   clearAuth()       — remove Bearer token
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import axiosRetry from 'axios-retry';

interface LoginCredentials {
  email: string;
  password: string;
}

interface SignupCredentials {
  email: string;
  password: string;
  displayName?: string;
}

interface AuthTokenResponse {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresIn?: number;
}

interface UserProfile {
  id: string;
  email?: string;
  displayName?: string;
  roles: string[];
  organizationAccess?: string[];
}

class AuthApiService {
  private readonly instance: AxiosInstance;

  constructor() {
    this.instance = axios.create({
      // Requests go through Vite proxy /auth -> http://localhost:6100
      baseURL: '/',
      timeout: 30000,
      withCredentials: false,
      maxRedirects: 0,
    });

    axiosRetry(this.instance, {
      retries: 2,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error) =>
        axiosRetry.isNetworkOrIdempotentRequestError(error) ||
        (error.response?.status !== undefined && error.response.status >= 500),
    });

    // Automatic 401 → session-expired dispatch
    this.instance.interceptors.response.use(
      response => response,
      async (error: AxiosError) => {
        if (error.response?.status === 401) {
          window.dispatchEvent(new CustomEvent('auth:session-expired'));
        }
        return Promise.reject(error);
      },
    );
  }

  setAuthToken(token: string): void {
    this.instance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  clearAuth(): void {
    delete this.instance.defaults.headers.common['Authorization'];
  }

  async login(credentials: LoginCredentials): Promise<AuthTokenResponse> {
    const response = await this.instance.post<AuthTokenResponse>('/auth/login', credentials);
    return response.data;
  }

  async signup(data: SignupCredentials): Promise<AuthTokenResponse> {
    const response = await this.instance.post<AuthTokenResponse>('/auth/signup', data);
    return response.data;
  }

  async refreshToken(token: string): Promise<AuthTokenResponse> {
    const response = await this.instance.post<AuthTokenResponse>('/auth/refresh', {
      refreshToken: token,
    });
    return response.data;
  }

  async getCurrentUser(): Promise<UserProfile> {
    const response = await this.instance.get<UserProfile>('/auth/me');
    return response.data;
  }
}

export const apiService = new AuthApiService();
