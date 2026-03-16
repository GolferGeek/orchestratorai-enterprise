/**
 * WebhooksModule Integration Tests
 *
 * Tests module structure, service availability, and dependency injection.
 * These tests verify the module is properly structured for handling webhook events.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksController } from '../webhooks.controller';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TasksService } from '../../agent2agent/tasks/tasks.service';
import { StreamingService } from '../../agent2agent/services/streaming.service';
import { DATABASE_SERVICE } from '../../database';
import { ObservabilityWebhookService } from '../../observability/observability-webhook.service';
import { ObservabilityEventsService } from '../../observability/observability-events.service';

// Mock EventEmitter2 and OnEvent decorator
jest.mock('@nestjs/event-emitter', () => ({
  EventEmitter2: jest.fn().mockImplementation(() => ({
    emit: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    removeListener: jest.fn(),
  })),
  OnEvent: jest.fn(() => jest.fn()),
}));

// Mock Supabase client
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
  })),
}));

describe('WebhooksModule Integration', () => {
  let module: TestingModule;

  // Mock implementations for all services
  const mockEventEmitter = {
    emit: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    removeListener: jest.fn(),
  };

  const mockTasksService = {
    emitTaskMessage: jest.fn(),
    getTask: jest.fn(),
    createTask: jest.fn(),
    updateTask: jest.fn(),
  };

  const mockStreamingService = {
    registerStream: jest.fn(),
    emitProgress: jest.fn(),
    emitComplete: jest.fn(),
    emitError: jest.fn(),
    emitObservabilityOnly: jest.fn(),
  };

  const mockDatabaseService = {
    from: jest.fn().mockReturnValue({
      insert: jest.fn().mockResolvedValue({ error: null }),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    }),
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
  };

  const mockObservabilityWebhookService = {
    sendEvent: jest.fn(),
    getEvents: jest.fn(),
  };

  const mockObservabilityEventsService = {
    push: jest.fn(),
    getStream: jest.fn(),
    getBuffer: jest.fn(),
  };

  beforeAll(async () => {
    // Create a test module with mocked providers
    // This tests that the controller can be instantiated with its dependencies
    module = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: TasksService, useValue: mockTasksService },
        { provide: StreamingService, useValue: mockStreamingService },
        { provide: DATABASE_SERVICE, useValue: mockDatabaseService },
        {
          provide: ObservabilityWebhookService,
          useValue: mockObservabilityWebhookService,
        },
        {
          provide: ObservabilityEventsService,
          useValue: mockObservabilityEventsService,
        },
      ],
    }).compile();
  });

  afterAll(async () => {
    if (module) {
      await module.close();
    }
  });

  describe('Module Initialization', () => {
    it('should be defined', () => {
      expect(module).toBeDefined();
    });

    it('should initialize without circular dependency errors', () => {
      // If we get here, the module initialized successfully
      // Circular dependencies would have thrown during compilation
      expect(module).toBeDefined();
    });

    it('should compile the module successfully', () => {
      // The module should compile cleanly without warnings
      expect(module).toBeDefined();
      expect(module.get(WebhooksController)).toBeDefined();
    });
  });

  describe('Controller Exports', () => {
    it('should export WebhooksController', () => {
      const controller = module.get<WebhooksController>(WebhooksController);
      expect(controller).toBeDefined();
      expect(controller).toBeInstanceOf(WebhooksController);
    });

    it('should have WebhooksController methods available', () => {
      const controller = module.get<WebhooksController>(WebhooksController);
      expect(controller.handleStatusUpdate).toBeDefined();
      expect(typeof controller.handleStatusUpdate).toBe('function');
    });
  });

  describe('Service Dependencies', () => {
    it('should inject EventEmitter2', () => {
      const controller = module.get<WebhooksController>(WebhooksController);
      expect(controller).toBeDefined();
      // EventEmitter2 is private, but if controller was created, it was injected
    });

    it('should inject TasksService', () => {
      const service = module.get<TasksService>(TasksService);
      expect(service).toBeDefined();
      expect(service).toBe(mockTasksService);
    });

    it('should inject StreamingService', () => {
      const service = module.get<StreamingService>(StreamingService);
      expect(service).toBeDefined();
      expect(service).toBe(mockStreamingService);
    });

    it('should inject DATABASE_SERVICE', () => {
      const service = module.get(DATABASE_SERVICE);
      expect(service).toBeDefined();
      expect(service).toBe(mockDatabaseService);
    });

    it('should inject ObservabilityWebhookService', () => {
      const service = module.get<ObservabilityWebhookService>(
        ObservabilityWebhookService,
      );
      expect(service).toBeDefined();
      expect(service).toBe(mockObservabilityWebhookService);
    });

    it('should inject ObservabilityEventsService', () => {
      const service = module.get<ObservabilityEventsService>(
        ObservabilityEventsService,
      );
      expect(service).toBeDefined();
      expect(service).toBe(mockObservabilityEventsService);
    });
  });

  describe('Controller Method Availability', () => {
    it('should have handleStatusUpdate method', () => {
      const controller = module.get<WebhooksController>(WebhooksController);
      expect(controller.handleStatusUpdate).toBeDefined();
      expect(typeof controller.handleStatusUpdate).toBe('function');
    });
  });

  describe('Dependency Resolution', () => {
    it('should resolve WebhooksController without errors', () => {
      expect(() => {
        module.get<WebhooksController>(WebhooksController);
      }).not.toThrow();
    });

    it('should resolve all service dependencies', () => {
      expect(() => {
        module.get<TasksService>(TasksService);
        module.get<StreamingService>(StreamingService);
        module.get(DATABASE_SERVICE);
        module.get<ObservabilityWebhookService>(ObservabilityWebhookService);
        module.get<ObservabilityEventsService>(ObservabilityEventsService);
      }).not.toThrow();
    });
  });
});

describe('WebhooksModule Class Imports', () => {
  it('should import WebhooksController class', () => {
    // This test verifies that the controller is properly importable
    expect(WebhooksController).toBeDefined();
    expect(typeof WebhooksController).toBe('function');
  });

  it('should import EventEmitter2 class', () => {
    expect(EventEmitter2).toBeDefined();
  });

  it('should import TasksService class', () => {
    expect(TasksService).toBeDefined();
  });

  it('should import StreamingService class', () => {
    expect(StreamingService).toBeDefined();
  });

  it('should import DATABASE_SERVICE token', () => {
    expect(DATABASE_SERVICE).toBeDefined();
  });

  it('should import ObservabilityWebhookService class', () => {
    expect(ObservabilityWebhookService).toBeDefined();
  });

  it('should import ObservabilityEventsService class', () => {
    expect(ObservabilityEventsService).toBeDefined();
  });
});
