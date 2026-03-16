/**
 * useTeams Hook
 *
 * This hook now uses the centralized Teams API instead of direct Supabase queries.
 * The API endpoints are in the NestJS API at /users/me/context, /orgs/:slug/teams, etc.
 *
 * For backward compatibility, we re-export the same interface from useTeamsApi.
 */

// Re-export everything from the API-based hook
export {
  useTeamsApi as useTeams,
  type Team,
  type TeamMember,
} from './useTeamsApi';
