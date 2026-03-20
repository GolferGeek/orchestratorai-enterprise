import { Controller, Get, Param } from '@nestjs/common';
import { TrustService } from './trust.service';

@Controller('api/trust')
export class TrustController {
  constructor(private readonly trustService: TrustService) {}

  @Get()
  getAllTrustScores() {
    return this.trustService.getAllTrustScores();
  }

  @Get(':agentId')
  getTrustScore(@Param('agentId') agentId: string) {
    return this.trustService.getTrustScore(agentId);
  }
}
