/**
 * Teams API Service
 *
 * API client for team management operations.
 * Connects to /users/me/context, /orgs/:slug/teams, and /teams endpoints.
 * Uses API authentication (token from localStorage) instead of direct Supabase calls.
 */
import { getMainApiUrl } from '@/config/api-config';

// Types matching the API responses
export interface ApiTeam {
  id: string;
  orgSlug: string;
  name: string;
  description?: string;
  memberCount: number;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiTeamMember {
  id: string;
  userId: string;
  email: string;
  displayName?: string;
  role: 'member' | 'lead' | 'admin';
  joinedAt: string;
}

export interface UserTeam {
  id: string;
  name: string;
  description?: string;
  orgSlug: string;
  role: string;
  joinedAt: string;
}

export interface UserOrganization {
  slug: string;
  name: string;
  role: string;
  isGlobal: boolean;
}

export interface UserContext {
  user: {
    id: string;
    email: string;
    displayName?: string;
  };
  organizations: UserOrganization[];
  teams: UserTeam[];
}

class TeamsApiService {
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = getMainApiUrl();
  }

  /**
   * Get the current auth token from localStorage (auth store)
   */
  private getAuthToken(): string | null {
    try {
      const authStorage = localStorage.getItem('auth-storage');
      if (!authStorage) {
        return null;
      }
      const { state } = JSON.parse(authStorage);
      return state?.token || null;
    } catch (error) {
      console.error('Error reading auth token from storage:', error);
      return null;
    }
  }

  /**
   * Make an authenticated API request
   */
  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = this.getAuthToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      let errorMessage = `API error: ${response.status}`;
      let errorDetails: Record<string, unknown> = {};

      try {
        const error = await response.json();
        errorMessage = error.message || error.error || errorMessage;
        errorDetails = error;
      } catch {
        // If response is not JSON, try to get text
        try {
          const text = await response.text();
          if (text) {
            errorMessage = text;
          }
        } catch {
          // Ignore text parsing errors
        }
      }

      const error = new Error(errorMessage) as Error & { status?: number; details?: Record<string, unknown> };
      // Attach status and details for better error handling
      error.status = response.status;
      error.details = errorDetails;
      throw error;
    }

    return response.json();
  }

  /**
   * Get user context including orgs and teams
   */
  async getUserContext(): Promise<UserContext> {
    return this.request<UserContext>('/users/me/context');
  }

  /**
   * Get all teams in an organization
   */
  async getTeamsByOrg(orgSlug: string): Promise<ApiTeam[]> {
    return this.request<ApiTeam[]>(`/orgs/${orgSlug}/teams`);
  }

  /**
   * Create a new team in an organization
   */
  async createTeam(
    orgSlug: string,
    name: string,
    description?: string
  ): Promise<ApiTeam> {
    return this.request<ApiTeam>(`/orgs/${orgSlug}/teams`, {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    });
  }

  /**
   * Get a single team by ID
   */
  async getTeam(teamId: string): Promise<ApiTeam> {
    return this.request<ApiTeam>(`/teams/${teamId}`);
  }

  /**
   * Update a team
   */
  async updateTeam(
    teamId: string,
    updates: { name?: string; description?: string }
  ): Promise<ApiTeam> {
    return this.request<ApiTeam>(`/teams/${teamId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  /**
   * Delete a team
   */
  async deleteTeam(teamId: string): Promise<void> {
    await this.request<{ message: string }>(`/teams/${teamId}`, {
      method: 'DELETE',
    });
  }

  /**
   * Get team members
   */
  async getTeamMembers(teamId: string): Promise<ApiTeamMember[]> {
    return this.request<ApiTeamMember[]>(`/teams/${teamId}/members`);
  }

  /**
   * Add a member to a team
   */
  async addTeamMember(
    teamId: string,
    userId: string,
    role: 'member' | 'lead' | 'admin' = 'member'
  ): Promise<ApiTeamMember> {
    return this.request<ApiTeamMember>(`/teams/${teamId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId, role }),
    });
  }

  /**
   * Update a team member's role
   */
  async updateTeamMember(
    teamId: string,
    userId: string,
    role: 'member' | 'lead' | 'admin'
  ): Promise<ApiTeamMember> {
    return this.request<ApiTeamMember>(`/teams/${teamId}/members/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    });
  }

  /**
   * Remove a member from a team
   */
  async removeTeamMember(teamId: string, userId: string): Promise<void> {
    await this.request<{ message: string }>(
      `/teams/${teamId}/members/${userId}`,
      {
        method: 'DELETE',
      }
    );
  }
}

export const teamsApiService = new TeamsApiService();
