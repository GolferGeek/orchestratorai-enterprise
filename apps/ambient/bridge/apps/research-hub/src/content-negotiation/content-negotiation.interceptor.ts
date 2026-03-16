import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request, Response } from 'express';

/**
 * Content Negotiation Interceptor
 *
 * Implements Cloudflare-style content negotiation for AI agents.
 * When a request includes `Accept: text/markdown`, converts the
 * JSON response into a markdown document that agents can consume
 * more efficiently (80-99% fewer tokens than HTML).
 *
 * Priority: text/markdown > application/json > text/html
 */
@Injectable()
export class ContentNegotiationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const accept = req.headers.accept || '';

    const prefersMarkdown = this.prefersMarkdown(accept);

    if (!prefersMarkdown) {
      return next.handle();
    }

    return next.handle().pipe(
      map((data) => {
        res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
        res.setHeader('Vary', 'Accept');
        return this.toMarkdown(data, req.path);
      }),
    );
  }

  private prefersMarkdown(accept: string): boolean {
    // Parse Accept header quality values
    const types = accept.split(',').map((t) => {
      const [type, ...params] = t.trim().split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      return {
        type: type.trim(),
        quality: q ? parseFloat(q.split('=')[1]) : 1.0,
      };
    });

    const md = types.find((t) => t.type === 'text/markdown');
    const json = types.find(
      (t) => t.type === 'application/json' || t.type === '*/*',
    );

    if (!md) return false;
    if (!json) return true;
    return md.quality >= json.quality;
  }

  private toMarkdown(data: unknown, path: string): string {
    if (typeof data === 'string') return data;

    if (Array.isArray(data)) {
      return this.arrayToMarkdown(data, path);
    }

    if (typeof data === 'object' && data !== null) {
      return this.objectToMarkdown(data as Record<string, unknown>, path);
    }

    return String(data);
  }

  private arrayToMarkdown(
    items: unknown[],
    path: string,
  ): string {
    if (items.length === 0) return '*No items found.*\n';

    const first = items[0];
    if (typeof first !== 'object' || first === null) {
      return items.map((item) => `- ${item}`).join('\n') + '\n';
    }

    const records = items as Record<string, unknown>[];
    const lines: string[] = [];

    for (const record of records) {
      const title =
        (record.title as string) ||
        (record.name as string) ||
        (record.id as string) ||
        'Item';
      const id = record.id as string;

      lines.push(`### ${title}`);

      if (record.description || record.summary) {
        lines.push(`${record.description || record.summary}`);
      }

      // Add metadata
      const meta: string[] = [];
      if (record.categoryId) meta.push(`Category: ${record.categoryId}`);
      if (record.signalStrength)
        meta.push(`Signal: ${record.signalStrength}%`);
      if (record.date) meta.push(`Date: ${record.date}`);
      if (record.author) meta.push(`Author: ${record.author}`);
      if (record.source) meta.push(`Source: ${record.source}`);
      if (record.articleCount)
        meta.push(`Articles: ${record.articleCount}`);
      if (meta.length > 0) lines.push(`*${meta.join(' | ')}*`);

      // Only link to detail pages for endpoints that have /:id routes
      // Currently only /api/articles has a detail route
      if (id && path.endsWith('/articles') && !path.includes(id)) {
        lines.push(`[Read full article](${path}/${id})`);
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  private objectToMarkdown(
    obj: Record<string, unknown>,
    path: string,
  ): string {
    const lines: string[] = [];

    const title =
      (obj.title as string) ||
      (obj.name as string) ||
      (obj.personality as string);
    if (title) {
      lines.push(`# ${title}`);
    }

    if (obj.description || obj.summary) {
      lines.push(`${obj.description || obj.summary}`);
      lines.push('');
    }

    // Agent card format
    if (obj.capabilities && Array.isArray(obj.capabilities)) {
      lines.push('## Capabilities');
      for (const cap of obj.capabilities as Record<string, unknown>[]) {
        lines.push(`- **${cap.name}**: ${cap.description}`);
      }
      lines.push('');
    }

    if (obj.endpoints && Array.isArray(obj.endpoints)) {
      lines.push('## Endpoints');
      for (const ep of obj.endpoints as Record<string, unknown>[]) {
        lines.push(`- \`${ep.method} ${ep.path}\` — ${ep.description}`);
      }
      lines.push('');
    }

    // Narrative format
    if (obj.content && typeof obj.content === 'string') {
      lines.push(obj.content as string);
      lines.push('');
    }

    if (obj.themes && Array.isArray(obj.themes)) {
      lines.push('## Themes');
      for (const theme of obj.themes as string[]) {
        lines.push(`- ${theme}`);
      }
      lines.push('');
    }

    // Article detail
    if (obj.sections && Array.isArray(obj.sections)) {
      for (const section of obj.sections as Record<string, unknown>[]) {
        lines.push(`## ${section.heading}`);
        lines.push(section.body as string);
        lines.push('');
      }
    }

    // Generic key-value fallback for unhandled fields
    const handled = new Set([
      'id', 'title', 'name', 'description', 'summary', 'capabilities',
      'endpoints', 'content', 'themes', 'sections', 'personality',
    ]);
    const remaining = Object.entries(obj).filter(
      ([k]) => !handled.has(k),
    );
    if (remaining.length > 0 && lines.length <= 1) {
      // Only add raw fields if we haven't rendered anything structured
      for (const [key, value] of remaining) {
        if (typeof value === 'object') continue;
        lines.push(`**${key}**: ${value}`);
      }
      lines.push('');
    }

    // Protocols (agent card)
    if (obj.protocols && typeof obj.protocols === 'object') {
      lines.push('## Protocols');
      for (const [layer, providers] of Object.entries(
        obj.protocols as Record<string, unknown>,
      )) {
        lines.push(
          `- **${layer}**: ${Array.isArray(providers) ? providers.join(', ') : providers}`,
        );
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}
