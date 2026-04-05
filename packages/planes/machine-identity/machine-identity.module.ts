import { Global, Logger, Module } from '@nestjs/common';
import { MACHINE_IDENTITY_PROVIDER } from './machine-identity.interface';
import { TailscaleMachineIdentityProvider } from './tailscale-machine-identity.provider';

const logger = new Logger('MachineIdentityModule');

@Global()
@Module({
  providers: [
    TailscaleMachineIdentityProvider,
    {
      provide: MACHINE_IDENTITY_PROVIDER,
      useFactory: (
        tailscaleProvider: TailscaleMachineIdentityProvider,
      ) => {
        const provider = process.env.MACHINE_IDENTITY_PROVIDER || 'tailscale';
        logger.log(`Machine identity plane provider: ${provider}`);
        switch (provider) {
          case 'tailscale':
            return tailscaleProvider;
          default:
            throw new Error(
              `Unsupported MACHINE_IDENTITY_PROVIDER '${provider}'. Expected: tailscale`,
            );
        }
      },
      inject: [TailscaleMachineIdentityProvider],
    },
  ],
  exports: [MACHINE_IDENTITY_PROVIDER],
})
export class MachineIdentityModule {}
