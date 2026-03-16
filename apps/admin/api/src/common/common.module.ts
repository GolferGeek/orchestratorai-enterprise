import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ProductClientService } from './product-client.service';

@Module({
  imports: [HttpModule],
  providers: [ProductClientService],
  exports: [ProductClientService],
})
export class CommonModule {}
