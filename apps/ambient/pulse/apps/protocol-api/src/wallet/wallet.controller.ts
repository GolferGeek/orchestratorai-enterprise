import { Controller, Get, Param } from '@nestjs/common';
import { WalletService } from './wallet.service';

@Controller('api/wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  getWallet() {
    return this.walletService.getWallet();
  }

  @Get('transactions')
  getTransactions() {
    return this.walletService.getTransactions();
  }

  @Get('transactions/:id')
  getTransaction(@Param('id') id: string) {
    return this.walletService.getTransaction(id);
  }
}
