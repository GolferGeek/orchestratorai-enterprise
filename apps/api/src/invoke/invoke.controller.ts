import { Controller } from '@nestjs/common';
import { CommonCapabilityController } from '../common-capability.controller';

@Controller('invoke')
export class InvokeController extends CommonCapabilityController {
  constructor() {
    super('invoke');
  }
}

