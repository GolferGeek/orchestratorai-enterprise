import { BadRequestException, Controller, Post, Body, HttpCode, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { validateA2AInvokeRequest } from '../../common/validation/a2a-invoke-validation';
import type { InvokeParams } from '@orchestrator-ai/transport-types';
import { A2ASenderService, OutboundRequest } from './a2a-sender.service';

@Controller('secure-conversations/a2a')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('agents:execute')
export class A2ASenderController {
  constructor(private readonly sender: A2ASenderService) {}

  @Post('send')
  @HttpCode(200)
  async sendToExternalAgent(
    @Body() body: OutboundRequest,
    @CurrentUser() user: { id: string },
    @Req() request: Request,
  ) {
    const organizationSlug = this.getOrganizationSlug(request);
    const params = this.validateMethodAndParams(
      body?.method,
      body?.params,
      user.id,
      organizationSlug,
    );
    if (
      typeof body.targetAgentId !== 'string' ||
      !body.targetAgentId.trim() ||
      body.targetAgentId.length > 128
    ) {
      throw new BadRequestException('targetAgentId is required');
    }
    return this.sender.sendToExternalAgent(
      { ...body, method: 'invoke', params },
      organizationSlug,
    );
  }

  @Post('broadcast')
  @HttpCode(200)
  async broadcastToAllAgents(
    @Body() body: { method: string; params: Record<string, unknown> },
    @CurrentUser() user: { id: string },
    @Req() request: Request,
  ) {
    const organizationSlug = this.getOrganizationSlug(request);
    const params = this.validateMethodAndParams(
      body?.method,
      body?.params,
      user.id,
      organizationSlug,
    );
    return this.sender.broadcastToAllAgents(
      'invoke',
      params,
      organizationSlug,
    );
  }

  private getOrganizationSlug(request: Request): string {
    const orgSlug = (request as Request & { organizationSlug?: string })
      .organizationSlug;
    if (!orgSlug || orgSlug === '*') {
      throw new BadRequestException(
        'A specific authorized organization is required',
      );
    }
    return orgSlug;
  }

  private validateMethodAndParams(
    method: unknown,
    params: unknown,
    userId: string,
    organizationSlug: string,
  ): InvokeParams {
    const validation = validateA2AInvokeRequest(
      { jsonrpc: '2.0', id: 'outbound-validation', method, params },
      userId,
      organizationSlug,
    );
    if (!validation.valid) {
      throw new BadRequestException(validation.message);
    }
    return validation.request.params;
  }
}
