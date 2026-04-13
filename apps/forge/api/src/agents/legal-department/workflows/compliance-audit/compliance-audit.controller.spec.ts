import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ComplianceAuditController } from './compliance-audit.controller';

const mockRepository = {
  findByIdForOrg: jest.fn(),
} as any;

describe('ComplianceAuditController', () => {
  let controller: ComplianceAuditController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ComplianceAuditController(mockRepository, undefined);
  });

  // ── Findings Endpoint ───────────────────────────────────────────

  describe('getFindings', () => {
    const findings = [
      {
        id: 'f-1',
        status: 'non-compliant',
        severity: 'critical',
        frameworkSlug: 'gdpr',
        themeId: 'consent',
      },
      {
        id: 'f-2',
        status: 'compliant',
        severity: 'low',
        frameworkSlug: 'gdpr',
        themeId: 'data-rights',
      },
      {
        id: 'f-3',
        status: 'non-compliant',
        severity: 'high',
        frameworkSlug: 'hipaa',
        themeId: 'breach',
      },
      {
        id: 'f-4',
        status: 'partially-compliant',
        severity: 'medium',
        frameworkSlug: 'gdpr',
        themeId: 'consent',
      },
    ];

    beforeEach(() => {
      mockRepository.findByIdForOrg.mockResolvedValue({
        result: { findings },
      });
    });

    it('returns all findings with pagination info', async () => {
      const result = await controller.getFindings(
        'job-1',
        'test-org',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );

      expect(result.total).toBe(4);
      expect(result.findings).toHaveLength(4);
      expect(result.offset).toBe(0);
      expect(result.limit).toBe(50);
    });

    it('filters by framework', async () => {
      const result = await controller.getFindings(
        'job-1',
        'test-org',
        'gdpr',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );

      expect(result.findings).toHaveLength(3);
      expect(
        result.findings.every(
          (f: Record<string, unknown>) => f.frameworkSlug === 'gdpr',
        ),
      ).toBe(true);
    });

    it('filters by status (comma-separated)', async () => {
      const result = await controller.getFindings(
        'job-1',
        'test-org',
        undefined,
        'non-compliant,partially-compliant',
        undefined,
        undefined,
        undefined,
        undefined,
      );

      expect(result.findings).toHaveLength(3);
    });

    it('filters by severity', async () => {
      const result = await controller.getFindings(
        'job-1',
        'test-org',
        undefined,
        undefined,
        'critical',
        undefined,
        undefined,
        undefined,
      );

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]!.id).toBe('f-1');
    });

    it('filters by theme', async () => {
      const result = await controller.getFindings(
        'job-1',
        'test-org',
        undefined,
        undefined,
        undefined,
        'consent',
        undefined,
        undefined,
      );

      expect(result.findings).toHaveLength(2);
    });

    it('supports combined filters', async () => {
      const result = await controller.getFindings(
        'job-1',
        'test-org',
        'gdpr',
        'non-compliant',
        undefined,
        undefined,
        undefined,
        undefined,
      );

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]!.id).toBe('f-1');
    });

    it('supports pagination with offset and limit', async () => {
      const result = await controller.getFindings(
        'job-1',
        'test-org',
        undefined,
        undefined,
        undefined,
        undefined,
        '1',
        '2',
      );

      expect(result.total).toBe(4);
      expect(result.findings).toHaveLength(2);
      expect(result.offset).toBe(1);
      expect(result.limit).toBe(2);
    });

    it('throws NotFoundException for missing job', async () => {
      mockRepository.findByIdForOrg.mockResolvedValue(null);

      await expect(
        controller.getFindings(
          'bad-id',
          'test-org',
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns empty array when job has no findings', async () => {
      mockRepository.findByIdForOrg.mockResolvedValue({ result: {} });

      const result = await controller.getFindings(
        'job-1',
        'test-org',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );

      expect(result.findings).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('throws BadRequestException when orgSlug is missing', async () => {
      await expect(
        controller.getFindings(
          'job-1',
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── Remediation Endpoint ────────────────────────────────────────

  describe('getRemediation', () => {
    it('returns remediation plan from job result', async () => {
      const remediationPlan = [
        {
          findingId: 'f-1',
          priority: 1,
          severity: 'critical',
          effort: 'large',
        },
        { findingId: 'f-2', priority: 2, severity: 'high', effort: 'medium' },
      ];
      mockRepository.findByIdForOrg.mockResolvedValue({
        result: { remediationPlan },
      });

      const result = await controller.getRemediation('job-1', 'test-org');

      expect(result).toEqual(remediationPlan);
      expect(result[0]!.priority).toBe(1);
      expect(result[1]!.priority).toBe(2);
    });

    it('throws NotFoundException for missing job', async () => {
      mockRepository.findByIdForOrg.mockResolvedValue(null);

      await expect(
        controller.getRemediation('bad-id', 'test-org'),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns empty array when no remediation plan', async () => {
      mockRepository.findByIdForOrg.mockResolvedValue({ result: {} });

      const result = await controller.getRemediation('job-1', 'test-org');
      expect(result).toEqual([]);
    });

    it('throws BadRequestException when orgSlug is missing', async () => {
      await expect(
        controller.getRemediation('job-1', undefined),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
