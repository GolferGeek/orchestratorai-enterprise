import { Controller } from '@nestjs/common';
import { CommonCapabilityController } from '../common-capability.controller';

@Controller('admin')
export class AdminController extends CommonCapabilityController {
  constructor() {
    super('admin');
  }
}

