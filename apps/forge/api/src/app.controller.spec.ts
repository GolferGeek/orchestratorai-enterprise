import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const mockAppService = {
      getHello: jest
        .fn()
        .mockReturnValue('NestJS A2A Agent Framework - Ready!'),
      getAgentStatus: jest.fn().mockResolvedValue({
        status: 'running',
        discoveredAgents: 0,
        runningInstances: 0,
        agents: [],
      }),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: mockAppService,
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return hello message', () => {
      expect(appController.getHello()).toBe(
        'NestJS A2A Agent Framework - Ready!',
      );
    });
  });

  describe('agents', () => {
    it('should return agent status', async () => {
      const result = (await appController.getAgentStatus()) as Record<
        string,
        unknown
      >;
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('agents');
    });
  });
});
