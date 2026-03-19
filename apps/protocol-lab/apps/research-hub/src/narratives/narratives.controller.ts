import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { NarrativesService } from './narratives.service';

@Controller('api/narratives')
export class NarrativesController {
  constructor(private readonly narrativesService: NarrativesService) {}

  @Get(':personality')
  getNarrative(@Param('personality') personality: string) {
    const narrative = this.narrativesService.getByPersonality(personality);
    if (!narrative) {
      throw new NotFoundException(
        `Personality "${personality}" not found. Available: ${this.narrativesService.getAllPersonalities().join(', ')}`,
      );
    }
    return narrative;
  }
}
