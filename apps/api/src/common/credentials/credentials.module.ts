import { Global, Module } from '@nestjs/common';
import { OrganizationCredentialsController } from './organization-credentials.controller';
import { OrganizationCredentialsService } from './organization-credentials.service';

/** Global: any module calling an outside system for an organization reads its credentials here. */
@Global()
@Module({
  controllers: [OrganizationCredentialsController],
  providers: [OrganizationCredentialsService],
  exports: [OrganizationCredentialsService],
})
export class CredentialsModule {}
