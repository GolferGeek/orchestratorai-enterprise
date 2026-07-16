import { Controller } from '@nestjs/common';
import { CommonCapabilityController } from '../common-capability.controller';

@Controller('workflows')
export class WorkflowsController extends CommonCapabilityController {
  constructor() {
    super('workflows');
  }
}

