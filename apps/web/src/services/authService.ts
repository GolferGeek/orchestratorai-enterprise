import { apiService } from "./apiService";
import { tokenStorage } from "./tokenStorageService";
// Define BackendErrorDetail interface here since it's no longer exported from apiService
interface BackendErrorDetail {
  message: string;
  detail?: string;
  field?: string;
}
import { AxiosError } from "axios";
interface UserCredentials {
  email: string;
  password: string;
}
interface SignupData extends UserCredentials {
  displayName?: string;
  // Add any other signup-specific fields here
}
export interface AuthResponse {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresIn?: number;
  // You might also want to include basic user info here if your API returns it
  // user?: { id: string; email: string; displayName?: string };
}

export const authService = {
  async login(credentials: UserCredentials): Promise<AuthResponse> {
    try {
      const responseData = (await apiService.login(
        credentials,
      )) as AuthResponse;
      if (responseData.accessToken) {
        // Store tokens in secure storage
        await tokenStorage.setAccessToken(responseData.accessToken);
        if (responseData.refreshToken) {
          await tokenStorage.setRefreshToken(responseData.refreshToken);
        }
        // Set auth token on API service
        await apiService.setAuthToken(responseData.accessToken);
      } else {
        throw new Error(
          "Login completed but no token was provided by the server.",
        );
      }
      return responseData;
    } catch (error) {
      const axiosError = error as AxiosError<BackendErrorDetail>;
      let errorMessage = "Login failed";
      if (
        axiosError.response &&
        axiosError.response.data &&
        axiosError.response.data.detail
      ) {
        errorMessage = axiosError.response.data.detail;
      } else if (axiosError.message) {
        errorMessage = axiosError.message;
      }
      throw new Error(errorMessage);
    }
  },
  async signup(data: SignupData): Promise<AuthResponse> {
    try {
      const responseData = (await apiService.signup(data)) as AuthResponse;
      if (responseData.accessToken) {
        // Store tokens in secure storage
        await tokenStorage.setAccessToken(responseData.accessToken);
        if (responseData.refreshToken) {
          await tokenStorage.setRefreshToken(responseData.refreshToken);
        }
        // Set auth token on API service
        await apiService.setAuthToken(responseData.accessToken);
      } else {
        throw new Error(
          "Signup completed but no token was provided by the server.",
        );
      }
      return responseData;
    } catch (error) {
      const axiosError = error as AxiosError<BackendErrorDetail>;
      let errorMessage = "Signup failed";
      if (
        axiosError.response &&
        axiosError.response.status === 202 &&
        axiosError.response.data &&
        axiosError.response.data.detail
      ) {
        errorMessage = axiosError.response.data.detail;
        // Still throw so the store can catch it and inform the user specifically
        throw new Error(errorMessage);
      } else if (
        axiosError.response &&
        axiosError.response.data &&
        axiosError.response.data.detail
      ) {
        errorMessage = axiosError.response.data.detail;
      } else if (axiosError.message) {
        errorMessage = axiosError.message;
      }
      throw new Error(errorMessage);
    }
  },
  async logout(): Promise<void> {
    // Clear tokens from secure storage
    await tokenStorage.clearTokens();
    // Clear auth from API service
    apiService.clearAuth();
    // Optional: Call backend /auth/logout endpoint. If so, make this async.
    // apiService.post('/auth/logout').catch(err => /* Backend logout call failed */);
  },
  async getToken(): Promise<string | null> {
    return await tokenStorage.getAccessToken();
  },
  async getRefreshToken(): Promise<string | null> {
    return await tokenStorage.getRefreshToken();
  },
  async refreshToken(): Promise<AuthResponse> {
    try {
      const refreshToken = await this.getRefreshToken();
      if (!refreshToken) {
        throw new Error("No refresh token available");
      }
      const responseData = (await apiService.refreshToken(
        refreshToken,
      )) as AuthResponse;
      if (responseData.accessToken) {
        // Store tokens in secure storage
        await tokenStorage.setAccessToken(responseData.accessToken);
        if (responseData.refreshToken) {
          await tokenStorage.setRefreshToken(responseData.refreshToken);
        }
        // Set auth token on API service
        await apiService.setAuthToken(responseData.accessToken);
        return responseData;
      } else {
        throw new Error(
          "Token refresh completed but no new token was provided by the server.",
        );
      }
    } catch (error) {
      // If refresh fails, clear auth data and force re-login
      await this.logout();
      // Dispatch session-expired so App.vue clears rbacStore and redirects to /login
      // Without this, rbacStore.token still holds the old value (inconsistent state)
      window.dispatchEvent(new CustomEvent("auth:session-expired"));
      throw error;
    }
  },
  async initializeAuthHeader(): Promise<void> {
    const token = await this.getToken();
    if (token) {
      // Set on API service
      await apiService.setAuthToken(token);
    }
  },
};

// Initialize auth header after the object is fully defined
setTimeout(() => {
  authService.initializeAuthHeader().catch((err) => {
    console.error("[AuthService] Failed to initialize auth header:", err);
  });
}, 0);
