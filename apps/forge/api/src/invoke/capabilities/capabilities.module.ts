/**
 * Capabilities Registration Module
 *
 * Declares the capability adapter providers so they register themselves
 * with CapabilityRegistryService on startup. Each adapter's onModuleInit()
 * calls registry.register() to make it available for invoke routing.
 *
 * The underlying agent service modules (PredictorModule, RiskRunnerModule,
 * etc.) are imported at the AppModule level — NestJS resolves them as
 * shared singleton instances, so the adapters here receive the same
 * service instances.
 *
 * Add new capability adapters to the providers array here.
 */

import { Module } from '@nestjs/common';
import { ForgeInvokeModule } from '../invoke.module';
import { PredictorModule } from '@/agents/predictor/predictor.module';
import { RiskRunnerModule } from '@/agents/risk-runner/risk-runner.module';
import { MarketingSwarmModule } from '@/agents/marketing-swarm/marketing-swarm.module';
import { LegalDepartmentModule } from '@/agents/legal-department/legal-department.module';
import { CadAgentModule } from '@/agents/cad-agent/cad-agent.module';

import { PredictorCapability } from './predictor.capability';
import { RiskRunnerCapability } from './risk-runner.capability';
import { MarketingSwarmCapability } from './marketing-swarm.capability';
import { LegalDepartmentCapability } from './legal-department.capability';
import { CadAgentCapability } from './cad-agent.capability';

@Module({
  imports: [
    // ForgeInvokeModule provides CapabilityRegistryService
    ForgeInvokeModule,
    // Agent modules provide the services that adapters inject
    PredictorModule,
    RiskRunnerModule,
    MarketingSwarmModule,
    LegalDepartmentModule,
    CadAgentModule,
  ],
  providers: [
    PredictorCapability,
    RiskRunnerCapability,
    MarketingSwarmCapability,
    LegalDepartmentCapability,
    CadAgentCapability,
  ],
})
export class CapabilitiesModule {}
