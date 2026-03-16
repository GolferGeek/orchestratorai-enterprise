import { Module } from '@nestjs/common';
import { OemPartnerController } from './oem-partner.controller';
import { OemPartnerService } from './oem-partner.service';

@Module({
  controllers: [OemPartnerController],
  providers: [OemPartnerService],
  exports: [OemPartnerService],
})
export class OemPartnerModule {}
