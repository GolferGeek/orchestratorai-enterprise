import { Module } from '@nestjs/common';
import { AuthOrganizationsController } from './auth-organizations.controller';
import { OrganizationsModule } from '../../admin/organizations/organizations.module';

/**
 * Exposes organization CRUD at /auth/organizations — mirrors the same
 * operations as /admin/organizations so other products can use the Auth
 * base URL for all auth-related calls.
 */
@Module({
  imports: [OrganizationsModule],
  controllers: [AuthOrganizationsController],
})
export class AuthOrganizationsModule {}
