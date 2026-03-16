import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FeatureFlagService, FeatureFlagContext } from './feature-flag.service';

function makeConfigService(
  values: Record<string, string | undefined>,
): ConfigService {
  return {
    get: jest.fn(
      (key: string, defaultValue?: string) => values[key] ?? defaultValue,
    ),
  } as unknown as ConfigService;
}

describe('FeatureFlagService', () => {
  let _service: FeatureFlagService;

  function buildService(
    envValues: Record<string, string | undefined>,
  ): FeatureFlagService {
    const configService = makeConfigService(envValues);
    return new FeatureFlagService(configService);
  }

  describe('isEnabled', () => {
    it('should return false when flag is disabled', () => {
      const svc = buildService({ FEATURE_FLAG_MY_FEATURE_ENABLED: 'false' });
      expect(svc.isEnabled('MY_FEATURE')).toBe(false);
    });

    it('should return false when flag env var is not set (default false)', () => {
      const svc = buildService({});
      expect(svc.isEnabled('NONEXISTENT_FLAG')).toBe(false);
    });

    it('should return true when flag is enabled with no other rules', () => {
      const svc = buildService({ FEATURE_FLAG_MY_FEATURE_ENABLED: 'true' });
      expect(svc.isEnabled('MY_FEATURE')).toBe(true);
    });

    it('should return false when user is excluded', () => {
      const svc = buildService({
        FEATURE_FLAG_MY_FEATURE_ENABLED: 'true',
        FEATURE_FLAG_MY_FEATURE_EXCLUDE_USERS:
          'user-excluded-1,user-excluded-2',
      });

      const context: FeatureFlagContext = { userId: 'user-excluded-1' };
      expect(svc.isEnabled('MY_FEATURE', context)).toBe(false);
    });

    it('should return false when organization is excluded', () => {
      const svc = buildService({
        FEATURE_FLAG_MY_FEATURE_ENABLED: 'true',
        FEATURE_FLAG_MY_FEATURE_EXCLUDE_ORGANIZATIONS: 'org-blocked,org-banned',
      });

      const context: FeatureFlagContext = { organizationId: 'org-blocked' };
      expect(svc.isEnabled('MY_FEATURE', context)).toBe(false);
    });

    it('should return true for non-excluded users when exclusions are set', () => {
      const svc = buildService({
        FEATURE_FLAG_MY_FEATURE_ENABLED: 'true',
        FEATURE_FLAG_MY_FEATURE_EXCLUDE_USERS: 'excluded-user',
      });

      const context: FeatureFlagContext = { userId: 'normal-user' };
      expect(svc.isEnabled('MY_FEATURE', context)).toBe(true);
    });

    it('should return true for specifically targeted user', () => {
      const svc = buildService({
        FEATURE_FLAG_MY_FEATURE_ENABLED: 'true',
        FEATURE_FLAG_MY_FEATURE_TARGET_USERS: 'vip-user-1,vip-user-2',
        FEATURE_FLAG_MY_FEATURE_ROLLOUT_PERCENTAGE: '0', // 0% rollout but user is targeted
      });

      const context: FeatureFlagContext = { userId: 'vip-user-1' };
      expect(svc.isEnabled('MY_FEATURE', context)).toBe(true);
    });

    it('should return true for specifically targeted organization', () => {
      const svc = buildService({
        FEATURE_FLAG_MY_FEATURE_ENABLED: 'true',
        FEATURE_FLAG_MY_FEATURE_TARGET_ORGANIZATIONS: 'beta-org',
        FEATURE_FLAG_MY_FEATURE_ROLLOUT_PERCENTAGE: '0',
      });

      const context: FeatureFlagContext = { organizationId: 'beta-org' };
      expect(svc.isEnabled('MY_FEATURE', context)).toBe(true);
    });

    it('should return true for 100% rollout', () => {
      const svc = buildService({
        FEATURE_FLAG_MY_FEATURE_ENABLED: 'true',
        FEATURE_FLAG_MY_FEATURE_ROLLOUT_PERCENTAGE: '100',
      });

      const context: FeatureFlagContext = { userId: 'any-user' };
      expect(svc.isEnabled('MY_FEATURE', context)).toBe(true);
    });

    it('should return false for 0% rollout with no targeting', () => {
      const svc = buildService({
        FEATURE_FLAG_MY_FEATURE_ENABLED: 'true',
        FEATURE_FLAG_MY_FEATURE_ROLLOUT_PERCENTAGE: '0',
      });

      const context: FeatureFlagContext = { userId: 'any-user' };
      expect(svc.isEnabled('MY_FEATURE', context)).toBe(false);
    });

    it('should produce deterministic results for same user and flag', () => {
      const svc = buildService({
        FEATURE_FLAG_MY_FEATURE_ENABLED: 'true',
        FEATURE_FLAG_MY_FEATURE_ROLLOUT_PERCENTAGE: '50',
      });

      const context: FeatureFlagContext = { userId: 'deterministic-user-123' };
      const result1 = svc.isEnabled('MY_FEATURE', context);
      const result2 = svc.isEnabled('MY_FEATURE', context);
      const result3 = svc.isEnabled('MY_FEATURE', context);

      // Same input always produces same result
      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
    });

    it('should use empty context by default', () => {
      const svc = buildService({ FEATURE_FLAG_MY_FEATURE_ENABLED: 'true' });

      // Should not throw when called without context
      expect(() => svc.isEnabled('MY_FEATURE')).not.toThrow();
    });

    it('should check exclusions before targeting', () => {
      // User is both excluded and targeted — exclusion wins
      const svc = buildService({
        FEATURE_FLAG_MY_FEATURE_ENABLED: 'true',
        FEATURE_FLAG_MY_FEATURE_EXCLUDE_USERS: 'conflicted-user',
        FEATURE_FLAG_MY_FEATURE_TARGET_USERS: 'conflicted-user',
      });

      const context: FeatureFlagContext = { userId: 'conflicted-user' };
      // Exclusion is checked first, so user is excluded
      expect(svc.isEnabled('MY_FEATURE', context)).toBe(false);
    });
  });

  describe('isSovereignRoutingEnabled', () => {
    it('should delegate to isEnabled with SOVEREIGN_ROUTING flag', () => {
      const svc = buildService({
        FEATURE_FLAG_SOVEREIGN_ROUTING_ENABLED: 'true',
      });
      expect(svc.isSovereignRoutingEnabled()).toBe(true);
    });

    it('should return false when SOVEREIGN_ROUTING is disabled', () => {
      const svc = buildService({
        FEATURE_FLAG_SOVEREIGN_ROUTING_ENABLED: 'false',
      });
      expect(svc.isSovereignRoutingEnabled()).toBe(false);
    });

    it('should pass context through to isEnabled', () => {
      const svc = buildService({
        FEATURE_FLAG_SOVEREIGN_ROUTING_ENABLED: 'true',
        FEATURE_FLAG_SOVEREIGN_ROUTING_TARGET_ORGANIZATIONS: 'sovereign-org',
        FEATURE_FLAG_SOVEREIGN_ROUTING_ROLLOUT_PERCENTAGE: '0',
      });

      const enabledContext: FeatureFlagContext = {
        organizationId: 'sovereign-org',
      };
      const disabledContext: FeatureFlagContext = {
        organizationId: 'other-org',
      };

      expect(svc.isSovereignRoutingEnabled(enabledContext)).toBe(true);
      expect(svc.isSovereignRoutingEnabled(disabledContext)).toBe(false);
    });
  });

  describe('getAllFlags', () => {
    it('should return config for known flags', () => {
      const svc = buildService({
        FEATURE_FLAG_SOVEREIGN_ROUTING_ENABLED: 'true',
      });

      const flags = svc.getAllFlags();

      expect(flags).toHaveProperty('SOVEREIGN_ROUTING');
      expect(flags['SOVEREIGN_ROUTING']!.enabled).toBe(true);
    });

    it('should return disabled config for unknown/unset flags', () => {
      const svc = buildService({});

      const flags = svc.getAllFlags();

      expect(flags['SOVEREIGN_ROUTING']!.enabled).toBe(false);
    });
  });

  describe('NestJS module integration', () => {
    it('should be instantiated via NestJS DI', async () => {
      const configService = makeConfigService({});

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          FeatureFlagService,
          {
            provide: ConfigService,
            useValue: configService,
          },
        ],
      }).compile();

      const svc = module.get<FeatureFlagService>(FeatureFlagService);
      expect(svc).toBeDefined();
      expect(svc).toBeInstanceOf(FeatureFlagService);
    });
  });
});
