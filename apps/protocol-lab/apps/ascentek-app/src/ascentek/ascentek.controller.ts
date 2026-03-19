import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { AscentekService } from './ascentek.service';

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

@Controller('ascentek')
export class AscentekController {
  constructor(private readonly ascentekService: AscentekService) {}

  @Post('formulations/lookup')
  lookupFormulation(@Body() body: FormulationLookupBody) {
    return this.ascentekService.lookupFormulation(body);
  }

  @Post('specs/validate')
  validateSpec(@Body() body: SpecValidateBody) {
    return this.ascentekService.validateSpec(body);
  }

  @Post('onboarding/start')
  startOnboarding(@Body() body: OnboardingStartBody) {
    return this.ascentekService.startOnboarding(body);
  }

  @Get('formulations')
  getFormulationCatalog() {
    return this.ascentekService.getFormulationCatalog();
  }

  @Get('specs')
  getOemSpecifications() {
    return this.ascentekService.getOemSpecifications();
  }

  @Get('pricing')
  getPricingTiers(@Query('productId') productId?: string) {
    return this.ascentekService.getPricingTiers(productId);
  }

  @Get('partners')
  getPartnerRegistry() {
    return this.ascentekService.getPartnerRegistry();
  }
}
