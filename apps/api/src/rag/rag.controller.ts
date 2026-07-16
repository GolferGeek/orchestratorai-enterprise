import { Controller } from '@nestjs/common';
import { CommonCapabilityController } from '../common-capability.controller';

@Controller('rag')
export class RagController extends CommonCapabilityController {
  constructor() {
    super('rag');
  }
}

