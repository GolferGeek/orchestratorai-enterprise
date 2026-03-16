import { Controller, Get, Headers } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('agents')
  async getAgentStatus(
    @Headers('x-organization-slug') organizationSlug?: string,
  ): Promise<unknown> {
    // If organization slug is provided, filter by it
    const organizations = organizationSlug ? [organizationSlug] : undefined;
    return await this.appService.getAgentStatus(organizations);
  }
}
