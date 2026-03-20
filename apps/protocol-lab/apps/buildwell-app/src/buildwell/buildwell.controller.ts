import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { BuildwellService } from './buildwell.service';

interface FormulationLookupBody {
  category?: string;
  viscosityGrade?: string;
  specCode?: string;
}

interface SpecValidateBody {
  specCode: string;
  productId: string;
}

interface OnboardingStartBody {
  companyName: string;
  partnerCode: string;
}

@Controller('buildwell')
export class BuildwellController {
  constructor(private readonly buildwellService: BuildwellService) {}

  @Post('formulations/lookup')
  lookupFormulation(@Body() body: FormulationLookupBody) {
    return this.buildwellService.lookupFormulation(body);
  }

  @Post('specs/validate')
  validateSpec(@Body() body: SpecValidateBody) {
    return this.buildwellService.validateSpec(body);
  }

  @Post('onboarding/start')
  startOnboarding(@Body() body: OnboardingStartBody) {
    return this.buildwellService.startOnboarding(body);
  }

  @Get('formulations')
  getFormulationCatalog() {
    return this.buildwellService.getFormulationCatalog();
  }

  @Get('specs')
  getOemSpecifications() {
    return this.buildwellService.getOemSpecifications();
  }

  @Get('pricing')
  getPricingTiers(@Query('productId') productId?: string) {
    return this.buildwellService.getPricingTiers(productId);
  }

  @Get('partners')
  getPartnerRegistry() {
    return this.buildwellService.getPartnerRegistry();
  }
}
