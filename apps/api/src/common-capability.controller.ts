import { Get } from '@nestjs/common';

export interface CapabilityStatus {
  module: string;
  status: 'placeholder';
}

export abstract class CommonCapabilityController {
  protected constructor(private readonly moduleName: string) {}

  @Get()
  getStatus(): CapabilityStatus {
    return {
      module: this.moduleName,
      status: 'placeholder',
    };
  }
}

