import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  applyInProcessAuthOverrides as applyAuthOverrides,
  resetAuthMocks,
} from '@orchestratorai/auth-client/testing';
import { SentinelController } from './sentinel.controller';
import { SentinelRepository } from './sentinel.repository';
import type {
  SentinelSource,
  SentinelSignal,
  SentinelPortfolioHolding,
  SentinelAlert,
} from './sentinel.types';

const sampleSource: SentinelSource = {
  id: 'src-1',
  org_slug: 'org-a',
  name: 'SEC Enforcement',
  source_type: 'rss',
  url: 'https://example.com/rss',
  poll_interval_minutes: 60,
  practice_areas: ['securities'],
  jurisdictions: ['us-federal'],
  enabled: true,
  last_polled_at: null,
  last_error: null,
  created_at: '2026-04-17T00:00:00Z',
  updated_at: '2026-04-17T00:00:00Z',
};

const sampleSignal: SentinelSignal = {
  id: 'sig-1',
  org_slug: 'org-a',
  source_id: 'src-1',
  title: 'New GDPR Enforcement',
  summary: 'A new enforcement action...',
  full_text: 'Full text here',
  url: 'https://example.com/news/1',
  published_at: '2026-04-16T00:00:00Z',
  signal_type: 'enforcement',
  jurisdictions: ['eu'],
  practice_areas: ['data-privacy'],
  content_hash: 'abc123',
  processed: false,
  ingested_at: '2026-04-17T00:00:00Z',
};

const sampleHolding: SentinelPortfolioHolding = {
  id: 'hold-1',
  org_slug: 'org-a',
  client_name: 'Acme Corp',
  matter_name: 'EU Operations',
  practice_areas: ['data-privacy'],
  jurisdictions: ['eu'],
  key_entities: ['Acme EU GmbH'],
  description: 'EU subsidiary with data processing',
  active: true,
  created_at: '2026-04-17T00:00:00Z',
  updated_at: '2026-04-17T00:00:00Z',
};

const sampleAlert: SentinelAlert = {
  id: 'alert-1',
  org_slug: 'org-a',
  signal_id: 'sig-1',
  portfolio_id: 'hold-1',
  relevance_score: 85,
  severity: 'high',
  urgency: 'this_week',
  summary: 'GDPR enforcement affects Acme EU subsidiary',
  reasoning: 'The enforcement action targets data processors...',
  recommended_action: 'Review DPA for compliance gaps',
  status: 'new',
  created_at: '2026-04-17T00:00:00Z',
  acknowledged_by: null,
  acknowledged_at: null,
};

function makeRepoMock(): jest.Mocked<
  Pick<
    SentinelRepository,
    | 'listSources'
    | 'createSource'
    | 'updateSource'
    | 'deleteSource'
    | 'listSignals'
    | 'listPortfolio'
    | 'createPortfolioHolding'
    | 'updatePortfolioHolding'
    | 'deactivatePortfolioHolding'
    | 'listAlerts'
    | 'getAlertDetail'
    | 'updateAlertStatus'
    | 'upsertPulseTrigger'
    | 'deletePulseTrigger'
  >
> {
  return {
    listSources: jest.fn().mockResolvedValue([sampleSource]),
    createSource: jest.fn().mockResolvedValue(sampleSource),
    updateSource: jest.fn().mockResolvedValue(sampleSource),
    deleteSource: jest.fn().mockResolvedValue(undefined),
    listSignals: jest.fn().mockResolvedValue([sampleSignal]),
    listPortfolio: jest.fn().mockResolvedValue([sampleHolding]),
    createPortfolioHolding: jest.fn().mockResolvedValue(sampleHolding),
    updatePortfolioHolding: jest.fn().mockResolvedValue(sampleHolding),
    deactivatePortfolioHolding: jest.fn().mockResolvedValue(undefined),
    listAlerts: jest.fn().mockResolvedValue([sampleAlert]),
    getAlertDetail: jest.fn().mockResolvedValue({
      alert: sampleAlert,
      signal: sampleSignal,
      portfolio: sampleHolding,
    }),
    updateAlertStatus: jest.fn().mockResolvedValue({
      ...sampleAlert,
      status: 'acknowledged',
    }),
    upsertPulseTrigger: jest
      .fn()
      .mockResolvedValue({ triggerId: 'trigger-1', created: true }),
    deletePulseTrigger: jest.fn().mockResolvedValue(undefined),
  };
}

describe('SentinelController', () => {
  let controller: SentinelController;
  let repo: ReturnType<typeof makeRepoMock>;

  beforeEach(async () => {
    repo = makeRepoMock();
    const module: TestingModule = await applyAuthOverrides(
      Test.createTestingModule({
        controllers: [SentinelController],
        providers: [{ provide: SentinelRepository, useValue: repo }],
      }),
    ).compile();

    controller = module.get(SentinelController);
  });

  afterEach(() => resetAuthMocks());

  // ── Sources ─────────────────────────────────────────────────────────

  describe('listSources', () => {
    it('returns sources for org', async () => {
      const result = await controller.listSources('org-a');
      expect(repo.listSources).toHaveBeenCalledWith('org-a');
      expect(result).toEqual([sampleSource]);
    });

    it('throws if orgSlug missing', async () => {
      await expect(controller.listSources('')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('createSource', () => {
    it('creates a source and syncs Pulse trigger', async () => {
      const body = {
        orgSlug: 'org-a',
        name: 'SEC',
        sourceType: 'rss' as const,
        url: 'https://example.com/rss',
      };
      const result = await controller.createSource(body);
      expect(repo.createSource).toHaveBeenCalledWith('org-a', {
        name: 'SEC',
        sourceType: 'rss',
        url: 'https://example.com/rss',
      });
      expect(result).toEqual(sampleSource);
      expect(repo.upsertPulseTrigger).toHaveBeenCalledWith(sampleSource);
    });

    it('throws if name missing', async () => {
      await expect(
        controller.createSource({
          orgSlug: 'org-a',
          name: '',
          sourceType: 'rss',
          url: 'https://example.com',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('still returns source if trigger sync fails', async () => {
      repo.upsertPulseTrigger.mockRejectedValueOnce(
        new Error('ambient.triggers not found'),
      );
      const body = {
        orgSlug: 'org-a',
        name: 'SEC',
        sourceType: 'rss' as const,
        url: 'https://example.com/rss',
      };
      const result = await controller.createSource(body);
      expect(result).toEqual(sampleSource);
    });
  });

  describe('updateSource', () => {
    it('updates a source and syncs Pulse trigger', async () => {
      const result = await controller.updateSource('src-1', {
        orgSlug: 'org-a',
        enabled: false,
      });
      expect(repo.updateSource).toHaveBeenCalledWith('src-1', 'org-a', {
        enabled: false,
      });
      expect(result).toEqual(sampleSource);
      expect(repo.upsertPulseTrigger).toHaveBeenCalledWith(sampleSource);
    });
  });

  describe('deleteSource', () => {
    it('deletes a source and removes Pulse trigger', async () => {
      const result = await controller.deleteSource('src-1', 'org-a');
      expect(repo.deleteSource).toHaveBeenCalledWith('src-1', 'org-a');
      expect(repo.deletePulseTrigger).toHaveBeenCalledWith('src-1');
      expect(result).toEqual({ deleted: true });
    });
  });

  describe('syncTriggers', () => {
    it('syncs all sources as Pulse triggers', async () => {
      const result = await controller.syncTriggers({ orgSlug: 'org-a' });
      expect(repo.listSources).toHaveBeenCalledWith('org-a');
      expect(repo.upsertPulseTrigger).toHaveBeenCalledWith(sampleSource);
      expect(result).toEqual({ synced: 1 });
    });

    it('throws if orgSlug missing', async () => {
      await expect(controller.syncTriggers({ orgSlug: '' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ── Signals ─────────────────────────────────────────────────────────

  describe('listSignals', () => {
    it('returns signals for org', async () => {
      const result = await controller.listSignals('org-a');
      expect(repo.listSignals).toHaveBeenCalledWith('org-a', {
        sourceId: undefined,
        signalType: undefined,
        limit: undefined,
        offset: undefined,
      });
      expect(result).toEqual([sampleSignal]);
    });
  });

  // ── Portfolio ───────────────────────────────────────────────────────

  describe('listPortfolio', () => {
    it('returns holdings', async () => {
      const result = await controller.listPortfolio('org-a');
      expect(repo.listPortfolio).toHaveBeenCalledWith('org-a', {
        active: undefined,
      });
      expect(result).toEqual([sampleHolding]);
    });
  });

  describe('createPortfolioHolding', () => {
    it('creates a holding', async () => {
      const result = await controller.createPortfolioHolding({
        orgSlug: 'org-a',
        clientName: 'Acme Corp',
      });
      expect(repo.createPortfolioHolding).toHaveBeenCalledWith('org-a', {
        clientName: 'Acme Corp',
      });
      expect(result).toEqual(sampleHolding);
    });
  });

  describe('deactivatePortfolioHolding', () => {
    it('deactivates a holding', async () => {
      const result = await controller.deactivatePortfolioHolding(
        'hold-1',
        'org-a',
      );
      expect(repo.deactivatePortfolioHolding).toHaveBeenCalledWith(
        'hold-1',
        'org-a',
      );
      expect(result).toEqual({ deactivated: true });
    });
  });

  // ── Alerts ──────────────────────────────────────────────────────────

  describe('listAlerts', () => {
    it('returns alerts', async () => {
      const result = await controller.listAlerts('org-a');
      expect(repo.listAlerts).toHaveBeenCalled();
      expect(result).toEqual([sampleAlert]);
    });
  });

  describe('getAlertDetail', () => {
    it('returns detail with signal + portfolio', async () => {
      const result = await controller.getAlertDetail('alert-1', 'org-a');
      expect(result).toHaveProperty('alert');
      expect(result).toHaveProperty('signal');
      expect(result).toHaveProperty('portfolio');
    });

    it('throws if not found', async () => {
      repo.getAlertDetail.mockResolvedValueOnce(null);
      await expect(
        controller.getAlertDetail('missing', 'org-a'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateAlertStatus', () => {
    it('updates status', async () => {
      const result = await controller.updateAlertStatus('alert-1', {
        orgSlug: 'org-a',
        status: 'acknowledged',
        acknowledgedBy: 'user-1',
      });
      expect(repo.updateAlertStatus).toHaveBeenCalledWith(
        'alert-1',
        'org-a',
        'acknowledged',
        'user-1',
      );
      expect(result.status).toBe('acknowledged');
    });

    it('rejects invalid status', async () => {
      await expect(
        controller.updateAlertStatus('alert-1', {
          orgSlug: 'org-a',
          status: 'invalid' as any,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
