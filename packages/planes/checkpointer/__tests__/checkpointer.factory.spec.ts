import { MemorySaver } from '@langchain/langgraph-checkpoint';
import type { ConfigProvider } from '../../config/config-provider.interface';

const setup = jest.fn<Promise<void>, []>();
const fromConnString = jest.fn((_url: string) => ({ setup }));
jest.mock('@langchain/langgraph-checkpoint-postgres', () => ({
  PostgresSaver: { fromConnString: (url: string) => fromConnString(url) },
}));

import { createCheckpointSaver } from '../checkpointer.factory';

function config(values: Record<string, string>): ConfigProvider {
  return {
    getRequired: (key: string) => {
      const value = values[key];
      if (value === undefined) throw new Error(`Missing required configuration key: ${key}`);
      return value;
    },
    getSecret: async (key: string) => {
      const value = values[key];
      if (value === undefined) throw new Error(`Missing required secret: ${key}`);
      return value;
    },
  } as unknown as ConfigProvider;
}

describe('createCheckpointSaver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setup.mockResolvedValue(undefined);
  });

  it('builds a Postgres saver from the DATABASE_URL secret and sets it up once', async () => {
    const saver = await createCheckpointSaver(
      config({ CHECKPOINTER_PROVIDER: 'postgres', DATABASE_URL: 'postgresql://db/x' }),
    );
    expect(fromConnString).toHaveBeenCalledWith('postgresql://db/x');
    expect(setup).toHaveBeenCalledTimes(1);
    expect(saver).toEqual({ setup });
  });

  it('fails when Postgres setup fails, instead of handing out a broken saver', async () => {
    setup.mockRejectedValue(new Error('permission denied for schema public'));
    await expect(
      createCheckpointSaver(
        config({ CHECKPOINTER_PROVIDER: 'postgres', DATABASE_URL: 'postgresql://db/x' }),
      ),
    ).rejects.toThrow('permission denied');
  });

  it('builds an in-memory saver without touching Postgres', async () => {
    const saver = await createCheckpointSaver(config({ CHECKPOINTER_PROVIDER: 'memory' }));
    expect(saver).toBeInstanceOf(MemorySaver);
    expect(fromConnString).not.toHaveBeenCalled();
  });

  it('refuses an unknown or missing provider', async () => {
    await expect(createCheckpointSaver(config({ CHECKPOINTER_PROVIDER: 'redis' }))).rejects.toThrow(
      "Unsupported CHECKPOINTER_PROVIDER 'redis'",
    );
    await expect(createCheckpointSaver(config({}))).rejects.toThrow('CHECKPOINTER_PROVIDER');
  });
});
