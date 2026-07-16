import { Controller } from '@nestjs/common';
import { CommonCapabilityController } from '../common-capability.controller';

@Controller('agents')
export class AgentsController extends CommonCapabilityController {
  constructor() {
    super('agents');
  }
}

