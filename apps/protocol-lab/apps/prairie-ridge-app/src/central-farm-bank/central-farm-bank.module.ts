import { Module } from '@nestjs/common';
import { CentralFarmBankController } from './central-farm-bank.controller';
import { CentralFarmBankService } from './central-farm-bank.service';

@Module({
  controllers: [CentralFarmBankController],
  providers: [CentralFarmBankService],
  exports: [CentralFarmBankService],
})
export class CentralFarmBankModule {}
