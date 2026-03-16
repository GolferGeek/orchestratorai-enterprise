import { Module } from '@nestjs/common';
import { ExternalRegistryService } from './external-registry.service';
import { RegistryController } from './registry.controller';
import { SecurityModule } from '../security/security.module';

@Module({
  imports: [SecurityModule],
  controllers: [RegistryController],
  providers: [ExternalRegistryService],
  exports: [ExternalRegistryService],
})
export class RegistryModule {}
