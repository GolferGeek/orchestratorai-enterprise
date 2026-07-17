import type { AuthProvider } from "./authProvider.interface";
import type { AuthResponse } from "@/services/authService";

function getGoogleConfig(): { clientId: string; redirectUri: string } {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const redirectUri = import.meta.env.VITE_GOOGLE_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    throw new Error(
      "Google OIDC requires VITE_GOOGLE_CLIENT_ID and VITE_GOOGLE_REDIRECT_URI.",
    );
  }

  return { clientId, redirectUri };
}

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const LOGIN_SCOPES = ["openid", "profile", "email"];

function getTokenExchangeUrl(): string {
  const apiBase = import.meta.env.VITE_API_BASE_URL || "";
  return `${apiBase}/auth/google/token-exchange`;
}

const AUTH_CODE_KEY = "google_oidc_auth_code";
const ID_TOKEN_KEY = "google_oidc_id_token";
const TOKEN_EXPIRY_KEY = "google_oidc_token_expiry";

export class GoogleOidcAuthProvider implements AuthProvider {
  readonly isOidcProvider = true;

  async login(_credentials: {
    email: string;
    password: string;
  }): Promise<AuthResponse> {
    throw new Error(
      "Google OIDC uses redirect login. Call initiateLogin() instead.",
    );
  }

  async signup(_data: {
    email: string;
    password: string;
    displayName?: string;
  }): Promise<AuthResponse> {
    throw new Error(
      "Google OIDC does not support signup. Users are provisioned in Google Workspace.",
    );
  }

  async initiateLogin(): Promise<void> {
    const { clientId, redirectUri } = getGoogleConfig();

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: LOGIN_SCOPES.join(" "),
      access_type: "offline",
      prompt: "select_account",
    });

    window.location.href = `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
  }

  async handleCallback(): Promise<AuthResponse | null> {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");

    if (!code) {
      return null;
    }

    const { redirectUri } = getGoogleConfig();

    // Exchange the auth code via our API (server-side has the client_secret)
    const response = await fetch(getTokenExchangeUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, redirectUri }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Google OIDC token exchange failed: ${response.status} ${errorBody}`,
      );
    }

    const tokenData = (await response.json()) as {
      id_token: string;
      expires_in: number;
    };

    if (!tokenData.id_token) {
      throw new Error("Google OIDC token exchange did not return an id_token");
    }

    const expiresAt = Date.now() + tokenData.expires_in * 1000;
    localStorage.setItem(ID_TOKEN_KEY, tokenData.id_token);
    localStorage.setItem(TOKEN_EXPIRY_KEY, String(expiresAt));

    // Clear the auth code from URL
    window.history.replaceState({}, document.title, window.location.pathname);

    return {
      accessToken: tokenData.id_token,
      tokenType: "Bearer",
      expiresIn: tokenData.expires_in,
    };
  }

  async logout(): Promise<void> {
    localStorage.removeItem(ID_TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
    localStorage.removeItem(AUTH_CODE_KEY);

    const { redirectUri } = getGoogleConfig();
    const params = new URLSearchParams({ continue: redirectUri });
    window.location.href = `https://accounts.google.com/Logout?${params.toString()}`;
  }

  async refreshToken(): Promise<AuthResponse> {
    // Google's id_token cannot be refreshed client-side without a refresh_token
    // and a server-side token endpoint. Re-initiate login if token expired.
    const token = await this.getToken();
    if (!token) {
      throw new Error("No Google OIDC token found. User must log in again.");
    }

    const expiryStr = localStorage.getItem(TOKEN_EXPIRY_KEY);
    if (!expiryStr || Date.now() >= Number(expiryStr)) {
      throw new Error("Google OIDC token has expired. User must log in again.");
    }

    const expiresIn = Math.floor((Number(expiryStr) - Date.now()) / 1000);

    return {
      accessToken: token,
      tokenType: "Bearer",
      expiresIn,
    };
  }

  async getToken(): Promise<string | null> {
    const token = localStorage.getItem(ID_TOKEN_KEY);
    if (!token) {
      return null;
    }

    const expiryStr = localStorage.getItem(TOKEN_EXPIRY_KEY);
    if (expiryStr && Date.now() >= Number(expiryStr)) {
      localStorage.removeItem(ID_TOKEN_KEY);
      localStorage.removeItem(TOKEN_EXPIRY_KEY);
      return null;
    }

    return token;
  }
}
