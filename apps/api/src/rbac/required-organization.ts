import { BadRequestException } from '@nestjs/common';

/** The organization a role change is for: required, never a default. */
export function requiredOrganization(
  organizationSlug: string | undefined,
): string {
  if (!organizationSlug) {
    throw new BadRequestException('organizationSlug is required');
  }
  return organizationSlug;
}
