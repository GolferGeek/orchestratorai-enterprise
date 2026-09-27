import { Global, Module } from '@nestjs/common';
import { IssueLedgerController } from './issue-ledger.controller';
import { IssueLedgerRepository } from './issue-ledger.repository';
import { IssueLedgerService } from './issue-ledger.service';

/** Global: workflow steps raise and move issues; the API reads them. */
@Global()
@Module({
  controllers: [IssueLedgerController],
  providers: [IssueLedgerRepository, IssueLedgerService],
  exports: [IssueLedgerService],
})
export class IssueLedgerModule {}
