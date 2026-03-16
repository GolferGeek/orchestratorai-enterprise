import { Injectable } from '@nestjs/common';
import { AgentRuntimeDefinition } from '../interfaces/agent.interface';
import { TaskRequestDto } from '@agent2agent/dto/task-request.dto';
import { RedactionPatternsRepository } from '../repositories/redaction-patterns.repository';

interface RedactionOptions {
  // When true, skip org/DB regex redactions (local route bypass)
  isLocal?: boolean;
  organizationSlug?: string | null;
  agentSlug?: string | null;
}

@Injectable()
export class AgentRuntimeRedactionService {
  constructor(private readonly redactionRepo: RedactionPatternsRepository) {}

  async redact(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    options: RedactionOptions = {},
  ): Promise<TaskRequestDto> {
    const cfg =
      (definition.config as Record<string, unknown> | undefined) || {};
    const transforms = cfg.transforms as Record<string, unknown> | undefined;
    const redaction = transforms?.redaction as
      | Record<string, unknown>
      | undefined;
    const rawFields = redaction?.fields as unknown[] | undefined;
    const fields: string[] = (rawFields || []).filter(
      (f): f is string => typeof f === 'string',
    );

    let next: TaskRequestDto = request;

    // Apply org/DB regex redactions to userMessage unless local route
    const shouldApplyDbPatterns = options.isLocal !== true;
    if (shouldApplyDbPatterns && typeof next.userMessage === 'string') {
      const orgSlug =
        Array.isArray(definition.organizationSlug) &&
        definition.organizationSlug.length > 0
          ? definition.organizationSlug[0]
          : null;
      const redacted = await this.applyOrgPatterns(
        orgSlug ?? null,
        next.userMessage,
      );
      if (redacted !== next.userMessage) {
        next = { ...next, userMessage: redacted };
      }
    }

    // Redact userMessage for obvious secrets
    if (typeof next.userMessage === 'string') {
      const masked = this.redactString(next.userMessage);
      if (masked !== request.userMessage) {
        next = { ...next, userMessage: masked };
      }
    }

    // Redact specific fields from payload.normalized if configured
    if (
      fields.length &&
      next.payload?.normalized &&
      typeof next.payload.normalized === 'object'
    ) {
      const copy: Record<string, unknown> = JSON.parse(
        JSON.stringify(next.payload.normalized),
      ) as Record<string, unknown>;
      for (const path of fields) {
        this.maskPath(copy, path, 'REDACTED');
      }
      next = {
        ...next,
        payload: { ...(next.payload || {}), normalized: copy },
      };
    }

    return next;
  }

  private redactString(input: string): string {
    let s = input;
    const patterns: Array<[RegExp, string]> = [
      [/sk-[A-Za-z0-9-_]{10,}/g, 'sk-REDACTED'],
      [/Bearer\s+[A-Za-z0-9-_.]+/gi, 'Bearer REDACTED'],
      [/\b\d{13,19}\b/g, '[REDACTED_NUMBER]'],
    ];
    for (const [re, rep] of patterns) s = s.replace(re, rep);
    return s;
  }

  private async applyOrgPatterns(
    organizationSlug: string | null,
    text: string,
  ): Promise<string> {
    try {
      const records =
        await this.redactionRepo.listByOrganization(organizationSlug);
      if (!records || records.length === 0) return text;

      let s = text;
      for (const rec of records) {
        const source = rec.pattern?.trim();
        if (!source) continue;
        const flags = (rec.flags || 'g').includes('g')
          ? rec.flags || 'g'
          : `${rec.flags || ''}g`;
        let re: RegExp | null = null;
        try {
          re = new RegExp(source, flags);
        } catch {
          // Skip invalid regex rows
          continue;
        }
        const replacement = rec.replacement ?? '[REDACTED]';
        s = s.replace(re, replacement);
      }
      return s;
    } catch {
      return text;
    }
  }

  private maskPath(obj: Record<string, unknown>, path: string, value: string) {
    const normalized = path.replace(/\[(\d+)\]/g, '.$1');
    const parts: Array<string | number> = normalized
      .split('.')
      .filter((segment) => segment.length > 0)
      .map((segment) => {
        const numeric = Number(segment);
        return Number.isNaN(numeric) ? segment : numeric;
      });
    if (!parts.length) return;
    let cur: unknown = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (cur == null) return;
      const key = p as string | number;
      cur = (cur as Record<string | number, unknown>)[key];
      if (cur == null) return;
    }
    const last = parts[parts.length - 1] as string | number;
    if (cur != null) {
      if (typeof last === 'number') {
        if (Array.isArray(cur) && last < cur.length) cur[last] = value;
      } else if (Object.prototype.hasOwnProperty.call(cur, last)) {
        (cur as Record<string, unknown>)[last] = value;
      }
    }
  }
}
