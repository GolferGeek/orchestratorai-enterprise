import { Controller, Get, Put, Post, Body, Param } from '@nestjs/common';
import { ProtocolService } from './protocol.service';
import { ProtocolConfig, ProtocolLayer } from '@agent-communication/shared-types';

@Controller('api/protocol')
export class ProtocolController {
  constructor(private readonly protocolService: ProtocolService) {}

  @Get('config')
  getConfig() {
    return this.protocolService.getConfig();
  }

  @Put('config')
  updateConfig(@Body() body: Partial<ProtocolConfig>) {
    return this.protocolService.updateConfig(body);
  }

  @Get('presets')
  getPresets() {
    return this.protocolService.getPresets();
  }

  @Get('providers')
  getProviders() {
    return this.protocolService.getProviders();
  }

  @Get('providers/errors')
  getRegistrationErrors() {
    return this.protocolService.getRegistrationErrors();
  }

  @Post('test/:layer')
  async testLayer(@Param('layer') layer: ProtocolLayer) {
    return this.protocolService.testLayer(layer);
  }
}
