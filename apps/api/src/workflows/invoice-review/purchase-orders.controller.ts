import { BadRequestException, Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { FinanceStoreService } from './finance-store.service';

/** GET /workflows/invoice-review/purchase-orders: the RBAC org's POs, for the new-run form. */
@Controller('workflows/invoice-review/purchase-orders')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('agents:execute')
export class PurchaseOrdersController {
  constructor(private readonly store: FinanceStoreService) {}

  @Get()
  async list(@Req() request: { organizationSlug?: string }) {
    const org = request.organizationSlug;
    if (!org || org === '*') throw new BadRequestException('Select an organization');
    return this.store.purchaseOrders(org);
  }
}
