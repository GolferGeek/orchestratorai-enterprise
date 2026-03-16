/**
 * Agent Workflow Modules — LangGraph workflows merged into the API.
 *
 * Each agent is a NestJS module containing a LangGraph graph,
 * controller, service, and state definition.
 *
 * Shared infrastructure (services, persistence, tools, hitl, state)
 * lives in shared/ and is imported by agent modules.
 */
export { MarketingSwarmModule } from './marketing-swarm/marketing-swarm.module';
export { LegalDepartmentModule } from './legal-department/legal-department.module';
export { CadAgentModule } from './cad-agent/cad-agent.module';
export { BusinessAutomationAdvisorModule } from './business-automation-advisor/business-automation-advisor.module';
export { ExtendedPostWriterModule } from './extended-post-writer/extended-post-writer.module';
export { DataAnalystModule } from './data-analyst/data-analyst.module';
export { HrAssistantModule } from './hr-assistant/hr-assistant.module';
export { RiskRunnerModule } from './risk-runner/risk-runner.module';
export { PredictorModule } from './predictor/predictor.module';
