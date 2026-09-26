import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import { MemorySaver } from '@langchain/langgraph-checkpoint';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import type { ConfigProvider } from '../config/config-provider.interface';
import {
  CHECKPOINTER_PROVIDERS,
  type CheckpointerProvider,
} from './checkpointer.interface';

function isCheckpointerProvider(value: string): value is CheckpointerProvider {
  return (CHECKPOINTER_PROVIDERS as readonly string[]).includes(value);
}

/**
 * Build the process's saver from config. Postgres runs its idempotent
 * `setup()` (checkpoint tables and migrations) exactly once, here.
 */
export async function createCheckpointSaver(
  config: ConfigProvider,
): Promise<BaseCheckpointSaver> {
  const provider = config.getRequired('CHECKPOINTER_PROVIDER');
  if (!isCheckpointerProvider(provider)) {
    throw new Error(
      `Unsupported CHECKPOINTER_PROVIDER '${provider}'. Allowed values: ${CHECKPOINTER_PROVIDERS.join(', ')}`,
    );
  }
  switch (provider) {
    case 'postgres': {
      const saver = PostgresSaver.fromConnString(await config.getSecret('DATABASE_URL'));
      await saver.setup();
      return saver;
    }
    case 'memory':
      return new MemorySaver();
  }
}
