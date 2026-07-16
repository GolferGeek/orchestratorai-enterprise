import { Controller } from '@nestjs/common';
import { CommonCapabilityController } from '../common-capability.controller';

@Controller('integrations')
export class IntegrationsController extends CommonCapabilityController {
  constructor() {
    super('integrations');
  }
}

