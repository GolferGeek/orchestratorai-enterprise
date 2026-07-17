/**
 * Request DTO for POST /auth/authorize.
 *
 * Shape validation is performed manually in the controller (no global ValidationPipe
 * is registered in the platform API main bootstrap; manual validation avoids introducing one just
 * for this single endpoint).
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
