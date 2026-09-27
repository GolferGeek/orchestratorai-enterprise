import { Global, Module } from '@nestjs/common';
import { CONFIG_PROVIDER_SERVICE, type ConfigProvider } from '@orchestratorai/planes/config';
import { JevMcpClient } from './jev-mcp.client';

/**
 * Jev, the suite's typed-decision service. Required: workflows gate on its
 * verdicts, so a missing JEV_MCP_URL / JEV_MCP_TOKEN stops the API at boot
 * rather than letting a step skip its check.
 */
@Global()
@Module({
  providers: [
    {
      provide: JevMcpClient,
      inject: [CONFIG_PROVIDER_SERVICE],
      useFactory: async (config: ConfigProvider) =>
        new JevMcpClient({ url: config.getRequired('JEV_MCP_URL'), token: await config.getSecret('JEV_MCP_TOKEN') }),
    },
  ],
  exports: [JevMcpClient],
})
export class JevModule {}
