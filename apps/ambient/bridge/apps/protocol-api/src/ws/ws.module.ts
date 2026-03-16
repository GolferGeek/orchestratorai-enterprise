import { Module, Global } from '@nestjs/common';
import { WsGateway } from './ws.gateway';
import { WsService } from './ws.service';

@Global()
@Module({
  providers: [WsGateway, WsService],
  exports: [WsService],
})
export class WsModule {}
