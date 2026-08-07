/**
 * Request DTO for POST /auth/authorize.
 *
 * Shape validation remains manual because this boundary intentionally uses a
 * transport-facing interface rather than a decorated controller DTO.
 */
export interface AuthorizeRequestBody {
  permission: string;
  organizationSlug?: string;
  resourceType?: string;
  resourceId?: string;
}

export interface AuthorizeResponse {
  allowed: true;
  userId: string;
  email: string | null;
  orgSlug: string;
  orgId: string | null;
  roles: string[];
  permission: string;
}
