import { Global, Module } from '@nestjs/common';
import {
  CONFIG_PROVIDER_SERVICE,
  type ConfigProvider,
} from '../config/config-provider.interface';
import { CHECKPOINT_SAVER } from './checkpointer.interface';
import { createCheckpointSaver } from './checkpointer.factory';

/** Registers {@link CHECKPOINT_SAVER}, set up once at boot. */
@Global()
@Module({
  providers: [
    {
      provide: CHECKPOINT_SAVER,
      useFactory: (config: ConfigProvider) => createCheckpointSaver(config),
      inject: [CONFIG_PROVIDER_SERVICE],
    },
  ],
  exports: [CHECKPOINT_SAVER],
})
export class CheckpointerModule {}
